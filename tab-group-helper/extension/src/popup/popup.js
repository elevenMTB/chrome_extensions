(function initPopup(global) {
  const TGH = global.TGH;
  const $ = (id) => document.getElementById(id);

  function setStatus(message, isError) {
    $('status').textContent = message || '';
    $('status').style.color = isError ? '#d33f49' : '#677089';
  }

  function sendMessage(type, payload) {
    return chrome.runtime.sendMessage({ type, payload }).then((response) => {
      if (!response || !response.ok) {
        throw new Error(response && response.error ? response.error.message : '操作失败');
      }
      return response.data;
    });
  }

  async function load() {
    const state = await sendMessage(TGH.MESSAGE_TYPES.GET_STORAGE_STATE);
    $('autoGroupEnabled').checked = state.settings.autoGroupEnabled;

    const match = await sendMessage(TGH.MESSAGE_TYPES.GET_CURRENT_TAB_MATCH);
    if (match.rule) {
      $('matchInfo').textContent = `${match.rule.ruleName} → ${match.targetGroupName}`;
    } else {
      $('matchInfo').textContent = '当前标签未命中规则';
    }
  }

  async function setAutoGroupEnabled() {
    await sendMessage(TGH.MESSAGE_TYPES.SET_AUTO_GROUP_ENABLED, {
      enabled: $('autoGroupEnabled').checked
    });
    setStatus($('autoGroupEnabled').checked ? '自动分组已开启。' : '自动分组已关闭。');
  }

  async function organize(scope) {
    setStatus('整理中...');
    const result = await sendMessage(TGH.MESSAGE_TYPES.ORGANIZE_TABS, { scope });
    setStatus(`完成：处理 ${result.processed}，跳过 ${result.skipped}，失败 ${result.failed}。`, result.failed > 0);
  }

  function bindEvents() {
    $('autoGroupEnabled').addEventListener('change', () => {
      setAutoGroupEnabled().catch((error) => setStatus(error.message, true));
    });
    $('organizeCurrent').addEventListener('click', () => {
      organize('current-window').catch((error) => setStatus(error.message, true));
    });
    $('organizeAll').addEventListener('click', () => {
      organize('all-windows').catch((error) => setStatus(error.message, true));
    });
    $('openOptions').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  bindEvents();
  load().catch((error) => setStatus(error.message, true));
})(globalThis);
