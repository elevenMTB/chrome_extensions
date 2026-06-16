import {
  findFirstUndoableRecord,
  loadActionHistory,
  markUndoDone,
  markUndoFailed,
  saveActionHistory,
  syncActionHistoryExpiry,
} from "./history-store.js";

function stringifyError(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error ?? "Unknown error");
}

export async function undoLatestAction() {
  const history = await syncActionHistoryExpiry();
  const now = Date.now();
  const target = findFirstUndoableRecord(history, now);

  if (!target) {
    return {
      ok: false,
      reason: "no_undoable_record",
    };
  }

  if (!target.closedTabUrl) {
    return {
      ok: false,
      reason: "missing_closed_tab_url",
    };
  }

  try {
    const reopenedTab = await chrome.tabs.create({
      url: target.closedTabUrl,
      active: true,
    });

    const updatedHistory = markUndoDone({
      history,
      recordId: target.id,
      reopenedTabId: reopenedTab.id,
      now,
    });

    await saveActionHistory(updatedHistory);

    return {
      ok: true,
      recordId: target.id,
      reopenedTabId: reopenedTab.id ?? null,
      history: await loadActionHistory(),
    };
  } catch (error) {
    const updatedHistory = markUndoFailed({
      history,
      recordId: target.id,
      errorMessage: stringifyError(error),
    });

    await saveActionHistory(updatedHistory);

    return {
      ok: false,
      reason: "undo_failed",
      errorMessage: stringifyError(error),
      history: await loadActionHistory(),
    };
  }
}
