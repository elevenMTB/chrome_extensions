let config;

const enabledInput = document.querySelector("#enabledInput");
const modeInput = document.querySelector("#modeInput");
const proxyInput = document.querySelector("#proxyInput");
const statusText = document.querySelector("#statusText");
const proxyCount = document.querySelector("#proxyCount");
const ruleCount = document.querySelector("#ruleCount");
const message = document.querySelector("#message");
const globalProxySection = document.querySelector("#globalProxySection");
const optionsButton = document.querySelector("#optionsButton");

document.addEventListener("DOMContentLoaded", init);
enabledInput.addEventListener("change", saveFromPopup);
modeInput.addEventListener("change", saveFromPopup);
proxyInput.addEventListener("change", saveFromPopup);
optionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());

async function init() {
  try {
    config = await sendMessage({ type: "GET_CONFIG" });
    render();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function saveFromPopup() {
  if (!config) {
    return;
  }

  config = {
    ...config,
    enabled: enabledInput.checked,
    mode: modeInput.value,
    selectedProxyId: proxyInput.value
  };

  try {
    const result = await sendMessage({ type: "SAVE_CONFIG", config });
    config = result.config;
    render();
    showMessage(result.status.message);
  } catch (error) {
    showMessage(error.message, true);
  }
}

function render() {
  enabledInput.checked = config.enabled;
  modeInput.value = config.mode;
  proxyCount.textContent = String(config.proxies.length);
  ruleCount.textContent = String(config.rules.length);

  renderProxyOptions();

  const modeName = {
    direct: "全部直连",
    global: "全部代理",
    rule: "按规则"
  }[config.mode];

  statusText.textContent = config.enabled ? `已启用，${modeName}` : "已关闭";
  globalProxySection.classList.toggle("hidden", config.mode !== "global");
}

function renderProxyOptions() {
  const enabledProxies = config.proxies.filter((proxy) => proxy.enabled);

  proxyInput.innerHTML = "";

  if (!enabledProxies.length) {
    proxyInput.append(new Option("暂无可用代理", ""));
    return;
  }

  for (const proxy of enabledProxies) {
    proxyInput.append(new Option(`${proxy.name} (${proxy.type})`, proxy.id));
  }

  if (enabledProxies.some((proxy) => proxy.id === config.selectedProxyId)) {
    proxyInput.value = config.selectedProxyId;
  } else {
    proxyInput.value = enabledProxies[0].id;
  }
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
