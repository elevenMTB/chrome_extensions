import { STRATEGIES } from "./constants.js";

export async function executeDuplicateStrategy({
  strategy,
  currentTabId,
  currentUrl,
  existingTabId,
  existingTabUrl,
  existingWindowId,
}) {
  if (typeof existingTabId !== "number") {
    return {
      ok: false,
      strategy,
      currentTabId: typeof currentTabId === "number" ? currentTabId : null,
      currentTabUrl: currentUrl ?? null,
      existingTabId: null,
      existingTabUrl: existingTabUrl ?? null,
      affectedWindowId: null,
      activatedTabId: null,
      closedTabId: null,
      closedTabUrl: null,
      errorMessage: "Missing existing tab id",
    };
  }

  if (strategy === STRATEGIES.ACTIVATE_EXISTING_CLOSE_NEW) {
    if (typeof existingWindowId === "number") {
      await chrome.windows.update(existingWindowId, { focused: true });
    }

    await chrome.tabs.update(existingTabId, { active: true });

    if (typeof currentTabId === "number" && currentTabId !== existingTabId) {
      await chrome.tabs.remove(currentTabId);
    }
    return {
      ok: true,
      strategy,
      currentTabId: typeof currentTabId === "number" ? currentTabId : null,
      currentTabUrl: currentUrl ?? null,
      existingTabId,
      existingTabUrl: existingTabUrl ?? null,
      affectedWindowId:
        typeof existingWindowId === "number" ? existingWindowId : null,
      activatedTabId: existingTabId,
      closedTabId:
        typeof currentTabId === "number" ? currentTabId : null,
      closedTabUrl: currentUrl ?? null,
      errorMessage: null,
    };
  }

  if (strategy === STRATEGIES.CLOSE_OLD_KEEP_NEW) {
    await chrome.tabs.remove(existingTabId);
    return {
      ok: true,
      strategy,
      currentTabId: typeof currentTabId === "number" ? currentTabId : null,
      currentTabUrl: currentUrl ?? null,
      existingTabId,
      existingTabUrl: existingTabUrl ?? null,
      affectedWindowId:
        typeof existingWindowId === "number" ? existingWindowId : null,
      activatedTabId: null,
      closedTabId: existingTabId,
      closedTabUrl: existingTabUrl ?? null,
      errorMessage: null,
    };
  }

  if (strategy === STRATEGIES.KEEP_BOTH) {
    return {
      ok: true,
      strategy,
      currentTabId: typeof currentTabId === "number" ? currentTabId : null,
      currentTabUrl: currentUrl ?? null,
      existingTabId,
      existingTabUrl: existingTabUrl ?? null,
      affectedWindowId:
        typeof existingWindowId === "number" ? existingWindowId : null,
      activatedTabId: null,
      closedTabId: null,
      closedTabUrl: null,
      errorMessage: null,
    };
  }

  return {
    ok: false,
    strategy,
    currentTabId: typeof currentTabId === "number" ? currentTabId : null,
    currentTabUrl: currentUrl ?? null,
    existingTabId,
    existingTabUrl: existingTabUrl ?? null,
    affectedWindowId:
      typeof existingWindowId === "number" ? existingWindowId : null,
    activatedTabId: null,
    closedTabId: null,
    closedTabUrl: null,
    errorMessage: "Unknown strategy",
  };
}
