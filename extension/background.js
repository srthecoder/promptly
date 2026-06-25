/**
 * background.js — Service worker.
 * Receives {type:"OPTIMIZE", prompt, mode} from content.js,
 * calls Groq, returns {optimized, tokensBefore, tokensAfter}.
 * Forwards the "optimize-prompt" keyboard command to the active tab.
 */

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL    = "llama-3.1-8b-instant";

const SYSTEM_PROMPTS = {
  cost_min: `You are a prompt token optimizer. Rewrite the user's input as the most token-efficient version possible while preserving 100% of the logical intent.

Rules:
- Remove filler, hedging, repetition, conversational padding
- Collapse verbose phrasing to direct, dense language
- Never change the core meaning or intent
- Never add explanations or preamble
- Output ONLY the rewritten prompt, then on a new line:
EXPLANATION: <one sentence describing the key changes made>`,

  concise: `You are a prompt clarity optimizer. Rewrite the user's prompt so that:
1. The core question is immediately clear in the first sentence
2. A brevity constraint is added (e.g. "Answer in 3 sentences or fewer")
3. All conversational padding, hedging, and filler is removed

Output ONLY the rewritten prompt, then:
EXPLANATION: <one sentence on what changed>`,

  deep_research: `You are a research prompt architect. Rewrite the user's prompt so it produces a comprehensive, well-structured answer in a single LLM response.

Add: explicit scope, requested output format, depth signal ("be thorough", "include tradeoffs").
Remove: filler, repetition, padding.

Output ONLY the rewritten prompt, then:
EXPLANATION: <one sentence on what was added/changed>`,

  code_gen: `You are a code prompt optimizer. Rewrite the user's coding request so it produces correct, runnable code in a single LLM response.

Add: programming language (infer if possible), input/output spec, edge cases, output format.
Remove: filler, vague language.

Output ONLY the rewritten prompt, then:
EXPLANATION: <one sentence on what constraints were added>`
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
        { role: "user",   content: prompt }
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
chrome.commands.onCommand.addListener((command) => {
  if (command !== "optimize-prompt") return;

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "PROMPTLY_COMMAND" });
  });
});
