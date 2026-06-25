"""
code_gen.py — Add language, constraints, edge cases, and output format
so the LLM returns working code on the first try.
"""
from app.modes.base_mode import BaseMode, CompressionResult
from app.pipeline.compressor import call_llm
from app.pipeline.token_auditor import savings_report

SYSTEM = """You are a prompt editor. The user's input is a DRAFT PROMPT they intend to send to another LLM.

Your job is NOT to answer the user's question.
Your job is NOT to write the code they are asking for.
Your job is to REWRITE their draft prompt so that when they send it to another LLM, they get better code on the first try.

You are a prompt editor. The user's input is a draft prompt. Your output is an improved version of that prompt. Nothing else.

Strategy — Code Generation:
- Infer and specify the programming language if not stated
- Add input/output specification (what goes in, what comes out)
- Add edge cases to handle if relevant (empty input, nulls, errors)
- Add output format instruction ("return only code, no explanation" or "include inline comments")
- Add performance or style constraints if inferable
- Remove filler, repetition, vague language
- Never write, fix, or complete the code itself — only improve the prompt asking for it

EXAMPLE (internalize this pattern):
  Draft prompt: "fix my SQLAlchemy N+1 query [code snippet]"
  WRONG output: [the actual fixed code using joinedload]
  CORRECT output: "Fix the SQLAlchemy N+1 query in the following Python code. Use joinedload or subqueryload to fetch related objects in a single query. Return only the corrected code with a one-line inline comment explaining the fix. Do not change any other logic. [code snippet]"

Output format — follow this exactly, no exceptions:
Line 1 to N: the rewritten prompt only, no quotes, no bold, no labels like 'Rewritten Prompt:'

Do NOT wrap the output in quotes.
Do NOT add labels like 'Rewritten Prompt:' or 'Here is...'
Do NOT add any preamble or postamble.
Do NOT add any EXPLANATION: INSIDE THE PROMPT.

After the rewritten prompt, on a new line, add exactly:
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
