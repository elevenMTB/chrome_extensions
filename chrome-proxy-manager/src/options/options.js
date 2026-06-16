import {
  createId,
  normalizeConfig,
  normalizeProxy,
  normalizeRule,
  validateProxy,
  validateRule
} from "../core/config.js";
import { findMatchingRule } from "../core/matcher.js";

let config;

const enabledInput = $("#enabledInput");
const modeInput = $("#modeInput");
const selectedProxyInput = $("#selectedProxyInput");
const saveButton = $("#saveButton");
const message = $("#message");

const proxyForm = $("#proxyForm");
const proxyIdInput = $("#proxyIdInput");
const proxyNameInput = $("#proxyNameInput");
const proxyTypeInput = $("#proxyTypeInput");
const proxyHostInput = $("#proxyHostInput");
const proxyPortInput = $("#proxyPortInput");
const proxyEnabledInput = $("#proxyEnabledInput");
const proxyList = $("#proxyList");
const resetProxyFormButton = $("#resetProxyFormButton");

const ruleForm = $("#ruleForm");
const ruleIdInput = $("#ruleIdInput");
const ruleNameInput = $("#ruleNameInput");
const ruleTypeInput = $("#ruleTypeInput");
const rulePatternInput = $("#rulePatternInput");
const ruleProxyInput = $("#ruleProxyInput");
const ruleEnabledInput = $("#ruleEnabledInput");
const ruleList = $("#ruleList");
const resetRuleFormButton = $("#resetRuleFormButton");

const testHostInput = $("#testHostInput");
const testButton = $("#testButton");
const testResult = $("#testResult");
const exportButton = $("#exportButton");
const importInput = $("#importInput");

document.addEventListener("DOMContentLoaded", init);
saveButton.addEventListener("click", saveSettings);
enabledInput.addEventListener("change", syncTopControls);
modeInput.addEventListener("change", syncTopControls);
selectedProxyInput.addEventListener("change", syncTopControls);
proxyForm.addEventListener("submit", saveProxy);
ruleForm.addEventListener("submit", saveRule);
resetProxyFormButton.addEventListener("click", resetProxyForm);
resetRuleFormButton.addEventListener("click", resetRuleForm);
testButton.addEventListener("click", testHost);
exportButton.addEventListener("click", exportConfig);
importInput.addEventListener("change", importConfig);

async function init() {
  try {
    config = await sendMessage({ type: "GET_CONFIG" });
    render();
  } catch (error) {
    showMessage(error.message, true);
  }
}

function render() {
  renderTopControls();
  renderProxySelects();
  renderProxyList();
  renderRuleList();
}

function renderTopControls() {
  enabledInput.checked = config.enabled;
  modeInput.value = config.mode;
}

function renderProxySelects() {
  const enabledProxies = config.proxies.filter((proxy) => proxy.enabled);
  const proxyOptions = enabledProxies.length
    ? enabledProxies.map((proxy) => new Option(`${proxy.name} (${proxy.type})`, proxy.id))
    : [new Option("暂无可用代理", "")];

  selectedProxyInput.replaceChildren(...proxyOptions.map((option) => option.cloneNode(true)));
  ruleProxyInput.replaceChildren(...proxyOptions.map((option) => option.cloneNode(true)));

  selectedProxyInput.value = enabledProxies.some((proxy) => proxy.id === config.selectedProxyId)
    ? config.selectedProxyId
    : enabledProxies[0]?.id || "";

  ruleProxyInput.value = ruleProxyInput.value || enabledProxies[0]?.id || "";
}

function renderProxyList() {
  if (!config.proxies.length) {
    proxyList.innerHTML = emptyText("暂无代理，请先新增一个代理。");
    return;
  }

  proxyList.replaceChildren(
    ...config.proxies.map((proxy) => {
      const item = document.createElement("article");
      item.className = `item ${proxy.enabled ? "" : "muted"}`;
      item.innerHTML = `
        <div>
          <h3>${escapeHtml(proxy.name)}</h3>
          <p>${proxy.type.toUpperCase()} ${escapeHtml(proxy.host)}:${proxy.port} · ${proxy.enabled ? "已启用" : "已停用"}</p>
        </div>
        <div class="item-actions">
          <button type="button" data-action="edit-proxy" data-id="${proxy.id}">编辑</button>
          <button type="button" data-action="toggle-proxy" data-id="${proxy.id}" class="secondary">${proxy.enabled ? "停用" : "启用"}</button>
          <button type="button" data-action="delete-proxy" data-id="${proxy.id}" class="danger">删除</button>
        </div>
      `;
      return item;
    })
  );

  bindListActions(proxyList);
}

function renderRuleList() {
  if (!config.rules.length) {
    ruleList.innerHTML = emptyText("暂无规则，未匹配域名会使用 DIRECT。");
    return;
  }

  const orderedRules = [...config.rules].sort((left, right) => left.priority - right.priority);
  ruleList.replaceChildren(
    ...orderedRules.map((rule, index) => {
      const proxy = config.proxies.find((item) => item.id === rule.proxyId);
      const item = document.createElement("article");
      item.className = `item ${rule.enabled ? "" : "muted"}`;
      item.innerHTML = `
        <div>
          <h3>${escapeHtml(rule.name)}</h3>
          <p>${typeName(rule.type)}：${escapeHtml(rule.pattern)} · ${proxy ? escapeHtml(proxy.name) : "代理不存在"} · ${rule.enabled ? "已启用" : "已停用"}</p>
        </div>
        <div class="item-actions">
          <button type="button" data-action="move-rule-up" data-id="${rule.id}" class="secondary" ${index === 0 ? "disabled" : ""}>上移</button>
          <button type="button" data-action="move-rule-down" data-id="${rule.id}" class="secondary" ${index === orderedRules.length - 1 ? "disabled" : ""}>下移</button>
          <button type="button" data-action="edit-rule" data-id="${rule.id}">编辑</button>
          <button type="button" data-action="toggle-rule" data-id="${rule.id}" class="secondary">${rule.enabled ? "停用" : "启用"}</button>
          <button type="button" data-action="delete-rule" data-id="${rule.id}" class="danger">删除</button>
        </div>
      `;
      return item;
    })
  );

  bindListActions(ruleList);
}

function syncTopControls() {
  config.enabled = enabledInput.checked;
  config.mode = modeInput.value;
  config.selectedProxyId = selectedProxyInput.value;
}

async function saveSettings() {
  syncTopControls();
  await saveAndApply("配置已保存并应用");
}

async function saveProxy(event) {
  event.preventDefault();

  const proxy = normalizeProxy({
    id: proxyIdInput.value || createId("proxy"),
    name: proxyNameInput.value,
    type: proxyTypeInput.value,
    host: proxyHostInput.value,
    port: Number(proxyPortInput.value),
    enabled: proxyEnabledInput.checked
  });
  const errors = validateProxy(proxy);

  if (errors.length) {
    showMessage(errors.join("；"), true);
    return;
  }

  const index = config.proxies.findIndex((item) => item.id === proxy.id);
  if (index >= 0) {
    config.proxies[index] = proxy;
  } else {
    config.proxies.push(proxy);
  }

  if (!config.selectedProxyId || !config.proxies.some((item) => item.id === config.selectedProxyId)) {
    config.selectedProxyId = proxy.id;
  }

  resetProxyForm();
  await saveAndApply("代理已保存");
}

async function saveRule(event) {
  event.preventDefault();

  const existingPriority = config.rules.find((item) => item.id === ruleIdInput.value)?.priority;
  const rule = normalizeRule({
    id: ruleIdInput.value || createId("rule"),
    name: ruleNameInput.value,
    type: ruleTypeInput.value,
    pattern: rulePatternInput.value,
    proxyId: ruleProxyInput.value,
    enabled: ruleEnabledInput.checked,
    priority: existingPriority ?? nextRulePriority()
  });
  const errors = validateRule(rule, config);

  if (errors.length) {
    showMessage(errors.join("；"), true);
    return;
  }

  const index = config.rules.findIndex((item) => item.id === rule.id);
  if (index >= 0) {
    config.rules[index] = rule;
  } else {
    config.rules.push(rule);
  }

  resetRuleForm();
  await saveAndApply("规则已保存");
}

function resetProxyForm() {
  proxyForm.reset();
  proxyIdInput.value = "";
  proxyTypeInput.value = "http";
  proxyEnabledInput.checked = true;
}

function resetRuleForm() {
  ruleForm.reset();
  ruleIdInput.value = "";
  ruleTypeInput.value = "exact";
  ruleEnabledInput.checked = true;
  renderProxySelects();
}

async function handleAction(action, id) {
  if (action === "edit-proxy") {
    editProxy(id);
    return;
  }

  if (action === "toggle-proxy") {
    const proxy = config.proxies.find((item) => item.id === id);
    proxy.enabled = !proxy.enabled;
    await saveAndApply("代理状态已更新");
    return;
  }

  if (action === "delete-proxy") {
    await deleteProxy(id);
    return;
  }

  if (action === "edit-rule") {
    editRule(id);
    return;
  }

  if (action === "toggle-rule") {
    const rule = config.rules.find((item) => item.id === id);
    rule.enabled = !rule.enabled;
    await saveAndApply("规则状态已更新");
    return;
  }

  if (action === "delete-rule") {
    config.rules = config.rules.filter((item) => item.id !== id);
    await saveAndApply("规则已删除");
    return;
  }

  if (action === "move-rule-up" || action === "move-rule-down") {
    moveRule(id, action === "move-rule-up" ? -1 : 1);
    await saveAndApply("规则顺序已更新");
  }
}

function editProxy(id) {
  const proxy = config.proxies.find((item) => item.id === id);
  if (!proxy) {
    return;
  }

  proxyIdInput.value = proxy.id;
  proxyNameInput.value = proxy.name;
  proxyTypeInput.value = proxy.type;
  proxyHostInput.value = proxy.host;
  proxyPortInput.value = proxy.port;
  proxyEnabledInput.checked = proxy.enabled;
  proxyNameInput.focus();
}

async function deleteProxy(id) {
  const isUsed = config.rules.some((rule) => rule.proxyId === id);
  if (isUsed) {
    showMessage("该代理仍被规则引用，请先删除或修改对应规则", true);
    return;
  }

  if (!confirm("确认删除该代理吗？")) {
    return;
  }

  config.proxies = config.proxies.filter((item) => item.id !== id);
  if (config.selectedProxyId === id) {
    config.selectedProxyId = config.proxies.find((item) => item.enabled)?.id || "";
  }

  await saveAndApply("代理已删除");
}

function editRule(id) {
  const rule = config.rules.find((item) => item.id === id);
  if (!rule) {
    return;
  }

  ruleIdInput.value = rule.id;
  ruleNameInput.value = rule.name;
  ruleTypeInput.value = rule.type;
  rulePatternInput.value = rule.pattern;
  ruleProxyInput.value = rule.proxyId;
  ruleEnabledInput.checked = rule.enabled;
  ruleNameInput.focus();
}

function moveRule(id, direction) {
  const orderedRules = [...config.rules].sort((left, right) => left.priority - right.priority);
  const index = orderedRules.findIndex((rule) => rule.id === id);
  const targetIndex = index + direction;

  if (index < 0 || targetIndex < 0 || targetIndex >= orderedRules.length) {
    return;
  }

  const currentPriority = orderedRules[index].priority;
  orderedRules[index].priority = orderedRules[targetIndex].priority;
  orderedRules[targetIndex].priority = currentPriority;
  config.rules = orderedRules;
}

function testHost() {
  const result = findMatchingRule(config, testHostInput.value);
  const lines = [
    `Host: ${result.host || "无效输入"}`,
    `命中规则: ${result.rule ? result.rule.name : "未命中"}`,
    `使用代理: ${result.proxy ? `${result.proxy.name} (${result.proxy.type})` : "DIRECT"}`,
    `PAC 返回: ${result.pac}`
  ];

  testResult.textContent = lines.join("\n");
}

function exportConfig() {
  const blob = new Blob([JSON.stringify(config, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "chrome-proxy-manager-config.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function importConfig(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const importedConfig = normalizeConfig(JSON.parse(text));
    const errors = validateConfig(importedConfig);

    if (errors.length) {
      showMessage(errors.join("；"), true);
      return;
    }

    if (!confirm("导入会覆盖当前配置，确认继续吗？")) {
      return;
    }

    config = importedConfig;
    await saveAndApply("配置已导入并应用");
  } catch (error) {
    showMessage(`导入失败：${error.message}`, true);
  } finally {
    importInput.value = "";
  }
}

async function saveAndApply(successMessage) {
  try {
    const result = await sendMessage({ type: "SAVE_CONFIG", config });
    config = result.config;
    render();
    showMessage(`${successMessage}。${result.status.message}`);
  } catch (error) {
    showMessage(error.message, true);
  }
}

function validateConfig(targetConfig) {
  const errors = [];

  for (const proxy of targetConfig.proxies) {
    errors.push(...validateProxy(proxy).map((error) => `${proxy.name || proxy.id}: ${error}`));
  }

  for (const rule of targetConfig.rules) {
    errors.push(...validateRule(rule, targetConfig).map((error) => `${rule.name || rule.id}: ${error}`));
  }

  return errors;
}

function bindListActions(container) {
  container.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      handleAction(button.dataset.action, button.dataset.id).catch((error) => {
        showMessage(error.message, true);
      });
    });
  });
}

function nextRulePriority() {
  return Math.max(0, ...config.rules.map((rule) => rule.priority)) + 10;
}

function typeName(type) {
  return {
    exact: "精确域名",
    wildcard: "通配符",
    keyword: "关键词"
  }[type] || type;
}

function emptyText(text) {
  return `<div class="item"><p>${escapeHtml(text)}</p></div>`;
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#dc2626" : "#2563eb";
}

function sendMessage(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      if (!response?.ok) {
        reject(new Error(response?.error || "操作失败"));
        return;
      }

      resolve(response.result);
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function $(selector) {
  return document.querySelector(selector);
}
