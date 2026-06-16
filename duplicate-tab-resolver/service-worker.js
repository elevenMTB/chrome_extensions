import {
  ACTION_STATUSES,
  RUNTIME_MESSAGES,
  STRATEGIES,
  UNDO_STATUSES,
} from "./constants.js";
import { loadSettings, saveSettings } from "./settings-store.js";
import { shouldSkipAutoHandling } from "./url-rules.js";
import { findDuplicateTab } from "./duplicate-detector.js";
import { executeDuplicateStrategy } from "./tab-actions.js";
import { appendActionRecord, syncActionHistoryExpiry } from "./history-store.js";
import { undoLatestAction } from "./undo-actions.js";

const processingTabIds = new Set();

function log(message, details) {
  if (typeof details === "undefined") {
    console.log(`[Duplicate Tab Resolver] ${message}`);
    return;
  }
  console.log(`[Duplicate Tab Resolver] ${message}`, details);
}

function createRecordId(now) {
  return `record_${now}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildActionRecord({ actionResult, match, now, settings }) {
  const undoable =
    actionResult.ok &&
    actionResult.strategy !== STRATEGIES.KEEP_BOTH &&
    Boolean(actionResult.closedTabUrl);

  return {
    id: createRecordId(now),
    timestamp: now,
    strategy: actionResult.strategy,
    status: actionResult.ok
      ? actionResult.closedTabId || actionResult.activatedTabId
        ? ACTION_STATUSES.SUCCESS
        : ACTION_STATUSES.SKIPPED
      : ACTION_STATUSES.FAILED,
    currentTabId: actionResult.currentTabId,
    currentTabUrl: actionResult.currentTabUrl,
    existingTabId: match.existingTabId ?? null,
    existingTabUrl: match.existingUrl ?? null,
    affectedWindowId: actionResult.affectedWindowId ?? null,
    closedTabId: actionResult.closedTabId ?? null,
    closedTabUrl: actionResult.closedTabUrl ?? null,
    activatedTabId: actionResult.activatedTabId ?? null,
    undoable,
    undoStatus: undoable ? UNDO_STATUSES.PENDING : UNDO_STATUSES.NOT_SUPPORTED,
    undoableUntil: undoable
      ? now + settings.undoWindowSeconds * 1000
      : null,
    undoOpenedTabId: null,
    undoCompletedAt: null,
    errorMessage: actionResult.errorMessage ?? null,
  };
}

async function handleTabUpdated(tabId, changeInfo, tab) {
  const hasRelevantUpdate = Boolean(changeInfo.url) || changeInfo.status === "complete";
  if (!hasRelevantUpdate) {
    return;
  }

  if (processingTabIds.has(tabId)) {
    return;
  }

  const currentUrl = changeInfo.url ?? tab?.url;
  if (!currentUrl) {
    return;
  }

  processingTabIds.add(tabId);

  try {
    const settings = await loadSettings();
    if (!settings.enabled) {
      return;
    }

    const skipResult = shouldSkipAutoHandling(currentUrl, settings);
    if (skipResult.skip) {
      log(`Skip tab ${tabId}: ${skipResult.reason}`, currentUrl);
      return;
    }

    const match = await findDuplicateTab({
      currentTabId: tabId,
      currentUrl,
      settings,
    });

    if (!match.hasDuplicate) {
      return;
    }

    log(`Duplicate found for tab ${tabId}`, match);
    const actionResult = await executeDuplicateStrategy({
      strategy: settings.duplicateStrategy,
      currentTabId: tabId,
      currentUrl,
      existingTabId: match.existingTabId,
      existingTabUrl: match.existingUrl,
      existingWindowId: match.existingWindowId,
    });

    const record = buildActionRecord({
      actionResult,
      match,
      now: Date.now(),
      settings,
    });

    await appendActionRecord(record, settings.maxActionHistory);
  } catch (error) {
    log(`Failed to process tab ${tabId}`, error);
  } finally {
    processingTabIds.delete(tabId);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await saveSettings(await loadSettings());
  await syncActionHistoryExpiry();
  log("Service worker installed");
});

chrome.runtime.onStartup.addListener(async () => {
  await syncActionHistoryExpiry();
  log("Browser startup detected");
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  void handleTabUpdated(tabId, changeInfo, tab);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== RUNTIME_MESSAGES.UNDO_LATEST_ACTION) {
    return undefined;
  }

  void (async () => {
    try {
      const result = await undoLatestAction();
      sendResponse(result);
    } catch (error) {
      sendResponse({
        ok: false,
        reason: "undo_failed",
        errorMessage:
          error instanceof Error ? error.message : String(error ?? "Unknown error"),
      });
    }
  })();

  return true;
});

log("Service worker loaded");
