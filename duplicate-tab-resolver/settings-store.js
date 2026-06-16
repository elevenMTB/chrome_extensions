import {
  DEFAULT_SETTINGS,
  STORAGE_KEY_SETTINGS,
  STRATEGIES,
} from "./constants.js";

const EXACT_RULE_RE = /^(localhost|(?:\d{1,3}\.){3}\d{1,3}|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*)$/;
const WILDCARD_RULE_RE = /^\*\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/;

export function isValidStrategy(strategy) {
  return Object.values(STRATEGIES).includes(strategy);
}

export function normalizeBlacklistRule(rule) {
  if (typeof rule !== "string") {
    return "";
  }

  const normalized = rule.trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  if (
    normalized.includes("://") ||
    normalized.includes("/") ||
    normalized.includes("?") ||
    normalized.includes("#")
  ) {
    return "";
  }

  if (normalized.startsWith("*.")) {
    return WILDCARD_RULE_RE.test(normalized) ? normalized : "";
  }

  return EXACT_RULE_RE.test(normalized) ? normalized : "";
}

export function normalizeRuleList(rules) {
  if (!Array.isArray(rules)) {
    return [];
  }

  const normalized = [];
  const seen = new Set();

  for (const rule of rules) {
    const value = normalizeBlacklistRule(rule);
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

export function normalizeBlacklist(blacklist) {
  return normalizeRuleList(blacklist);
}

export function normalizeWhitelist(whitelist) {
  return normalizeRuleList(whitelist);
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function normalizeSettings(input = {}) {
  return {
    enabled:
      typeof input.enabled === "boolean"
        ? input.enabled
        : DEFAULT_SETTINGS.enabled,
    duplicateStrategy: isValidStrategy(input.duplicateStrategy)
      ? input.duplicateStrategy
      : DEFAULT_SETTINGS.duplicateStrategy,
    blacklist: normalizeBlacklist(input.blacklist),
    whitelist: normalizeWhitelist(input.whitelist),
    scope: DEFAULT_SETTINGS.scope,
    undoWindowSeconds: normalizePositiveInteger(
      input.undoWindowSeconds,
      DEFAULT_SETTINGS.undoWindowSeconds
    ),
    maxActionHistory: normalizePositiveInteger(
      input.maxActionHistory,
      DEFAULT_SETTINGS.maxActionHistory
    ),
  };
}

export async function loadSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEY_SETTINGS);
  return normalizeSettings(result[STORAGE_KEY_SETTINGS]);
}

export async function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  await chrome.storage.local.set({
    [STORAGE_KEY_SETTINGS]: normalized,
  });
  return normalized;
}
