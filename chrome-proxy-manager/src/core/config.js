export const STORAGE_KEY = "appConfig";

export const DEFAULT_CONFIG = {
  enabled: false,
  mode: "rule",
  selectedProxyId: "",
  proxies: [],
  rules: [],
  version: 1
};

export const PROXY_TYPES = ["http", "https", "socks5"];
export const RULE_TYPES = ["exact", "wildcard", "keyword"];
export const PROXY_MODES = ["direct", "global", "rule"];

function getChromeStorage() {
  if (!globalThis.chrome?.storage?.local) {
    throw new Error("chrome.storage.local is not available.");
  }

  return globalThis.chrome.storage.local;
}

function storageGet(key) {
  const storage = getChromeStorage();

  return new Promise((resolve, reject) => {
    storage.get(key, (items) => {
      const error = globalThis.chrome.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(items);
    });
  });
}

function storageSet(items) {
  const storage = getChromeStorage();

  return new Promise((resolve, reject) => {
    storage.set(items, () => {
      const error = globalThis.chrome.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
}

export function createId(prefix) {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
}

export function normalizeConfig(input) {
  const raw = input && typeof input === "object" ? input : {};
  const proxies = Array.isArray(raw.proxies) ? raw.proxies : [];
  const rules = Array.isArray(raw.rules) ? raw.rules : [];

  return {
    enabled: Boolean(raw.enabled),
    mode: PROXY_MODES.includes(raw.mode) ? raw.mode : DEFAULT_CONFIG.mode,
    selectedProxyId: typeof raw.selectedProxyId === "string" ? raw.selectedProxyId : "",
    proxies: proxies.map(normalizeProxy).filter(Boolean),
    rules: rules.map(normalizeRule).filter(Boolean),
    version: Number.isInteger(raw.version) ? raw.version : DEFAULT_CONFIG.version
  };
}

export function normalizeProxy(proxy) {
  if (!proxy || typeof proxy !== "object") {
    return null;
  }

  const port = Number(proxy.port);

  return {
    id: typeof proxy.id === "string" && proxy.id ? proxy.id : createId("proxy"),
    name: typeof proxy.name === "string" ? proxy.name.trim() : "",
    type: PROXY_TYPES.includes(proxy.type) ? proxy.type : "http",
    host: typeof proxy.host === "string" ? proxy.host.trim() : "",
    port: Number.isInteger(port) ? port : 0,
    enabled: proxy.enabled !== false
  };
}

export function normalizeRule(rule) {
  if (!rule || typeof rule !== "object") {
    return null;
  }

  const priority = Number(rule.priority);

  return {
    id: typeof rule.id === "string" && rule.id ? rule.id : createId("rule"),
    name: typeof rule.name === "string" ? rule.name.trim() : "",
    type: RULE_TYPES.includes(rule.type) ? rule.type : "exact",
    pattern: typeof rule.pattern === "string" ? rule.pattern.trim() : "",
    proxyId: typeof rule.proxyId === "string" ? rule.proxyId : "",
    enabled: rule.enabled !== false,
    priority: Number.isFinite(priority) ? priority : Date.now()
  };
}

export async function getConfig() {
  const items = await storageGet(STORAGE_KEY);
  return normalizeConfig(items[STORAGE_KEY] || DEFAULT_CONFIG);
}

export async function saveConfig(config) {
  const normalized = normalizeConfig(config);
  await storageSet({ [STORAGE_KEY]: normalized });
  return normalized;
}

export async function ensureConfig() {
  const config = await getConfig();
  await saveConfig(config);
  return config;
}

export function validateProxy(proxy) {
  const errors = [];

  if (!proxy.name) {
    errors.push("代理名称不能为空");
  }

  if (!PROXY_TYPES.includes(proxy.type)) {
    errors.push("代理类型不合法");
  }

  if (!proxy.host) {
    errors.push("代理 Host 不能为空");
  }

  if (!Number.isInteger(proxy.port) || proxy.port < 1 || proxy.port > 65535) {
    errors.push("代理端口必须是 1-65535 的整数");
  }

  return errors;
}

export function validateRule(rule, config) {
  const errors = [];
  const proxy = config.proxies.find((item) => item.id === rule.proxyId);

  if (!rule.name) {
    errors.push("规则名称不能为空");
  }

  if (!RULE_TYPES.includes(rule.type)) {
    errors.push("规则类型不合法");
  }

  if (!rule.pattern) {
    errors.push("匹配内容不能为空");
  }

  if (!proxy) {
    errors.push("规则必须绑定一个存在的代理");
  } else if (!proxy.enabled) {
    errors.push("规则绑定的代理已停用");
  }

  if (rule.type === "keyword" && rule.pattern.length < 2) {
    errors.push("关键词至少需要 2 个字符");
  }

  return errors;
}
