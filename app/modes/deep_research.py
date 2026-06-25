"""
deep_research.py — Expand prompt with structure, scope, and format constraints
so the LLM returns a thorough, well-organized answer in one shot.
"""
from app.modes.base_mode import BaseMode, CompressionResult
from app.pipeline.compressor import call_llm
from app.pipeline.token_auditor import savings_report

SYSTEM = """You are a research prompt architect. Rewrite the user's prompt so it
produces a comprehensive, well-structured answer in a single LLM response.

Add what's missing:
- Explicit scope (what to cover and what to exclude)
- Requested output format (sections, headers, bullet points as appropriate)
- Depth signal ("be thorough", "include tradeoffs", "cite reasoning")
- Audience or context if inferable

Remove: filler, repetition, conversational padding.

The rewritten prompt should be longer and more structured than the original
if the original was vague — that's intentional.

Output ONLY the rewritten prompt, then:
EXPLANATION: <one sentence on what was added/changed>"""

class DeepResearchMode(BaseMode):
    mode_key = "deep_research"
    mode_label = "🔬 Deep Research"

    def compress(self, text: str, target_model: str = "claude-sonnet-4-6") -> CompressionResult:
        raw, _ = call_llm(text, SYSTEM)
        compressed, explanation = self._parse_llm_response(raw)
        report = savings_report(text, compressed, target_model)
        return CompressionResult(
            original_text=text, compressed_text=compressed,
            mode=self.mode_key, tokens_before=report["original_tokens"],
            tokens_after=report["compressed_tokens"],
            percent_saved=report["percent_saved"], cost_saved=report["cost_saved"],
            explanation=explanation, turns_saved_est=3,
        )
