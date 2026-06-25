"""
cost_min.py — Aggressive token compression, preserve 100% intent.
"""
from app.modes.base_mode import BaseMode, CompressionResult
from app.pipeline.compressor import call_llm
from app.pipeline.token_auditor import count_tokens, savings_report

SYSTEM = """You are a prompt token optimizer. Rewrite the user's input as the most
token-efficient version possible while preserving 100% of the logical intent.

Rules:
- Remove filler, hedging, repetition, conversational padding
- Collapse verbose phrasing to direct, dense language
- Never change the core meaning or intent
- Never add explanations or preamble
- Output ONLY the rewritten prompt, then on a new line:
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
