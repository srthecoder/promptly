"""
doc_query.py — For querying documents/PDFs. Combines semantic extraction
with a sharp question so the LLM answers directly without needing RAG.
"""
from app.modes.base_mode import BaseMode, CompressionResult
from app.pipeline.compressor import call_llm
from app.pipeline.token_auditor import savings_report

SYSTEM = """You are a document query optimizer. The user has provided text from a
document and a question they want answered.

Your job:
1. Identify the question being asked (may be implicit)
2. Rewrite the query as: [sharp, direct question] + [only the relevant context needed]
3. Remove all irrelevant document sections from the context
4. Add: "Answer only from the provided context. If not found, say so."

Output ONLY the optimized query + minimal context, then:
EXPLANATION: <one sentence on how context was filtered>"""

class DocQueryMode(BaseMode):
    mode_key = "doc_query"
    mode_label = "📄 Document Query"

    def compress(self, text: str, target_model: str = "claude-sonnet-4-6") -> CompressionResult:
        raw, _ = call_llm(text, SYSTEM)
        compressed, explanation = self._parse_llm_response(raw)
        report = savings_report(text, compressed, target_model)
        return CompressionResult(
            original_text=text, compressed_text=compressed,
            mode=self.mode_key, tokens_before=report["original_tokens"],
            tokens_after=report["compressed_tokens"],
            percent_saved=report["percent_saved"], cost_saved=report["cost_saved"],
            explanation=explanation, turns_saved_est=1,
        )
