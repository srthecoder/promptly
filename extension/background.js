/**
 * background.js — Service worker.
 * Single strategy: RESTRUCTURE via local DSPy server.
 * Receives {type:"OPTIMIZE", prompt} from content.js, returns result.
 * Forwards the "optimize-prompt" keyboard command to the active tab.
 */

importScripts('pricing.js');

// Keep service worker alive for MV3
// onCommand won't fire if the worker is asleep
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Promptly] Extension installed/updated');
});

chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // no-op — just keeps the worker awake
  }
});

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
      const tokens = Math.round(wordCount * 1.3);
      const cost_data = msg.model_key
        ? getCostBreakdown({
            model_key:    msg.model_key,
            input_tokens:  tokens,
            output_tokens: tokens,
            images:        msg.images    || [],
            pdf_pages:     msg.pdf_pages || 0
          })
        : null;
      console.log('[Promptly] cost_data (short-prompt):', cost_data);
      sendResponse({
        ok: true,
        structured: msg.prompt,
        explanation: "Prompt is already concise.",
        original_tokens: tokens,
        restructured_tokens: tokens,
        token_delta: 0,
        prompt_shortened: false,
        format_used: "pipe",
        cost_data
      });
      return true;
    }

    optimizePrompt(msg.prompt)
      .then(result => {
        const input_tokens = result.input_tokens_used
          || Math.round((msg.prompt.split(/\s+/).length) * 1.3);
        const output_tokens = result.output_tokens_used
          || Math.round(((result.structured || "").split(/\s+/).length) * 1.3);

        const cost_data = msg.model_key
          ? getCostBreakdown({
              model_key:    msg.model_key,
              input_tokens,
              output_tokens,
              images:       msg.images    || [],
              pdf_pages:    msg.pdf_pages || 0
            })
          : null;

        console.log('[Promptly] cost_data:', cost_data);
        sendResponse({ ok: true, ...result, cost_data });
      })
      .catch(err => sendResponse({
        ok: false,
        error: err.message
      }));

    return true;
  }
);

// ── Forward keyboard command to active tab ────────────────────────────────────

chrome.commands.onCommand.addListener((command) => {
  console.log('[Promptly] onCommand fired:', command);
  if (command !== 'optimize-prompt') return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    console.log('[Promptly] sending OPTIMIZE to tab:', tabs[0]?.id);
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: 'OPTIMIZE' });
  });
});
