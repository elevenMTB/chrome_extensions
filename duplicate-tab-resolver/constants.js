export const STORAGE_KEY_SETTINGS = "settings";
export const STORAGE_KEY_ACTION_HISTORY = "actionHistory";

export const STRATEGIES = Object.freeze({
  ACTIVATE_EXISTING_CLOSE_NEW: "activate_existing_close_new",
  CLOSE_OLD_KEEP_NEW: "close_old_keep_new",
  KEEP_BOTH: "keep_both",
});

export const STRATEGY_OPTIONS = Object.freeze([
  {
    value: STRATEGIES.ACTIVATE_EXISTING_CLOSE_NEW,
    label: "Switch to the existing tab and close the new tab",
  },
  {
    value: STRATEGIES.CLOSE_OLD_KEEP_NEW,
    label: "Close the old tab and keep the new tab",
  },
  {
    value: STRATEGIES.KEEP_BOTH,
    label: "Keep both tabs",
  },
]);

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  duplicateStrategy: STRATEGIES.ACTIVATE_EXISTING_CLOSE_NEW,
  blacklist: [],
  whitelist: [],
  scope: "all_windows",
  undoWindowSeconds: 60,
  maxActionHistory: 10,
});

export const ACTION_STATUSES = Object.freeze({
  SUCCESS: "success",
  FAILED: "failed",
  SKIPPED: "skipped",
});

export const UNDO_STATUSES = Object.freeze({
  PENDING: "pending",
  EXPIRED: "expired",
  DONE: "done",
  NOT_SUPPORTED: "not_supported",
  FAILED: "failed",
});

export const RUNTIME_MESSAGES = Object.freeze({
  UNDO_LATEST_ACTION: "undoLatestAction",
});
