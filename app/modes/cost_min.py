"""
cost_min.py — Aggressive token compression, preserve 100% intent.
"""
from app.modes.base_mode import BaseMode, CompressionResult
from app.pipeline.compressor import call_llm
from app.pipeline.token_auditor import count_tokens, savings_report

SYSTEM = """You are a prompt editor. The user's input is a DRAFT PROMPT they intend to send to another LLM.

Your job is NOT to answer the user's question.
Your job is NOT to solve their problem.
Your job is to REWRITE their draft prompt so that when they send it to another LLM, they get a better answer.

You are a prompt editor. The user's input is a draft prompt. Your output is an improved version of that prompt. Nothing else.

Strategy — Cost Minimizer:
- Remove filler, hedging, repetition, conversational padding
- Collapse verbose phrasing to direct, dense language
- Preserve 100% of the logical intent and all technical details
- Never answer, solve, fix, explain, or respond to the content of the prompt

EXAMPLE (internalize this pattern):
  Draft prompt: "Hey so I was wondering, could you maybe help me understand, like, what is the difference between TCP and UDP? I'm kind of confused about it."
  WRONG output: "TCP is connection-oriented and guarantees delivery. UDP is connectionless and faster but unreliable. Use TCP for reliability, UDP for speed."
  CORRECT output: "Explain the difference between TCP and UDP: connection model, delivery guarantees, and when to use each."

Output format — follow this exactly, no exceptions:
Line 1 to N: the rewritten prompt only, no quotes, no bold, no labels like 'Rewritten Prompt:'

Do NOT wrap the output in quotes.
Do NOT add labels like 'Rewritten Prompt:' or 'Here is...'
Do NOT add any preamble or postamble.
Do NOT add any EXPLANATION: INSIDE THE PROMPT.

After the rewritten prompt, on a new line, add exactly:
EXPLANATION: <one sentence describing the key changes made>"""

class CostMinMode(BaseMode):
    mode_key = "cost_min"
    mode_label = "💰 Cost Minimizer"

    def compress(self, text: str, target_model: str = "claude-sonnet-4-6") -> CompressionResult:
        raw, backend = call_llm(text, SYSTEM)
        compressed, explanation = self._parse_llm_response(raw)
        report = savings_report(text, compressed, target_model)
        return CompressionResult(
            original_text=text, compressed_text=compressed,
            mode=self.mode_key, tokens_before=report["original_tokens"],
            tokens_after=report["compressed_tokens"],
            percent_saved=report["percent_saved"], cost_saved=report["cost_saved"],
            explanation=explanation, turns_saved_est=0,
        )
