importScripts(
  '../shared/constants.js',
  '../shared/storage.js',
  '../shared/rule-matcher.js',
  './group-manager.js',
  './history-restore-manager.js',
  './auto-group-engine.js'
);

const runtimeSessionReady = TGH.Storage.ensureRuntimeSession().catch((error) => {
  console.warn('Failed to initialize runtime session', error);
});

async function safeHandleTab(tab, source) {
  try {
    await runtimeSessionReady;
    return await TGH.AutoGroupEngine.handleTab(tab, source);
  } catch (error) {
    console.warn('Tab Group Helper failed to handle tab', tab && tab.id, error);
    return { skipped: true, reason: 'error', error: String(error && error.message ? error.message : error) };
  }
}

function ok(data) {
  return { ok: true, data, error: null };
}

function fail(error) {
  return {
    ok: false,
    data: null,
    error: {
      code: 'ERROR',
      message: String(error && error.message ? error.message : error)
    }
  };
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

chrome.runtime.onInstalled.addListener(async () => {
  await TGH.Storage.loadState();
  await TGH.Storage.resetRestoreState();
});

chrome.runtime.onStartup.addListener(async () => {
  await TGH.Storage.resetRestoreState();
  const state = await TGH.Storage.loadState();
  if (state.settings.runOnStartup) {
    await TGH.AutoGroupEngine.organize('all-windows');
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  setTimeout(() => safeHandleTab(tab, 'created'), 500);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    safeHandleTab(tab, 'url');
  }
  if (changeInfo.title) {
    safeHandleTab(tab, 'title');
  }
});

chrome.tabs.onMoved.addListener(async (tabId) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await safeHandleTab(tab, 'moved');
  } catch (error) {
    console.warn('Failed to handle moved tab', tabId, error);
  }
});

chrome.tabs.onAttached.addListener(async (tabId) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await safeHandleTab(tab, 'attached');
  } catch (error) {
    console.warn('Failed to handle attached tab', tabId, error);
  }
});

chrome.tabs.onRemoved.addListener(() => {
  TGH.AutoGroupEngine.handleRemovedTab().catch((error) => {
    console.warn('Failed to refresh snapshots after tab removal', error);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const type = message && message.type;
    const payload = (message && message.payload) || {};

    if (type === TGH.MESSAGE_TYPES.GET_STORAGE_STATE) {
      return ok(await TGH.Storage.loadState());
    }

    if (type === TGH.MESSAGE_TYPES.SAVE_OPTIONS) {
      return ok(await TGH.Storage.saveOptions(payload));
    }

    if (type === TGH.MESSAGE_TYPES.SET_AUTO_GROUP_ENABLED) {
      return ok(await TGH.Storage.updateSettings({ autoGroupEnabled: payload.enabled === true }));
    }

    if (type === TGH.MESSAGE_TYPES.IMPORT_RULES) {
      return ok(await TGH.Storage.importRules(payload.content));
    }

    if (type === TGH.MESSAGE_TYPES.EXPORT_RULES) {
      return ok(await TGH.Storage.exportRules());
    }

    if (type === TGH.MESSAGE_TYPES.ORGANIZE_TABS) {
      const scope = payload.scope === 'all-windows' ? 'all-windows' : 'current-window';
      const activeTab = await getActiveTab();
      const windowId = activeTab ? activeTab.windowId : undefined;
      return ok(await TGH.AutoGroupEngine.organize(scope, windowId));
    }

    if (type === TGH.MESSAGE_TYPES.GET_CURRENT_TAB_MATCH) {
      const tab = payload.tab || await getActiveTab();
      if (!tab) {
        return ok({ tab: null, rule: null, targetGroupName: '' });
      }
      return ok(await TGH.AutoGroupEngine.getCurrentTabMatch(tab));
    }

    return fail(`Unknown message type: ${type}`);
  })()
    .then(sendResponse)
    .catch((error) => sendResponse(fail(error)));

  return true;
});
