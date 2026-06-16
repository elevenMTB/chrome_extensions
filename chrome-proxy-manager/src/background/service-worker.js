import { ensureConfig, getConfig, saveConfig } from "../core/config.js";
import { applyProxyConfig } from "../core/proxy.js";

chrome.runtime.onInstalled.addListener(() => {
  ensureConfig()
    .then(applyProxyConfig)
    .catch((error) => console.error("Failed to initialize proxy config:", error));
});

chrome.runtime.onStartup.addListener(() => {
  getConfig()
    .then(applyProxyConfig)
    .catch((error) => console.error("Failed to apply proxy config on startup:", error));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function handleMessage(message) {
  if (!message || typeof message !== "object") {
    throw new Error("Invalid message.");
  }

  if (message.type === "GET_CONFIG") {
    return getConfig();
  }

  if (message.type === "SAVE_CONFIG") {
    const config = await saveConfig(message.config);
    const status = await applyProxyConfig(config);
    return { config, status };
  }

  if (message.type === "APPLY_CONFIG") {
    const config = await getConfig();
    const status = await applyProxyConfig(config);
    return { config, status };
  }

  throw new Error(`Unsupported message type: ${message.type}`);
}
