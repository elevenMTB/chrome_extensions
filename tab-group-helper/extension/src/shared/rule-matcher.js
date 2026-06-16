(function initRuleMatcher(global) {
  const TGH = global.TGH || {};

  function safeLower(value) {
    return String(value || '').toLowerCase();
  }

  function getHostname(url) {
    try {
      return new URL(url).hostname;
    } catch (_error) {
      return '';
    }
  }

  function normalizeTab(tab) {
    const url = tab.url || tab.pendingUrl || '';
    return {
      tabId: tab.id,
      windowId: tab.windowId,
      groupId: tab.groupId,
      pinned: tab.pinned === true,
      url,
      hostname: getHostname(url),
      title: tab.title || '',
      favIconUrl: tab.favIconUrl || ''
    };
  }

  function isSpecialUrl(url) {
    if (!url) {
      return true;
    }
    return TGH.SPECIAL_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
  }

  function shouldSkipTab(tab, settings) {
    if (!tab || !tab.tabId) {
      return true;
    }
    if (tab.pinned && !settings.includePinnedTabs) {
      return true;
    }
    return isSpecialUrl(tab.url);
  }

  function getTargetValue(tab, target) {
    if (target === 'hostname') {
      return safeLower(tab.hostname);
    }
    if (target === 'url') {
      return safeLower(tab.url);
    }
    if (target === 'title') {
      return String(tab.title || '');
    }
    return '';
  }

  function normalizeValue(condition) {
    if (condition.target === 'title') {
      return String(condition.value || '');
    }
    return safeLower(condition.value);
  }

  function matchCondition(tab, condition) {
    const targetValue = getTargetValue(tab, condition.target);
    const expected = normalizeValue(condition);
    if (!expected) {
      return false;
    }
    if (condition.operator === 'startsWith') {
      return targetValue.startsWith(expected);
    }
    if (condition.operator === 'endsWith') {
      return targetValue.endsWith(expected);
    }
    if (condition.operator === 'equals') {
      return targetValue === expected;
    }
    return targetValue.includes(expected);
  }

  function matchRule(tab, rule) {
    if (!rule || rule.enabled === false || !Array.isArray(rule.conditions)) {
      return false;
    }
    return rule.conditions.some((condition) => matchCondition(tab, condition));
  }

  function matchTab(tab, rules, settings) {
    const normalizedTab = normalizeTab(tab);
    if (shouldSkipTab(normalizedTab, settings)) {
      return { tab: normalizedTab, rule: null };
    }

    const sortedRules = [...(rules || [])]
      .filter((rule) => rule.enabled !== false)
      .sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0));

    const rule = sortedRules.find((candidate) => matchRule(normalizedTab, candidate)) || null;
    return { tab: normalizedTab, rule };
  }

  TGH.RuleMatcher = {
    normalizeTab,
    shouldSkipTab,
    matchCondition,
    matchRule,
    matchTab,
    isSpecialUrl
  };

  global.TGH = TGH;
})(globalThis);
