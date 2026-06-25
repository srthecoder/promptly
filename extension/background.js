/**
 * background.js — Service worker.
 * Receives {type:"OPTIMIZE", prompt, mode} from content.js,
 * calls Groq, returns {optimized, tokensBefore, tokensAfter}.
 * Forwards the "optimize-prompt" keyboard command to the active tab.
 */

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL    = "llama-3.1-8b-instant";

const REWRITER_PREFIX = `You are a prompt rewriter, not an assistant.
The user's input is a DRAFT PROMPT they want to send to another LLM. Your ONLY job is to rewrite that draft into a better, clearer, more efficient version of the same prompt.

DO NOT answer the question.
DO NOT generate code, analysis, or any content.
DO NOT add labels like 'Rewritten Prompt:'.
DO NOT wrap output in quotes.
ONLY output the rewritten prompt, then on the last line:
EXPLANATION: <one sentence on what changed>

NEVER remove code blocks, variable names, schemas, or technical specifications — preserve them verbatim.`;

const SYSTEM_PROMPTS = {
  cost_min: `${REWRITER_PREFIX}

Strategy — Cost Minimizer:
- Remove filler, hedging, repetition, conversational padding
- Collapse verbose phrasing to direct, dense language
- Preserve 100% of the logical intent and all technical details`,

  concise: `${REWRITER_PREFIX}

Strategy — Concise Answer:
- Make the core question clear in the first sentence
- Add a brevity constraint (e.g. "Answer in 3 sentences or fewer")
- Strip all conversational padding, hedging, and filler`,

  deep_research: `${REWRITER_PREFIX}

Strategy — Deep Research:
- Add explicit scope (what to cover and what to exclude)
- Add requested output format (sections, headers, bullets as appropriate)
- Add depth signals: "be thorough", "include tradeoffs", "cite reasoning"
- The rewritten prompt may be longer than the original if the original was vague — that is intentional`,

  code_gen: `${REWRITER_PREFIX}

Strategy — Code Generation:
- Infer and specify the programming language if not stated
- Add input/output specification
- Add edge cases to handle if relevant (empty input, nulls, errors)
- Add output format instruction ("return only code, no explanation" or "include inline comments")
- NEVER write, fix, or complete the code — only improve the prompt asking for it`
};

function estimateTokens(text) {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  return Math.round(words * 1.3);
}

function parseResponse(raw) {
  const marker = raw.lastIndexOf("EXPLANATION:");
  if (marker === -1) return { optimized: raw.trim(), explanation: "" };
  return {
    optimized:   raw.slice(0, marker).trim(),
    explanation: raw.slice(marker + "EXPLANATION:".length).trim()
  };
}

async function callGroq(prompt, mode, apiKey) {
  const system = SYSTEM_PROMPTS[mode] ?? SYSTEM_PROMPTS.cost_min;

  const res = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.1,
      messages: [
        { role: "system", content: system },
        { role: "user",   content: `Rewrite this draft prompt:\n\n${prompt}` }
      ]
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Groq error ${res.status}`);
  }

  const data = await res.json();
  const raw  = data?.choices?.[0]?.message?.content ?? "";
  return parseResponse(raw);
}

// ── Message handler (from content.js) ────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "OPTIMIZE") return;

  chrome.storage.sync.get(["groqKey", "defaultMode"], async (stored) => {
    const apiKey = stored.groqKey?.trim();
    if (!apiKey) {
      sendResponse({ ok: false, error: "No Groq API key. Open Promptly and add one." });
      return;
    }

    const mode = msg.mode ?? stored.defaultMode ?? "cost_min";

    try {
      const { optimized, explanation } = await callGroq(msg.prompt, mode, apiKey);
      sendResponse({
        ok: true,
        optimized,
        explanation,
        tokensBefore: estimateTokens(msg.prompt),
        tokensAfter:  estimateTokens(optimized)
      });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  });

  return true; // keep message channel open for async
});

// ── Forward keyboard command to active tab ────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "optimize-prompt") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { action: "optimize" });
  } catch (err) {
    // content script not ready — inject it manually then retry
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["overlay.js"] });
    setTimeout(() => {
      chrome.tabs.sendMessage(tab.id, { action: "optimize" });
    }, 500);
  }
});
