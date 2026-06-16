(function initHistoryRestoreManager(global) {
  const TGH = global.TGH || {};
  const restoreLocks = new Set();

  function tabsQuery(queryInfo) {
    return chrome.tabs.query(queryInfo || {});
  }

  function tabsCreate(createProperties) {
    return chrome.tabs.create(createProperties);
  }

  function tabsGroup(groupOptions) {
    return chrome.tabs.group(groupOptions);
  }

  function validSnapshotTab(tab) {
    return tab && tab.url && !TGH.RuleMatcher.isSpecialUrl(tab.url);
  }

  async function collectGroupTabs(groupId, settings) {
    const tabs = await tabsQuery({ groupId });
    return tabs
      .map(TGH.RuleMatcher.normalizeTab)
      .filter((tab) => !TGH.RuleMatcher.shouldSkipTab(tab, settings))
      .map((tab) => ({
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
        lastSeenAt: Date.now()
      }));
  }

  async function updateSnapshotFromGroup(group, logicalGroupName, rule, settings) {
    const tabs = await collectGroupTabs(group.id, settings);
    return TGH.Storage.updateGroupSnapshot(logicalGroupName, {
      logicalGroupName,
      displayName: group.title || logicalGroupName,
      color: group.color,
      lastKnownWindowId: group.windowId,
      lastKnownGroupId: group.id,
      lastRuleId: rule && rule.id,
      tabs
    });
  }

  async function maybeRestoreHistoryTabs(group, rule, settings, triggerTab) {
    const logicalName = rule.groupName;
    if (settings.historyTabPolicy !== 'keep') {
      return { restored: 0 };
    }
    if (restoreLocks.has(logicalName)) {
      return { restored: 0 };
    }

    const state = await TGH.Storage.loadState();
    const snapshot = state.groupSnapshots[logicalName];
    const restoredGroups = (state.restoreState && state.restoreState.restoredGroups) || {};
    if (!snapshot || !Array.isArray(snapshot.tabs) || !snapshot.tabs.length || restoredGroups[logicalName]) {
      return { restored: 0 };
    }

    restoreLocks.add(logicalName);
    try {
      const currentTabs = await tabsQuery({});
      const currentGroupUrls = new Set(
        currentTabs
          .filter((tab) => tab.groupId === group.id)
          .map((tab) => tab.url)
          .filter(Boolean)
      );
      const triggerUrl = triggerTab.url;
      const seen = new Set();
      const urlsToRestore = snapshot.tabs
        .filter(validSnapshotTab)
        .map((tab) => tab.url)
        .filter((url) => url !== triggerUrl)
        .filter((url) => !currentGroupUrls.has(url))
        .filter((url) => {
          if (seen.has(url)) {
            return false;
          }
          seen.add(url);
          return true;
        });

      await TGH.Storage.markGroupRestored(logicalName, {
        triggerTabId: triggerTab.tabId,
        createdTabUrls: urlsToRestore
      });

      let restored = 0;
      for (const url of urlsToRestore) {
        const createdTab = await tabsCreate({
          url,
          windowId: group.windowId,
          active: false
        });
        await tabsGroup({
          tabIds: createdTab.id,
          groupId: group.id
        });
        restored += 1;
      }

      await updateSnapshotFromGroup(group, logicalName, rule, settings);
      return { restored };
    } finally {
      restoreLocks.delete(logicalName);
    }
  }

  TGH.HistoryRestoreManager = {
    maybeRestoreHistoryTabs,
    updateSnapshotFromGroup,
    collectGroupTabs
  };

  global.TGH = TGH;
})(globalThis);
