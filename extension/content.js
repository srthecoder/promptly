/**
 * content.js — Injected after overlay.js on claude.ai, chat.openai.com, gemini.google.com.
 * Finds the active textarea, listens for the optimize-prompt command forwarded
 * from background.js, and drives the overlay.
 */

const SITE_SELECTOR = (() => {
  const host = location.hostname;
  if (host.includes("claude.ai"))       return 'div[contenteditable="true"]';
  if (host.includes("chat.openai.com")) return "#prompt-textarea";
  if (host.includes("gemini.google.com")) return ".ql-editor";
  return 'textarea, div[contenteditable="true"]';
})();

const MODE_LABELS = {
  cost_min:      "Cost Minimizer",
  concise:       "Concise Answer",
  deep_research: "Deep Research",
  code_gen:      "Code Generation"
};

function getTextarea() {
  return document.querySelector(SITE_SELECTOR);
}

function readText(el) {
  if (!el) return "";
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return el.value;
  return el.innerText ?? el.textContent ?? "";
}

function writeText(el, text) {
  if (!el) return;

  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, "value"
    )?.set ?? Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, "value"
    )?.set;
    nativeSetter?.call(el, text);
    el.dispatchEvent(new Event("input",  { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  // contenteditable
  el.focus();
  // Select all and replace so frameworks see the change
  document.execCommand("selectAll", false, null);
  document.execCommand("insertText", false, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function optimize() {
  const el = getTextarea();
  const prompt = readText(el).trim();

  if (!prompt) return;

  const { defaultMode = "cost_min" } = await chrome.storage.sync.get("defaultMode");
  const modeName = MODE_LABELS[defaultMode] ?? "Cost Minimizer";

  window.PromptlyOverlay.showLoading(modeName);

  chrome.runtime.sendMessage(
    { type: "OPTIMIZE", prompt, mode: defaultMode },
    (resp) => {
      if (chrome.runtime.lastError || !resp) {
        window.PromptlyOverlay.showError(
          chrome.runtime.lastError?.message ?? "Extension error — try reloading."
        );
        return;
      }

      if (!resp.ok) {
        window.PromptlyOverlay.showError(resp.error);
        return;
      }

      window.PromptlyOverlay.showResult({
        original:    prompt,
        optimized:   resp.optimized,
        explanation: resp.explanation ?? "",
        tokensBefore: resp.tokensBefore,
        tokensAfter:  resp.tokensAfter,
        modeName,
        onUse: (text) => writeText(el, text)
      });
    }
  );
}

// ── Listen for command forwarded by background.js ─────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "PROMPTLY_COMMAND") optimize();
});
