import {
  ACTION_STATUSES,
  STORAGE_KEY_ACTION_HISTORY,
  UNDO_STATUSES,
} from "./constants.js";

function normalizeTimestamp(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeString(value) {
  return typeof value === "string" && value ? value : null;
}

function normalizeNumber(value) {
  return typeof value === "number" ? value : null;
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeStatus(value) {
  if (Object.values(ACTION_STATUSES).includes(value)) {
    return value;
  }
  return ACTION_STATUSES.FAILED;
}

function normalizeUndoStatus(value, undoable) {
  if (Object.values(UNDO_STATUSES).includes(value)) {
    return value;
  }
  return undoable ? UNDO_STATUSES.PENDING : UNDO_STATUSES.NOT_SUPPORTED;
}

function createFallbackId() {
  return `record_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeActionRecord(record = {}) {
  const undoable = normalizeBoolean(record.undoable);

  return {
    id: normalizeString(record.id) ?? createFallbackId(),
    timestamp: normalizeTimestamp(record.timestamp) ?? Date.now(),
    strategy: normalizeString(record.strategy),
    status: normalizeStatus(record.status),
    currentTabId: normalizeNumber(record.currentTabId),
    currentTabUrl: normalizeString(record.currentTabUrl),
    existingTabId: normalizeNumber(record.existingTabId),
    existingTabUrl: normalizeString(record.existingTabUrl),
    affectedWindowId: normalizeNumber(record.affectedWindowId),
    closedTabId: normalizeNumber(record.closedTabId),
    closedTabUrl: normalizeString(record.closedTabUrl),
    activatedTabId: normalizeNumber(record.activatedTabId),
    undoable,
    undoStatus: normalizeUndoStatus(record.undoStatus, undoable),
    undoableUntil: normalizeTimestamp(record.undoableUntil),
    undoOpenedTabId: normalizeNumber(record.undoOpenedTabId),
    undoCompletedAt: normalizeTimestamp(record.undoCompletedAt),
    errorMessage: normalizeString(record.errorMessage),
  };
}

export function normalizeActionHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history.map((record) => normalizeActionRecord(record));
}

export async function loadActionHistory() {
  const result = await chrome.storage.local.get(STORAGE_KEY_ACTION_HISTORY);
  return normalizeActionHistory(result[STORAGE_KEY_ACTION_HISTORY]);
}

export async function saveActionHistory(history) {
  const normalized = normalizeActionHistory(history);
  await chrome.storage.local.set({
    [STORAGE_KEY_ACTION_HISTORY]: normalized,
  });
  return normalized;
}

export async function appendActionRecord(record, maxCount) {
  const history = await loadActionHistory();
  const nextHistory = [normalizeActionRecord(record), ...history].slice(
    0,
    maxCount
  );
  await saveActionHistory(nextHistory);
  return nextHistory;
}

export function expireUndoableRecords(history, now = Date.now()) {
  let changed = false;

  const nextHistory = normalizeActionHistory(history).map((record) => {
    if (
      record.undoable &&
      record.undoStatus === UNDO_STATUSES.PENDING &&
      typeof record.undoableUntil === "number" &&
      now > record.undoableUntil
    ) {
      changed = true;
      return {
        ...record,
        undoStatus: UNDO_STATUSES.EXPIRED,
      };
    }

    return record;
  });

  return { changed, history: nextHistory };
}

export async function syncActionHistoryExpiry(now = Date.now()) {
  const history = await loadActionHistory();
  const result = expireUndoableRecords(history, now);
  if (result.changed) {
    await saveActionHistory(result.history);
  }
  return result.history;
}

export function findFirstUndoableRecord(history, now = Date.now()) {
  for (const record of normalizeActionHistory(history)) {
    if (record.status !== ACTION_STATUSES.SUCCESS) {
      continue;
    }

    if (!record.undoable) {
      continue;
    }

    if (record.undoStatus !== UNDO_STATUSES.PENDING) {
      continue;
    }

    if (!record.closedTabUrl) {
      continue;
    }

    if (typeof record.undoableUntil !== "number") {
      continue;
    }

    if (now > record.undoableUntil) {
      continue;
    }

    return record;
  }

  return null;
}

export function markUndoDone({ history, recordId, reopenedTabId, now }) {
  return normalizeActionHistory(history).map((record) => {
    if (record.id !== recordId) {
      return record;
    }

    return {
      ...record,
      undoStatus: UNDO_STATUSES.DONE,
      undoOpenedTabId: typeof reopenedTabId === "number" ? reopenedTabId : null,
      undoCompletedAt: now,
      errorMessage: null,
    };
  });
}

export function markUndoFailed({ history, recordId, errorMessage }) {
  return normalizeActionHistory(history).map((record) => {
    if (record.id !== recordId) {
      return record;
    }

    return {
      ...record,
      undoStatus: UNDO_STATUSES.FAILED,
      errorMessage: errorMessage ?? "Undo failed",
    };
  });
}
