(function initGroupManager(global) {
  const TGH = global.TGH || {};

  function groupQuery(queryInfo) {
    return chrome.tabGroups.query(queryInfo || {});
  }

  function groupUpdate(groupId, updateProperties) {
    return chrome.tabGroups.update(groupId, updateProperties);
  }

  function tabsQuery(queryInfo) {
    return chrome.tabs.query(queryInfo || {});
  }

  function tabsGroup(groupOptions) {
    return chrome.tabs.group(groupOptions);
  }

  function tabsMove(tabId, moveProperties) {
    return chrome.tabs.move(tabId, moveProperties);
  }

  function getDisplayName(logicalName, instanceIndex) {
    if (!instanceIndex || instanceIndex <= 1) {
      return logicalName;
    }
    return `${logicalName}(${instanceIndex})`;
  }

  function isDisplayNameForLogical(title, logicalName) {
    if (title === logicalName) {
      return true;
    }
    return new RegExp(`^${escapeRegExp(logicalName)}\\(\\d+\\)$`).test(title || '');
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function chooseColor(rule, snapshot) {
    if (snapshot && snapshot.color && TGH.GROUP_COLORS.includes(snapshot.color)) {
      return snapshot.color;
    }
    if (rule.colorMode === 'fixed' && TGH.GROUP_COLORS.includes(rule.fixedColor)) {
      return rule.fixedColor;
    }
    return TGH.GROUP_COLORS[Math.floor(Math.random() * TGH.GROUP_COLORS.length)];
  }

  async function findGroupById(groupId) {
    if (!Number.isInteger(groupId) || groupId < 0) {
      return null;
    }
    const groups = await groupQuery({});
    return groups.find((group) => group.id === groupId) || null;
  }

  async function findGroupsByLogicalName(logicalName) {
    const groups = await groupQuery({});
    return groups.filter((group) => isDisplayNameForLogical(group.title, logicalName));
  }

  async function findGroupInWindow(logicalName, windowId) {
    const groups = await findGroupsByLogicalName(logicalName);
    return groups.find((group) => group.windowId === windowId) || null;
  }

  async function createGroupForTab(tab, rule, logicalName, displayName, color) {
    const groupId = await tabsGroup({ tabIds: tab.tabId });
    const group = await groupUpdate(groupId, {
      title: displayName,
      color
    });
    await TGH.Storage.updateGroupSnapshot(logicalName, {
      logicalGroupName: logicalName,
      displayName,
      color,
      lastKnownGroupId: group.id,
      lastKnownWindowId: group.windowId,
      lastRuleId: rule.id
    });
    return { ...group, tghCreatedForCurrentHit: true };
  }

  async function mergeDuplicateGroups(primaryGroup, duplicateGroups) {
    for (const group of duplicateGroups) {
      const tabs = await tabsQuery({ groupId: group.id });
      for (const tab of tabs) {
        if (tab.windowId !== primaryGroup.windowId) {
          await tabsMove(tab.id, { windowId: primaryGroup.windowId, index: -1 });
        }
        await tabsGroup({ tabIds: tab.id, groupId: primaryGroup.id });
      }
    }
  }

  async function ensureSingleInstanceGroup(tab, rule, state) {
    const logicalName = rule.groupName;
    const snapshot = state.groupSnapshots[logicalName];
    const snapshotGroup = snapshot ? await findGroupById(snapshot.lastKnownGroupId) : null;
    const groups = await findGroupsByLogicalName(logicalName);
    const primaryGroup = snapshotGroup || groups[0] || null;
    const color = chooseColor(rule, snapshot);

    if (primaryGroup) {
      const duplicateGroups = groups.filter((group) => group.id !== primaryGroup.id);
      await mergeDuplicateGroups(primaryGroup, duplicateGroups);
      await groupUpdate(primaryGroup.id, {
        title: logicalName,
        color: primaryGroup.color || color
      });
      await TGH.Storage.updateGroupSnapshot(logicalName, {
        displayName: logicalName,
        color: primaryGroup.color || color,
        lastKnownGroupId: primaryGroup.id,
        lastKnownWindowId: primaryGroup.windowId,
        lastRuleId: rule.id
      });
      return { ...primaryGroup, title: logicalName, color: primaryGroup.color || color };
    }

    return createGroupForTab(tab, rule, logicalName, logicalName, color);
  }

  async function ensureMultiInstanceGroup(tab, rule, state) {
    const logicalName = rule.groupName;
    const snapshot = state.groupSnapshots[logicalName];
    const existing = await findGroupInWindow(logicalName, tab.windowId);
    const color = chooseColor(rule, snapshot);

    if (existing) {
      await TGH.Storage.updateGroupSnapshot(logicalName, {
        displayName: existing.title,
        color: existing.color || color,
        lastKnownGroupId: existing.id,
        lastKnownWindowId: existing.windowId,
        lastRuleId: rule.id
      });
      return existing;
    }

    const allGroups = await findGroupsByLogicalName(logicalName);
    const displayName = getDisplayName(logicalName, allGroups.length + 1);
    return createGroupForTab(tab, rule, logicalName, displayName, color);
  }

  async function ensureTargetGroup(tab, rule, state) {
    if (state.settings.sameNameGroupPolicy === 'multi-instance') {
      return ensureMultiInstanceGroup(tab, rule, state);
    }
    return ensureSingleInstanceGroup(tab, rule, state);
  }

  async function moveTabToGroup(tab, group) {
    if (tab.groupId === group.id) {
      return chrome.tabs.get(tab.tabId);
    }
    if (tab.windowId !== group.windowId) {
      await tabsMove(tab.tabId, { windowId: group.windowId, index: -1 });
    }
    await tabsGroup({ tabIds: tab.tabId, groupId: group.id });
    return chrome.tabs.get(tab.tabId);
  }

  TGH.GroupManager = {
    ensureTargetGroup,
    moveTabToGroup,
    findGroupsByLogicalName,
    isDisplayNameForLogical
  };

  global.TGH = TGH;
})(globalThis);
