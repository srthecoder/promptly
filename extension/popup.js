/**
 * popup.js — Wires popup.html to chrome.storage.sync.
 */

const apiKeyInput   = document.getElementById("api-key");
const saveBtn       = document.getElementById("save-btn");
const saveFeedback  = document.getElementById("save-feedback");
const modeSelect    = document.getElementById("mode-select");
const statusDot     = document.getElementById("status-dot");
const statusLabel   = document.getElementById("status-label");

function setStatus(hasKey) {
  statusDot.className   = "status-dot " + (hasKey ? "ok" : "err");
  statusLabel.textContent = hasKey ? "ready" : "no key";
}

// Load saved values
chrome.storage.sync.get(["groqKey", "defaultMode"], (data) => {
  if (data.groqKey)     apiKeyInput.value  = data.groqKey;
  if (data.defaultMode) modeSelect.value   = data.defaultMode;
  setStatus(!!data.groqKey?.trim());
});

// Save
saveBtn.addEventListener("click", () => {
  const key  = apiKeyInput.value.trim();
  const mode = modeSelect.value;

  chrome.storage.sync.set({ groqKey: key, defaultMode: mode }, () => {
    setStatus(!!key);
    saveFeedback.classList.add("show");
    setTimeout(() => saveFeedback.classList.remove("show"), 2000);
  });
});

// Mode changes save immediately
modeSelect.addEventListener("change", () => {
  chrome.storage.sync.set({ defaultMode: modeSelect.value });
});
