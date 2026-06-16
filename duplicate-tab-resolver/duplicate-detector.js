import { isBlacklistedUrl, isProcessableUrl } from "./url-rules.js";

export async function findDuplicateTab({ currentTabId, currentUrl, settings }) {
  const queryInfo = settings.scope === "current_window" ? { currentWindow: true } : {};
  const allTabs = await chrome.tabs.query(queryInfo);
  const candidateTabs = [];

  for (const tab of allTabs) {
    if (!tab?.id || tab.id === currentTabId) {
      continue;
    }

    if (!tab.url || !isProcessableUrl(tab.url)) {
      continue;
    }

    if (isBlacklistedUrl(tab.url, settings.blacklist)) {
      continue;
    }

    if (tab.url !== currentUrl) {
      continue;
    }

    candidateTabs.push(tab);
  }

  if (!candidateTabs.length) {
    return { hasDuplicate: false };
  }

  const existingTab = pickExistingTab(candidateTabs);
  return {
    hasDuplicate: true,
    existingTabId: existingTab.id,
    existingWindowId: existingTab.windowId,
    existingUrl: existingTab.url,
  };
}

export function pickExistingTab(candidateTabs) {
  return [...candidateTabs].sort((a, b) => {
    const leftId = typeof a.id === "number" ? a.id : Number.MAX_SAFE_INTEGER;
    const rightId = typeof b.id === "number" ? b.id : Number.MAX_SAFE_INTEGER;
    return leftId - rightId;
  })[0];
}
