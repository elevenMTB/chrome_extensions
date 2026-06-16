import { generatePacScript } from "./pac.js";

function proxySettingsSet(value) {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.set({ value, scope: "regular" }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
}

export function clearProxySettings() {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.clear({ scope: "regular" }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
}

export async function applyProxyConfig(config) {
  if (!config.enabled) {
    await clearProxySettings();
    return {
      mode: "off",
      message: "插件已关闭，已清除 Chrome 代理设置"
    };
  }

  if (config.mode === "direct") {
    await proxySettingsSet({ mode: "direct" });
    return {
      mode: "direct",
      message: "已切换为全部直连"
    };
  }

  if (config.mode === "global") {
    const proxy = config.proxies.find(
      (item) => item.id === config.selectedProxyId && item.enabled
    );

    if (!proxy) {
      await proxySettingsSet({ mode: "direct" });
      return {
        mode: "direct",
        message: "全局代理不可用，已回退到全部直连"
      };
    }

    await proxySettingsSet({
      mode: "fixed_servers",
      rules: {
        singleProxy: {
          scheme: proxy.type,
          host: proxy.host,
          port: proxy.port
        }
      }
    });

    return {
      mode: "global",
      message: `已切换为全局代理：${proxy.name}`
    };
  }

  const pacScript = generatePacScript(config);

  await proxySettingsSet({
    mode: "pac_script",
    pacScript: {
      data: pacScript
    }
  });

  return {
    mode: "rule",
    message: "已切换为按规则匹配"
  };
}
