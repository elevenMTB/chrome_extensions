import {
  RUNTIME_MESSAGES,
  STRATEGY_OPTIONS,
  UNDO_STATUSES,
} from "./constants.js";
import {
  loadSettings,
  normalizeBlacklist,
  normalizeWhitelist,
  saveSettings,
} from "./settings-store.js";
import { syncActionHistoryExpiry } from "./history-store.js";

const form = document.getElementById("settings-form");
const enabledInput = document.getElementById("enabled");
const strategySelect = document.getElementById("duplicate-strategy");
const undoWindowSecondsInput = document.getElementById("undo-window-seconds");
const maxActionHistoryInput = document.getElementById("max-action-history");
const whitelistTextarea = document.getElementById("whitelist");
const blacklistTextarea = document.getElementById("blacklist");
const statusMessage = document.getElementById("status-message");
const historyList = document.getElementById("history-list");
const undoButton = document.getElementById("undo-button");
const refreshHistoryButton = document.getElementById("refresh-history-button");

function renderStrategyOptions() {
  for (const option of STRATEGY_OPTIONS) {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    strategySelect.appendChild(element);
  }
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.style.color = isError ? "#fca5a5" : "#86efac";
}

async function fillForm() {
  const settings = await loadSettings();
  enabledInput.checked = settings.enabled;
  strategySelect.value = settings.duplicateStrategy;
  undoWindowSecondsInput.value = String(settings.undoWindowSeconds);
  maxActionHistoryInput.value = String(settings.maxActionHistory);
  whitelistTextarea.value = settings.whitelist.join("\n");
  blacklistTextarea.value = settings.blacklist.join("\n");
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function getUndoState(record) {
  if (
    record.undoStatus === UNDO_STATUSES.PENDING &&
    typeof record.undoableUntil === "number" &&
    Date.now() > record.undoableUntil
  ) {
    return UNDO_STATUSES.EXPIRED;
  }

  return record.undoStatus;
}

function formatTimestamp(timestamp) {
  if (typeof timestamp !== "number") {
    return "Unknown time";
  }

  return new Date(timestamp).toLocaleString();
}

function formatStrategy(strategy) {
  const option = STRATEGY_OPTIONS.find((item) => item.value === strategy);
  return option?.label ?? strategy ?? "Unknown strategy";
}

function renderHistory(history) {
  historyList.textContent = "";

  if (!history.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No actions recorded yet.";
    historyList.appendChild(empty);
    return;
  }

  for (const record of history) {
    const item = document.createElement("li");
    item.className = "history-item";

    const header = document.createElement("div");
    header.className = "history-item-header";

    const title = document.createElement("strong");
    title.textContent = formatStrategy(record.strategy);

    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = getUndoState(record);

    header.append(title, pill);

    const meta = document.createElement("div");
    meta.className = "history-item-meta";
    meta.textContent = formatTimestamp(record.timestamp);

    const closedUrl = document.createElement("div");
    closedUrl.className = "history-item-url";
    closedUrl.textContent = record.closedTabUrl
      ? `Closed URL: ${record.closedTabUrl}`
      : "No tab was closed.";

    const currentUrl = document.createElement("div");
    currentUrl.className = "history-item-url";
    currentUrl.textContent = record.currentTabUrl
      ? `Triggered by: ${record.currentTabUrl}`
      : "Triggered URL unavailable.";

    item.append(header, meta, closedUrl, currentUrl);
    historyList.appendChild(item);
  }
}

async function refreshHistory() {
  const history = await syncActionHistoryExpiry();
  renderHistory(history);
  const undoableRecord = history.find(
    (record) => getUndoState(record) === UNDO_STATUSES.PENDING && record.undoable
  );
  undoButton.disabled = !undoableRecord;
}

async function handleSubmit(event) {
  event.preventDefault();
  setStatus("");

  const whitelist = normalizeWhitelist(whitelistTextarea.value.split(/\r?\n/));
  const blacklist = normalizeBlacklist(blacklistTextarea.value.split(/\r?\n/));
  const currentSettings = await loadSettings();
  const undoWindowSeconds = normalizePositiveInteger(
    undoWindowSecondsInput.value,
    currentSettings.undoWindowSeconds
  );
  const maxActionHistory = normalizePositiveInteger(
    maxActionHistoryInput.value,
    currentSettings.maxActionHistory
  );

  try {
    await saveSettings({
      enabled: enabledInput.checked,
      duplicateStrategy: strategySelect.value,
      whitelist,
      blacklist,
      scope: "all_windows",
      undoWindowSeconds,
      maxActionHistory,
    });

    undoWindowSecondsInput.value = String(undoWindowSeconds);
    maxActionHistoryInput.value = String(maxActionHistory);
    whitelistTextarea.value = whitelist.join("\n");
    blacklistTextarea.value = blacklist.join("\n");
    setStatus("Settings saved.");
  } catch (error) {
    console.error("Failed to save settings", error);
    setStatus("Failed to save settings.", true);
  }
}

async function handleUndoLatestAction() {
  setStatus("");

  try {
    const result = await chrome.runtime.sendMessage({
      type: RUNTIME_MESSAGES.UNDO_LATEST_ACTION,
    });

    if (!result?.ok) {
      setStatus("Nothing to undo right now.", true);
    } else {
      setStatus("Latest action undone.");
    }

    await refreshHistory();
  } catch (error) {
    console.error("Failed to undo latest action", error);
    setStatus("Failed to undo the latest action.", true);
  }
}

async function initialize() {
  renderStrategyOptions();

  try {
    await fillForm();
    await refreshHistory();
  } catch (error) {
    console.error("Failed to load settings", error);
    setStatus("Failed to load settings.", true);
  }

  form.addEventListener("submit", (event) => {
    void handleSubmit(event);
  });

  undoButton.addEventListener("click", () => {
    void handleUndoLatestAction();
  });

  refreshHistoryButton.addEventListener("click", () => {
    void refreshHistory();
  });
}

void initialize();
