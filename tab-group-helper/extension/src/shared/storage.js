(function initStorage(global) {
  const TGH = global.TGH || {};

  function generateId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function storageGet(keys) {
    return chrome.storage.local.get(keys);
  }

  function storageSet(value) {
    return chrome.storage.local.set(value);
  }

  function normalizeOperator(method) {
    const map = {
      includes: 'contains',
      contains: 'contains',
      startsWith: 'startsWith',
      endsWith: 'endsWith',
      equals: 'equals'
    };
    return map[method] || 'contains';
  }

  function normalizeTarget(target) {
    const map = {
      href: 'url',
      url: 'url',
      hostname: 'hostname',
      title: 'title'
    };
    return map[target] || 'url';
  }

  function normalizeCondition(condition, index) {
    return {
      id: condition.id || generateId(`condition-${index + 1}`),
      target: normalizeTarget(condition.target),
      operator: normalizeOperator(condition.operator || condition.method),
      value: String(condition.value || '')
    };
  }

  function normalizeRule(rule, index) {
    const conditions = Array.isArray(rule.conditions)
      ? rule.conditions
      : Array.isArray(rule.urlMatches)
        ? rule.urlMatches
        : [];

    return {
      id: rule.id || generateId('rule'),
      enabled: rule.enabled !== false,
      priority: Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : (index + 1) * 10,
      ruleName: rule.ruleName || rule.name || `规则 ${index + 1}`,
      groupName: rule.groupName || rule.ruleName || `分组 ${index + 1}`,
      colorMode: rule.colorMode === 'fixed' ? 'fixed' : 'random',
      fixedColor: TGH.GROUP_COLORS.includes(rule.fixedColor) ? rule.fixedColor : 'blue',
      matchMode: 'OR',
      conditions: conditions.map(normalizeCondition).filter((condition) => condition.value.trim()),
      createdAt: rule.createdAt || Date.now(),
      updatedAt: Date.now()
    };
  }

  function normalizeRules(rulesInput) {
    if (Array.isArray(rulesInput)) {
      return rulesInput.map(normalizeRule).filter((rule) => rule.conditions.length);
    }

    if (rulesInput && typeof rulesInput === 'object') {
      return Object.keys(rulesInput)
        .filter((key) => key !== 'meta')
        .map((key, index) => normalizeRule({ id: key, ...rulesInput[key] }, index))
        .filter((rule) => rule.conditions.length);
    }

    return [];
  }

  function normalizeSettings(settings) {
    const next = { ...TGH.DEFAULT_SETTINGS, ...(settings || {}) };
    if (!['single-instance', 'multi-instance'].includes(next.sameNameGroupPolicy)) {
      next.sameNameGroupPolicy = 'single-instance';
    }
    if (!['keep', 'clear'].includes(next.historyTabPolicy)) {
      next.historyTabPolicy = 'keep';
    }
    if (!['current-window', 'all-windows'].includes(next.manualOrganizeDefaultScope)) {
      next.manualOrganizeDefaultScope = 'current-window';
    }
    next.autoGroupEnabled = next.autoGroupEnabled !== false;
    next.runOnStartup = next.runOnStartup !== false;
    next.includePinnedTabs = next.includePinnedTabs === true;
    return next;
  }

  function sanitizeImportedSettings(settings) {
    if (!settings || typeof settings !== 'object') {
      return {};
    }
    const allowed = [
      'autoGroupEnabled',
      'sameNameGroupPolicy',
      'historyTabPolicy',
      'runOnStartup',
      'includePinnedTabs',
      'manualOrganizeDefaultScope'
    ];
    return allowed.reduce((result, key) => {
      if (Object.prototype.hasOwnProperty.call(settings, key)) {
        result[key] = settings[key];
      }
      return result;
    }, {});
  }

  async function loadState() {
    const data = await storageGet(['schemaVersion', 'rules', 'settings', 'groupSnapshots', 'restoreState']);
    const state = {
      schemaVersion: data.schemaVersion || TGH.CURRENT_SCHEMA_VERSION,
      rules: normalizeRules(data.rules || []),
      settings: normalizeSettings(data.settings),
      groupSnapshots: data.groupSnapshots && typeof data.groupSnapshots === 'object' ? data.groupSnapshots : {},
      restoreState: data.restoreState && typeof data.restoreState === 'object' ? data.restoreState : {}
    };

    if (!data.schemaVersion || !Array.isArray(data.rules) || !data.settings) {
      await saveState(state);
    }
    return state;
  }

  async function saveState(state) {
    await storageSet({
      schemaVersion: TGH.CURRENT_SCHEMA_VERSION,
      rules: normalizeRules(state.rules || []),
      settings: normalizeSettings(state.settings),
      groupSnapshots: state.groupSnapshots || {},
      restoreState: state.restoreState || {}
    });
  }

  async function saveOptions({ rules, settings }) {
    const state = await loadState();
    const nextState = {
      ...state,
      rules: normalizeRules(rules),
      settings: normalizeSettings(settings)
    };
    await saveState(nextState);
    return nextState;
  }

  function parseImportPayload(payload) {
    const source = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (!source || typeof source !== 'object') {
      throw new Error('导入内容必须是 JSON 对象。');
    }

    const rules = Array.isArray(source.rules) ? source.rules : source;
    const normalizedRules = normalizeRules(rules);
    if (!normalizedRules.length) {
      throw new Error('导入文件中没有可用规则。');
    }

    return {
      rules: normalizedRules,
      settings: sanitizeImportedSettings(source.settings)
    };
  }

  async function importRules(payload) {
    const imported = parseImportPayload(payload);
    const state = await loadState();
    const nextState = {
      ...state,
      rules: imported.rules,
      settings: normalizeSettings({
        ...state.settings,
        ...sanitizeImportedSettings(imported.settings)
      })
    };
    await saveState(nextState);
    return nextState;
  }

  async function exportRules() {
    const state = await loadState();
    return {
      meta: {
        name: 'tab-group-helper-rules',
        version: TGH.CURRENT_SCHEMA_VERSION,
        exportedAt: Date.now()
      },
      rules: state.rules,
      settings: state.settings
    };
  }

  async function updateSettings(patch) {
    const state = await loadState();
    const nextState = {
      ...state,
      settings: normalizeSettings({ ...state.settings, ...patch })
    };
    await saveState(nextState);
    return nextState;
  }

  async function updateGroupSnapshot(logicalGroupName, patch) {
    const state = await loadState();
    const previous = state.groupSnapshots[logicalGroupName] || {};
    const snapshot = {
      logicalGroupName,
      displayName: logicalGroupName,
      tabs: [],
      ...previous,
      ...patch,
      updatedAt: Date.now()
    };
    state.groupSnapshots[logicalGroupName] = snapshot;
    await saveState(state);
    return snapshot;
  }

  async function markGroupRestored(logicalGroupName, payload) {
    const state = await loadState();
    const restoreState = state.restoreState || {};
    restoreState.sessionId = restoreState.sessionId || `session-${Date.now()}`;
    restoreState.restoredGroups = restoreState.restoredGroups || {};
    restoreState.restoredGroups[logicalGroupName] = {
      restoredAt: Date.now(),
      ...(payload || {})
    };
    state.restoreState = restoreState;
    await saveState(state);
    return restoreState;
  }

  async function resetRestoreState(sessionId) {
    const state = await loadState();
    state.restoreState = {
      sessionId: sessionId || `session-${Date.now()}`,
      restoredGroups: {}
    };
    await saveState(state);
    return state.restoreState;
  }

  async function ensureRuntimeSession() {
    if (!chrome.storage.session) {
      return resetRestoreState();
    }

    const key = 'tabGroupHelperRuntimeSessionId';
    const sessionData = await chrome.storage.session.get(key);
    if (sessionData[key]) {
      return sessionData[key];
    }

    const sessionId = `session-${Date.now()}`;
    await chrome.storage.session.set({ [key]: sessionId });
    await resetRestoreState(sessionId);
    return sessionId;
  }

  TGH.Storage = {
    generateId,
    loadState,
    saveState,
    saveOptions,
    importRules,
    exportRules,
    updateSettings,
    updateGroupSnapshot,
    markGroupRestored,
    resetRestoreState,
    ensureRuntimeSession,
    normalizeRules,
    normalizeSettings,
    parseImportPayload
  };

  global.TGH = TGH;
})(globalThis);
