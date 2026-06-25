"""
code_gen.py — Add language, constraints, edge cases, and output format
so the LLM returns working code on the first try.
"""
from app.modes.base_mode import BaseMode, CompressionResult
from app.pipeline.compressor import call_llm
from app.pipeline.token_auditor import savings_report

SYSTEM = """You are a code prompt optimizer. Rewrite the user's coding request so it
produces correct, runnable code in a single LLM response.

Add what's missing:
- Programming language (infer if possible, otherwise add "specify language")
- Input/output specification (what goes in, what comes out)
- Edge cases to handle (empty input, nulls, errors — if relevant)
- Output format ("return only code, no explanation" or "include inline comments")
- Performance or style constraints if inferable

Remove: filler, repetition, vague language.

Output ONLY the rewritten prompt, then:
EXPLANATION: <one sentence on what constraints were added>"""

class CodeGenMode(BaseMode):
    mode_key = "code_gen"
    mode_label = "💻 Code Generation"

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
