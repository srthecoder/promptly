/**
 * background.js — Service worker.
 * Single strategy: RESTRUCTURE via local DSPy server.
 * Receives {type:"OPTIMIZE", prompt} from content.js, returns result.
 * Forwards the "optimize-prompt" keyboard command to the active tab.
 */

async function optimizePrompt(prompt) {
  try {
    const response = await fetch(
      "https://rikaaaaaa-promptly.hf.space/optimize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      }
    );
    if (!response.ok) {
      throw new Error(
        "DSPy server not running. " +
        "Open Terminal and run: " +
        "cd promptly/dspy-server && " +
        "uvicorn server:app --port 8000"
      );
    }
    return await response.json();
  } catch (err) {
    if (err.message.includes("Failed to fetch")) {
      throw new Error(
        "DSPy server not running. " +
        "Start it with: uvicorn server:app --port 8000"
      );
    }
    throw err;
  }
}

chrome.runtime.onMessage.addListener(
  (msg, _, sendResponse) => {
    if (msg.type !== "OPTIMIZE") return;

    const wordCount = msg.prompt.trim()
      .split(/\s+/).length;

    if (wordCount < 8) {
      sendResponse({
        ok: true,
        structured: msg.prompt,
        explanation: "Prompt is already concise.",
        original_tokens: Math.round(wordCount * 1.3),
        restructured_tokens: Math.round(wordCount * 1.3),
        token_delta: 0,
        prompt_shortened: false,
        format_used: "pipe"
      });
      return true;
    }

    optimizePrompt(msg.prompt)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(err => sendResponse({
        ok: false,
        error: err.message
      }));

    return true;
  }
);

// ── Forward keyboard command to active tab ────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'optimize-prompt') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'optimize' });
  } catch (err) {
    console.warn('Promptly: could not reach content script', err);
  }
});
