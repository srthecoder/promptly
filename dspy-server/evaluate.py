"""
Evaluate the compiled Promptly program against
a held-out test set.

Measures:
1. Restructure quality score (0-1) per example
2. Average score across test set
3. Format distribution (pipe/markdown/xml)
4. Token savings per example
5. Semantic preservation (LLM-as-judge)

Run after optimize.py:
python evaluate.py
"""

import os
import dspy
from dspy.evaluate import Evaluate
from pipeline import (
    PromptlyPipeline,
    restructure_reward,
    RestructureSignature
)


# ── Held-out test set ─────────────────────────────
# Deliberately different from TRAINSET.
# Tests generalization, not memorization.

TESTSET = [
    dspy.Example(
        raw_prompt=(
            "hey could you help me understand what "
            "the difference is between a list and "
            "a tuple in python i always get confused"
        ),
        output={
            "structured": (
                "Task: explain list vs tuple in Python | "
                "Focus: practical difference + when to use each | "
                "Format: 2 sentences"
            ),
            "format_used": "pipe",
            "explanation": "Removed filler, distilled to pipe."
        }
    ).with_inputs("raw_prompt"),

    dspy.Example(
        raw_prompt=(
            "I need a blog post written in a casual "
            "friendly tone avoiding technical jargon "
            "about why sleep is important for "
            "productivity. Keep it under 300 words."
        ),
        output={
            "structured": (
                "## Task\n"
                "Blog post: sleep and productivity\n\n"
                "## Style\n"
                "[Style:Friendly] [Style:NoJargon] "
                "[Style:Concise]\n\n"
                "## Output\n"
                "Under 300 words"
            ),
            "format_used": "markdown",
            "explanation": "Tokenized style, markdown structure."
        }
    ).with_inputs("raw_prompt"),

    dspy.Example(
        raw_prompt=(
            "write me a sql query that gets all users "
            "who signed up in the last 30 days and "
            "have made at least one purchase"
        ),
        output={
            "structured": (
                "Task: SQL query | "
                "Filter: users.signup_date >= NOW()-30d "
                "AND purchases.count >= 1 | "
                "Output: query only"
            ),
            "format_used": "pipe",
            "explanation": "Compressed to pipe with precise filter spec."
        }
    ).with_inputs("raw_prompt"),

    dspy.Example(
        raw_prompt=(
            "Can you create a product requirements "
            "document for a mobile app feature that "
            "lets users track their daily water intake "
            "including user stories acceptance criteria "
            "and technical requirements"
        ),
        output={
            "structured": (
                "<task>Product requirements document</task>\n"
                "<feature>Mobile: daily water intake tracker</feature>\n"
                "<output>\n"
                "  <section>User stories</section>\n"
                "  <section>Acceptance criteria</section>\n"
                "  <section>Technical requirements</section>\n"
                "</output>"
            ),
            "format_used": "xml",
            "explanation": "Multi-section PRD → XML template."
        }
    ).with_inputs("raw_prompt"),

    dspy.Example(
        raw_prompt=(
            "explain the concept of recursion to a "
            "10 year old using a simple example"
        ),
        output={
            "structured": (
                "Task: explain recursion | "
                "[Audience:NonTechnical] | "
                "Output: simple analogy, 2-3 sentences"
            ),
            "format_used": "pipe",
            "explanation": "Tokenized audience, added output spec."
        }
    ).with_inputs("raw_prompt"),
]


# ── LLM-as-Judge for semantic preservation ────────

class SemanticPreservationJudge(dspy.Signature):
    """
    Judge whether the restructured prompt preserves
    the full semantic intent of the original prompt.
    A restructured prompt that changes, removes, or
    distorts the original intent scores lower.
    """
    original: str = dspy.InputField(
        desc="The original raw prompt."
    )
    restructured: str = dspy.InputField(
        desc="The restructured version."
    )
    preserved: bool = dspy.OutputField(
        desc=(
            "True if 100% of the original intent "
            "is preserved in the restructured version. "
            "False if any meaning was lost or changed."
        )
    )
    score: float = dspy.OutputField(
        desc="Preservation score 0.0 to 1.0."
    )


judge = dspy.ChainOfThought(SemanticPreservationJudge)


def semantic_preservation_metric(
    example: dspy.Example,
    prediction,
    trace=None
) -> float:
    """LLM-as-judge for semantic preservation."""
    try:
        structured = prediction.output.structured
        result = judge(
            original=example.raw_prompt,
            restructured=structured
        )
        return float(result.score)
    except Exception:
        return 0.0


def run_evaluation():
    # Configure with Groq for evaluation
    lm = dspy.LM(
        model="groq/llama-3.3-70b-versatile",
        api_key=os.environ["GROQ_API_KEY"],
        temperature=0.1
    )
    dspy.configure(lm=lm, track_usage=True)

    pipeline = PromptlyPipeline()

    # Load compiled if available
    COMPILED_PATH = "compiled/promptly.json"
    if os.path.exists(COMPILED_PATH):
        pipeline.load(path=COMPILED_PATH)
        print(f"Evaluating compiled program: {COMPILED_PATH}")
    else:
        print("Evaluating uncompiled program.")

    print(f"Test set size: {len(TESTSET)}")
    print("=" * 50)

    # ── Metric 1: Restructure quality ─────────────
    print("\nMETRIC 1: Restructure Quality Score")
    evaluator = Evaluate(
        devset=TESTSET,
        metric=restructure_reward,
        num_threads=4,
        display_progress=True,
        display_table=5
    )
    quality_score = evaluator(pipeline)
    print(f"Average quality score: {quality_score:.3f} / 1.0")

    # ── Metric 2: Semantic preservation ───────────
    print("\nMETRIC 2: Semantic Preservation (LLM-as-Judge)")
    semantic_evaluator = Evaluate(
        devset=TESTSET,
        metric=semantic_preservation_metric,
        num_threads=4,
        display_progress=True,
        display_table=5
    )
    semantic_score = semantic_evaluator(pipeline)
    print(f"Average semantic preservation: {semantic_score:.3f} / 1.0")

    # ── Metric 3: Per-example breakdown ───────────
    print("\nMETRIC 3: Per-Example Breakdown")
    print(f"{'Prompt':<40} {'Format':<10} {'Saved%':<10} {'Quality':<10}")
    print("-" * 70)

    total_savings = []
    format_counts = {"pipe": 0, "markdown": 0, "xml": 0}

    for example in TESTSET:
        result = pipeline.forward(example.raw_prompt)
        tokens_before = len(example.raw_prompt.split()) * 1.3
        tokens_after = len(result["structured"].split()) * 1.3
        pct_saved = round(
            (tokens_before - tokens_after)
            / max(tokens_before, 1) * 100, 1
        )
        total_savings.append(pct_saved)
        fmt = result["format_used"]
        if fmt in format_counts:
            format_counts[fmt] += 1

        # Quick quality check
        pred_obj = type('P', (), {
            'output': type('O', (), {
                'structured': result['structured']
            })()
        })()
        q = restructure_reward(example, pred_obj)

        print(
            f"{example.raw_prompt[:38]:<40} "
            f"{fmt:<10} "
            f"{pct_saved:<10} "
            f"{q:.2f}"
        )

    # ── Summary ───────────────────────────────────
    avg_savings = sum(total_savings) / len(total_savings)
    print("\n" + "=" * 50)
    print("EVALUATION SUMMARY")
    print("=" * 50)
    print(f"Test examples:           {len(TESTSET)}")
    print(f"Quality score:           {quality_score:.3f} / 1.0")
    print(f"Semantic preservation:   {semantic_score:.3f} / 1.0")
    print(f"Avg token savings:       {avg_savings:.1f}%")
    print(f"Format distribution:")
    for fmt, count in format_counts.items():
        pct = round(count / len(TESTSET) * 100)
        print(f"  {fmt:<12} {count} examples ({pct}%)")
    print("=" * 50)


if __name__ == "__main__":
    run_evaluation()
