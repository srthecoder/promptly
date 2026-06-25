"""
concise.py — Strip to bare intent, add brevity constraint to get a short answer.
"""
from app.modes.base_mode import BaseMode, CompressionResult
from app.pipeline.compressor import call_llm
from app.pipeline.token_auditor import savings_report

SYSTEM = """You are a prompt clarity optimizer. Rewrite the user's prompt so that:
1. The core question is immediately clear in the first sentence
2. A brevity constraint is added (e.g. "Answer in 3 sentences or fewer")
3. All conversational padding, hedging, and filler is removed
4. The rewritten prompt will get a short, direct answer on the first try

Output ONLY the rewritten prompt, then:
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
