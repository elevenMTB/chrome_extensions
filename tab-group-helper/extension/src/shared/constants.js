(function initConstants(global) {
  const TGH = global.TGH || {};

  TGH.CURRENT_SCHEMA_VERSION = 1;

  TGH.DEFAULT_SETTINGS = {
    autoGroupEnabled: true,
    sameNameGroupPolicy: 'single-instance',
    historyTabPolicy: 'keep',
    runOnStartup: true,
    includePinnedTabs: false,
    manualOrganizeDefaultScope: 'current-window'
  };

  TGH.GROUP_COLORS = [
    'grey',
    'blue',
    'red',
    'yellow',
    'green',
    'pink',
    'purple',
    'cyan',
    'orange'
  ];

  TGH.MESSAGE_TYPES = {
    RULES_UPDATED: 'RULES_UPDATED',
    SETTINGS_UPDATED: 'SETTINGS_UPDATED',
    SET_AUTO_GROUP_ENABLED: 'SET_AUTO_GROUP_ENABLED',
    ORGANIZE_TABS: 'ORGANIZE_TABS',
    GET_CURRENT_TAB_MATCH: 'GET_CURRENT_TAB_MATCH',
    GET_STORAGE_STATE: 'GET_STORAGE_STATE',
    SAVE_OPTIONS: 'SAVE_OPTIONS',
    IMPORT_RULES: 'IMPORT_RULES',
    EXPORT_RULES: 'EXPORT_RULES'
  };

  TGH.SPECIAL_URL_PREFIXES = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'file://'
  ];

  global.TGH = TGH;
})(globalThis);
