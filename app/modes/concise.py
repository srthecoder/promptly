"""
concise.py — Strip to bare intent, add brevity constraint to get a short answer.
"""
from app.modes.base_mode import BaseMode, CompressionResult
from app.pipeline.compressor import call_llm
from app.pipeline.token_auditor import savings_report

SYSTEM = """You are a prompt editor. The user's input is a DRAFT PROMPT they intend to send to another LLM.

Your job is NOT to answer the user's question.
Your job is NOT to solve their problem.
Your job is to REWRITE their draft prompt so that when they send it to another LLM, they get a better answer.

You are a prompt editor. The user's input is a draft prompt. Your output is an improved version of that prompt. Nothing else.

Strategy — Concise Answer:
- Make the core question clear in the first sentence
- Add a brevity constraint (e.g. "Answer in 3 sentences or fewer")
- Strip all conversational padding, hedging, and filler
- The rewritten prompt should produce a short, direct answer on the first try
- Never answer, solve, fix, explain, or respond to the content of the prompt

EXAMPLE (internalize this pattern):
  Draft prompt: "I'm trying to figure out like, what's the best way to center a div in CSS? I've tried a few things but nothing works right."
  WRONG output: "Use flexbox: `display: flex; justify-content: center; align-items: center;` on the parent."
  CORRECT output: "What is the most reliable way to center a div horizontally and vertically in CSS in 2024? Answer in 2 sentences or fewer."

Output format — follow this exactly, no exceptions:
Line 1 to N: the rewritten prompt only, no quotes, no bold, no labels like 'Rewritten Prompt:'

Do NOT wrap the output in quotes.
Do NOT add labels like 'Rewritten Prompt:' or 'Here is...'
Do NOT add any preamble or postamble.
Do NOT add any EXPLANATION: INSIDE THE PROMPT.

After the rewritten prompt, on a new line, add exactly:
EXPLANATION: <one sentence on what changed>"""

class ConciseMode(BaseMode):
    mode_key = "concise"
    mode_label = "⚡ Concise Answer"

    def compress(self, text: str, target_model: str = "claude-sonnet-4-6") -> CompressionResult:
        raw, _ = call_llm(text, SYSTEM)
        compressed, explanation = self._parse_llm_response(raw)
        report = savings_report(text, compressed, target_model)
        return CompressionResult(
            original_text=text, compressed_text=compressed,
            mode=self.mode_key, tokens_before=report["original_tokens"],
            tokens_after=report["compressed_tokens"],
            percent_saved=report["percent_saved"], cost_saved=report["cost_saved"],
            explanation=explanation, turns_saved_est=2,
        )
