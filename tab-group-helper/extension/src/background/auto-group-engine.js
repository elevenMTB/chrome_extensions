(function initAutoGroupEngine(global) {
  const TGH = global.TGH || {};
  const processingTabs = new Map();

  function lockKey(tab) {
    return `${tab.tabId}:${tab.url}:${tab.title}`;
  }

  function withTabLock(tab, ttlMs) {
    const key = lockKey(tab);
    if (processingTabs.has(key)) {
      return false;
    }
    processingTabs.set(key, Date.now());
    setTimeout(() => processingTabs.delete(key), ttlMs);
    return true;
  }

  function isAutoSource(source) {
    return source !== 'manual' && source !== 'popup-preview';
  }

  async function handleTab(rawTab, source) {
    const state = await TGH.Storage.loadState();
    if (isAutoSource(source) && !state.settings.autoGroupEnabled) {
      return { skipped: true, reason: 'auto-disabled' };
    }

    const { tab, rule } = TGH.RuleMatcher.matchTab(rawTab, state.rules, state.settings);
    if (TGH.RuleMatcher.shouldSkipTab(tab, state.settings)) {
      return { skipped: true, reason: 'skip-tab' };
    }
    if (source !== 'manual' && !withTabLock(tab, source === 'title' ? 1500 : 1000)) {
      return { skipped: true, reason: 'locked' };
    }
    if (!rule) {
      return { skipped: true, reason: 'no-rule', tab };
    }

    const group = await TGH.GroupManager.ensureTargetGroup(tab, rule, state);
    const movedTab = await TGH.GroupManager.moveTabToGroup(tab, group);
    const normalizedMovedTab = TGH.RuleMatcher.normalizeTab(movedTab);

    await TGH.HistoryRestoreManager.maybeRestoreHistoryTabs(group, rule, state.settings, normalizedMovedTab);
    const finalGroup = state.settings.sameNameGroupPolicy === 'single-instance'
      ? (await TGH.GroupManager.reconcileSingleInstanceGroup(rule, state, group.id)) || group
      : group;
    await TGH.HistoryRestoreManager.updateSnapshotFromGroup(finalGroup, rule.groupName, rule, state.settings);

    return {
      skipped: false,
      tab: normalizedMovedTab,
      rule,
      group: finalGroup
    };
  }

  async function queryTabs(scope, windowId) {
    if (scope === 'current-window') {
      if (Number.isInteger(windowId)) {
        return chrome.tabs.query({ windowId });
      }
      return chrome.tabs.query({ currentWindow: true });
    }
    return chrome.tabs.query({});
  }

  async function organize(scope, windowId) {
    const tabs = await queryTabs(scope, windowId);
    const result = {
      total: tabs.length,
      processed: 0,
      skipped: 0,
      failed: 0
    };

    for (const tab of tabs.sort((a, b) => (a.windowId - b.windowId) || (a.index - b.index))) {
      try {
        const item = await handleTab(tab, 'manual');
        if (item.skipped) {
          result.skipped += 1;
        } else {
          result.processed += 1;
        }
      } catch (error) {
        console.warn('Failed to organize tab', tab.id, error);
        result.failed += 1;
      }
    }

    return result;
  }

  function inferLogicalName(group, snapshots) {
    const title = group.title || '';
    const matched = Object.keys(snapshots || {}).find((name) => TGH.GroupManager.isDisplayNameForLogical(title, name));
    if (matched) {
      return matched;
    }
    return title.replace(/\(\d+\)$/, '') || title;
  }

  async function refreshAllSnapshots() {
    const state = await TGH.Storage.loadState();
    const groups = await chrome.tabGroups.query({});
    for (const group of groups) {
      const logicalName = inferLogicalName(group, state.groupSnapshots);
      if (!logicalName) {
        continue;
      }
      const rule = state.rules.find((candidate) => candidate.groupName === logicalName);
      await TGH.HistoryRestoreManager.updateSnapshotFromGroup(group, logicalName, rule, state.settings);
    }
  }

  async function getCurrentTabMatch(tab) {
    const state = await TGH.Storage.loadState();
    const { tab: normalizedTab, rule } = TGH.RuleMatcher.matchTab(tab, state.rules, state.settings);
    return {
      tab: normalizedTab,
      rule,
      targetGroupName: rule ? rule.groupName : ''
    };
  }

  async function handleRemovedTab() {
    const state = await TGH.Storage.loadState();
    if (state.settings.historyTabPolicy === 'keep') {
      return;
    }
    await refreshAllSnapshots();
  }

  TGH.AutoGroupEngine = {
    handleTab,
    organize,
    refreshAllSnapshots,
    getCurrentTabMatch,
    handleRemovedTab
  };

  global.TGH = TGH;
})(globalThis);
