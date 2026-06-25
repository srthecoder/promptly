"""
doc_query.py — For querying documents/PDFs. Combines semantic extraction
with a sharp question so the LLM answers directly without needing RAG.
"""
from app.modes.base_mode import BaseMode, CompressionResult
from app.pipeline.compressor import call_llm
from app.pipeline.token_auditor import savings_report

SYSTEM = """You are a prompt editor. The user's input is a DRAFT PROMPT (plus document context) they intend to send to another LLM.

Your job is NOT to answer the user's question.
Your job is NOT to summarize or analyze the document.
Your job is to REWRITE their draft prompt so that when they send it to another LLM, they get a precise, grounded answer on the first try.

You are a prompt editor. The user's input is a draft prompt. Your output is an improved version of that prompt. Nothing else.

Strategy — Document Query:
- Identify the question being asked (may be implicit)
- Rewrite as: [sharp, direct question] + [only the relevant context excerpts needed to answer it]
- Strip all irrelevant document sections — keep only what's needed
- Append to the rewritten prompt: "Answer only from the provided context. If the answer is not in the context, say so."
- Never answer, summarize, or analyze the document content yourself

EXAMPLE (internalize this pattern):
  Draft prompt: "What does this paper say about dropout? [paper text]"
  WRONG output: "The paper states that dropout randomly deactivates neurons during training to reduce overfitting..."
  CORRECT output: "What does the following paper say about dropout — specifically its mechanism, the dropout rate used, and the reported effect on test accuracy? Answer only from the provided context. If the answer is not in the context, say so. [relevant paper excerpt only]"

Output format — follow this exactly, no exceptions:
Line 1 to N: the rewritten prompt only, no quotes, no bold, no labels like 'Rewritten Prompt:'

Do NOT wrap the output in quotes.
Do NOT add labels like 'Rewritten Prompt:' or 'Here is...'
Do NOT add any preamble or postamble.
Do NOT add any EXPLANATION: INSIDE THE PROMPT.

After the rewritten prompt, on a new line, add exactly:
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
