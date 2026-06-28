import os
import time
import json
import math
import datetime
import dspy
from dspy.evaluate import Evaluate
from pipeline import RestructureSignature

# ── Models ────────────────────────────────────────

GROQ_KEY   = os.environ.get("GROQ_API_KEY", "")
GITHUB_KEY = os.environ.get("GITHUB_TOKEN", "")

pipeline_lm = dspy.LM(
    model="groq/llama-3.3-70b-versatile",
    api_key=GROQ_KEY,
    temperature=0.1,
    num_retries=1
)

judge_lm = dspy.LM(
    model="openai/gpt-4o-mini",
    api_key=GITHUB_KEY,
    api_base="https://models.inference.ai.azure.com",
    temperature=0.0,
    num_retries=1
)

# ── Per-example log (populated during evaluation) ─
EVAL_LOG = []

# ── Multi-Dimensional Judge Signature ─────────────
# Injects full pipeline rules so judge scores consistently
# Returns 4 separate integer scores — not one composite

class PromptQualityJudge(dspy.Signature):
    """
    You are evaluating a prompt restructuring tool called Promptly.

    Promptly follows these rules when restructuring:
    - Remove conversational filler ("hey so", "thanks", "could you maybe")
    - Replace style instructions with tokens:
      "friendly tone" → [Style:Friendly]
      "avoid jargon"  → [Style:NoJargon]
      "be concise"    → [Style:Concise]
      "step by step"  → [Format:Steps]
    - Choose format by complexity:
      pipe     → simple single question (under 25 words)
      markdown → medium complexity with style instructions
      xml      → complex multi-section output required
    - NEVER answer the question — only rewrite the prompt
    - NEVER use JSON format

    Score each dimension 1-3:

    DIMENSION 1 — Intent Preservation:
    1 = Original intent lost or changed
    2 = Core intent kept but some details dropped
    3 = 100% of original intent preserved

    DIMENSION 2 — Format Correctness:
    1 = Wrong format for complexity (e.g. xml for simple question)
    2 = Acceptable format but not optimal
    3 = Correct format choice for this prompt's complexity

    DIMENSION 3 — Constraint Adherence:
    1 = Output answers the question OR uses JSON
    2 = Rewrites but misses style/format instructions
    3 = All constraints preserved, no answering, no JSON

    DIMENSION 4 — Token Efficiency:
    1 = Output is longer than input with no added value
    2 = Similar length to input
    3 = Meaningfully shorter while preserving all intent
    """
    raw_prompt:       str = dspy.InputField(
        desc="The original unoptimized user prompt."
    )
    restructured:     str = dspy.InputField(
        desc="The restructured version produced by Promptly."
    )
    format_used:      str = dspy.InputField(
        desc="The format Promptly chose: pipe, markdown, or xml."
    )
    intent_score:     int = dspy.OutputField(
        desc="Intent preservation score: 1, 2, or 3."
    )
    format_score:     int = dspy.OutputField(
        desc="Format correctness score: 1, 2, or 3."
    )
    constraint_score: int = dspy.OutputField(
        desc="Constraint adherence score: 1, 2, or 3."
    )
    efficiency_score: int = dspy.OutputField(
        desc="Token efficiency score: 1, 2, or 3."
    )
    reasoning:        str = dspy.OutputField(
        desc="Two sentences: what worked and what could improve."
    )


def safe_int_score(value, default=1):
    """Parse score safely. Never crashes."""
    try:
        val = int(str(value).strip())
        return max(1, min(3, val))
    except (ValueError, TypeError):
        digits = [c for c in str(value) if c.isdigit()]
        if digits:
            return max(1, min(3, int(digits[0])))
        return default


def normalize(score):
    """G-Eval normalization: 1-3 → 0.0-1.0"""
    return float(score - 1) / 2.0


# ── Metric ────────────────────────────────────────

def restructure_reward(example, prediction, trace=None):
    """
    Multi-dimensional G-Eval metric.
    Returns mean of 4 normalized dimension scores.
    Logs full details per example to EVAL_LOG.
    time.sleep() is inside here — paces dspy.Evaluate.
    """
    # Validate output
    try:
        structured  = prediction.output.structured
        format_used = prediction.output.format_used
        explanation = prediction.output.explanation
    except AttributeError:
        EVAL_LOG.append({"error": "prediction missing output fields"})
        time.sleep(12)
        return float(0.0)

    if not structured or not structured.strip():
        EVAL_LOG.append({"error": "empty structured output"})
        time.sleep(12)
        return float(0.0)

    if isinstance(example, dict):
        raw = example.get("raw_prompt", "")
    else:
        raw = getattr(example, "raw_prompt", "")

    tokens_before = round(len(raw.split()) * 1.3)
    tokens_after  = round(len(structured.split()) * 1.3)
    token_delta   = tokens_before - tokens_after
    pct_saved     = round(
        token_delta / max(tokens_before, 1) * 100, 1
    )

    # G-Eval judge — separate model, separate rate bucket
    try:
        with dspy.context(lm=judge_lm):
            judgment = dspy.Predict(PromptQualityJudge)(
                raw_prompt=raw,
                restructured=structured,
                format_used=format_used
            )

        i_score = safe_int_score(judgment.intent_score)
        f_score = safe_int_score(judgment.format_score)
        c_score = safe_int_score(judgment.constraint_score)
        e_score = safe_int_score(judgment.efficiency_score)
        reasoning = str(judgment.reasoning)

    except Exception as err:
        print(f"    [Judge error: {err}]")
        i_score = f_score = c_score = e_score = 1
        reasoning = f"Judge failed: {err}"

    # Normalize each dimension 1-3 → 0.0-1.0
    i_norm = normalize(i_score)
    f_norm = normalize(f_score)
    c_norm = normalize(c_score)
    e_norm = normalize(e_score)

    # Mean of 4 dimensions
    mean_score = (i_norm + f_norm + c_norm + e_norm) / 4.0

    # Log everything per example
    EVAL_LOG.append({
        "raw_prompt":  raw,
        "structured":  structured,
        "format_used": format_used,
        "explanation": explanation,
        "token_metrics": {
            "tokens_before": tokens_before,
            "tokens_after":  tokens_after,
            "token_delta":   token_delta,
            "pct_saved":     pct_saved
        },
        "judge_scores": {
            "intent":     {"raw": i_score, "normalized": i_norm},
            "format":     {"raw": f_score, "normalized": f_norm},
            "constraint": {"raw": c_score, "normalized": c_norm},
            "efficiency": {"raw": e_score, "normalized": e_norm},
            "mean":       round(mean_score, 3)
        },
        "reasoning": reasoning
    })

    # Sleep INSIDE metric — required by dspy.Evaluate pattern
    time.sleep(12)

    return float(mean_score)


# ── Eval Pipeline ─────────────────────────────────

class EvalPipeline(dspy.Module):
    def __init__(self):
        super().__init__()
        self.predictor = dspy.Predict(RestructureSignature)

    def forward(self, raw_prompt: str):
        try:
            return self.predictor(raw_prompt=raw_prompt)
        except Exception as e:
            print(f"    [Pipeline error: {e}]")
            class _Out:
                structured  = ""
                format_used = "unknown"
                explanation = ""
            class _Pred:
                output = _Out()
            return _Pred()


# ── 30-Example Diverse Dataset ────────────────────
# 10 categories × 3 examples each
# Per golden rule: tight metric, diverse small dataset

DEVSET = [
    # CATEGORY 1: Research / Explanation
    dspy.Example(raw_prompt="Hey so I was doing some reading and I came across this topic and I was really curious. Could you maybe explain the difference between supervised and unsupervised machine learning? Thanks so much!").with_inputs("raw_prompt"),
    dspy.Example(raw_prompt="i was wondering if you could help me understand what the difference is between TCP and UDP protocols i keep seeing these terms but dont really get it").with_inputs("raw_prompt"),
    dspy.Example(raw_prompt="sorry to bother you but could you maybe explain what a transformer model is in AI i have heard about it but am not sure how it works exactly").with_inputs("raw_prompt"),

    # CATEGORY 2: Style Instructions
    dspy.Example(raw_prompt="Please write in a professional but friendly tone. Avoid jargon. Keep it short. Give examples. Explain compound interest.").with_inputs("raw_prompt"),
    dspy.Example(raw_prompt="write in a casual conversational tone avoid being too formal and please use bullet points and keep sentences short explain what a 401k is").with_inputs("raw_prompt"),
    dspy.Example(raw_prompt="be thorough and comprehensive use headers and sections provide citations where possible explain the history of the internet").with_inputs("raw_prompt"),

    # CATEGORY 3: Code Generation
    dspy.Example(raw_prompt="hey could you help me write a python function that sorts a list of dicts by age descending and handles missing age values").with_inputs("raw_prompt"),
    dspy.Example(raw_prompt="i need help writing a sql query that finds all customers who have placed more than 3 orders in the last 30 days and have spent more than 100 dollars total").with_inputs("raw_prompt"),
    dspy.Example(raw_prompt="can you write a javascript function that takes an array of strings and returns only the unique values without using a Set please include error handling").with_inputs("raw_prompt"),

    # CATEGORY 4: Multi-Section Output
    dspy.Example(raw_prompt="I need a competitive analysis starting with market overview then competitor breakdown with pricing and features then SWOT then three strategic recommendations").with_inputs("raw_prompt"),
    dspy.Example(raw_prompt="write a product requirements document for a mobile app that tracks daily water intake include user stories acceptance criteria and technical requirements and success metrics").with_inputs("raw_prompt"),
    dspy.Example(raw_prompt="create a comprehensive business plan for a coffee shop including executive summary market analysis operations plan financial projections and risk assessment").with_inputs("raw_prompt"),

    # CATEGORY 5: Simple / Short
    dspy.Example(raw_prompt="explain docker to someone with no technical background").with_inputs("raw_prompt"),
    dspy.Example(raw_prompt="what is the difference between a mutex and a semaphore").with_inputs("raw_prompt"),
    dspy.Example(raw_prompt="explain recursion using a simple real world example").with_inputs("raw_prompt"),

    # CATEGORY 6: Non-Technical Audience
    dspy.Example(raw_prompt="i need to explain to my grandmother what cloud storage is she is 75 years old and has never used a computer much can you help me write something she would understand").with_inputs("raw_prompt"),
    dspy.Example(raw_prompt="explain what inflation is to a 10 year old using examples they would relate to like candy or toys").with_inputs("raw_prompt"),
    dspy.Example(raw_prompt="my boss asked me to explain what an API is to the sales team who have no technical background can you help me write a simple explanation with an analogy").with_inputs("raw_prompt"),

    # CATEGORY 7: Creative / Writing
    dspy.Example(raw_prompt="write a short blog post about why sleep is important for productivity keep it under 300 words use a friendly casual tone and include 3 actionable tips").with_inputs("raw_prompt"),
    dspy.Example(raw_prompt="i need a linkedin post announcing my new job at a startup should be professional but not boring and end with something that encourages comments").with_inputs("raw_prompt"),
    dspy.Example(raw_prompt="write a cold email to a potential client who runs a medium sized ecommerce store offering our email marketing services keep it short and focused on their pain points").with_inputs("raw_prompt"),

    # CATEGORY 8: Data / Analysis
    dspy.Example(raw_prompt="i have a csv with columns date revenue customers and region i need you to help me write pandas code to find the top 3 regions by revenue growth month over month").with_inputs("raw_prompt"),
    dspy.Example(raw_prompt="explain the difference between mean median and mode and when you should use each one with real world examples").with_inputs("raw_prompt"),
    dspy.Example(raw_prompt="i need to summarize this dataset that shows monthly sales figures by product category the goal is to identify which categories are declining and might need attention").with_inputs("raw_prompt"),

    # CATEGORY 9: Debugging / Problem Solving
    dspy.Example(raw_prompt="my react app keeps showing a white screen after i added a new component i checked the console and it says cannot read properties of undefined reading map can you help").with_inputs("raw_prompt"),
    dspy.Example(raw_prompt="my python script is running really slowly it processes about 100k rows of data and takes 20 minutes is there a way to make it faster without changing the logic too much").with_inputs("raw_prompt"),
    dspy.Example(raw_prompt="i deployed my fastapi app to aws ec2 and it works locally but returns 502 bad gateway in production i am using nginx as a reverse proxy what should i check").with_inputs("raw_prompt"),

    # CATEGORY 10: Edge Cases
    dspy.Example(raw_prompt="?").with_inputs("raw_prompt"),
    dspy.Example(raw_prompt="write me something").with_inputs("raw_prompt"),
    dspy.Example(raw_prompt="hey so i was like thinking about asking you something but i forgot what it was but maybe you can help me with something related to like coding or maybe writing im not sure").with_inputs("raw_prompt"),
]


def compute_statistics(scores):
    """Compute mean, min, max, std dev from list of floats."""
    if not scores:
        return {}
    n        = len(scores)
    mean     = sum(scores) / n
    mn       = min(scores)
    mx       = max(scores)
    variance = sum((s - mean) ** 2 for s in scores) / n
    std      = math.sqrt(variance)
    return {
        "mean":  round(mean, 3),
        "min":   round(mn, 3),
        "max":   round(mx, 3),
        "std":   round(std, 3),
        "count": n
    }


def run_evaluation():
    groq_key   = os.environ.get("GROQ_API_KEY")
    github_key = os.environ.get("GITHUB_TOKEN")

    if not groq_key:
        print("ERROR: GROQ_API_KEY not set")
        print("Run: export GROQ_API_KEY=your_key")
        return

    if not github_key:
        print("ERROR: GITHUB_TOKEN not set")
        print("Get free: github.com/marketplace/models")
        print("Run: export GITHUB_TOKEN=your_pat")
        return

    dspy.configure(lm=pipeline_lm)

    pipeline  = EvalPipeline()
    timestamp = datetime.datetime.now().isoformat()
    run_id    = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

    print("=" * 65)
    print("PROMPTLY G-EVAL EVALUATION")
    print("-" * 65)
    print(f"Pipeline:   groq/llama-3.3-70b-versatile")
    print(f"Judge:      github-models/gpt-4o-mini")
    print(f"Method:     G-Eval 4-dimension rubric → mean 0.0-1.0")
    print(f"Dimensions: intent, format, constraint, efficiency")
    print(f"Examples:   {len(DEVSET)} (10 categories × 3 each)")
    print(f"Threads:    1 (sequential)")
    print(f"Delay:      12s inside metric")
    print(f"Run ID:     {run_id}")
    print("=" * 65)

    evaluator = Evaluate(
        devset=DEVSET,
        metric=restructure_reward,
        num_threads=1,
        display_progress=True,
        display_table=True
    )

    final_score = evaluator(pipeline)

    # Safe conversion of EvaluationResult
    try:
        score_float = float(final_score)
    except Exception:
        try:
            score_float = float(str(final_score).split()[0])
        except Exception:
            score_float = 0.0

    normalized = score_float / 100.0

    # Statistical analysis from per-example logs
    # EVAL_LOG is fully populated by this point — metric ran for every example
    all_means         = [e["judge_scores"]["mean"]                   for e in EVAL_LOG if "judge_scores" in e]
    intent_scores     = [e["judge_scores"]["intent"]["normalized"]    for e in EVAL_LOG if "judge_scores" in e]
    format_scores     = [e["judge_scores"]["format"]["normalized"]    for e in EVAL_LOG if "judge_scores" in e]
    constraint_scores = [e["judge_scores"]["constraint"]["normalized"] for e in EVAL_LOG if "judge_scores" in e]
    efficiency_scores = [e["judge_scores"]["efficiency"]["normalized"] for e in EVAL_LOG if "judge_scores" in e]
    token_savings     = [e["token_metrics"]["pct_saved"]              for e in EVAL_LOG if "token_metrics" in e]

    stats = {
        "overall":           compute_statistics(all_means),
        "intent":            compute_statistics(intent_scores),
        "format":            compute_statistics(format_scores),
        "constraint":        compute_statistics(constraint_scores),
        "efficiency":        compute_statistics(efficiency_scores),
        "token_savings_pct": compute_statistics(token_savings)
    }

    # Full record
    record = {
        "run_id":    run_id,
        "timestamp": timestamp,
        "config": {
            "pipeline_model": "groq/llama-3.3-70b-versatile",
            "judge_model":    "github-models/gpt-4o-mini",
            "judge_endpoint": "models.inference.ai.azure.com",
            "method":     "G-Eval 4-dimension rubric normalized 0-1",
            "dimensions": [
                "intent_preservation",
                "format_correctness",
                "constraint_adherence",
                "token_efficiency"
            ],
            "num_threads":  1,
            "delay_secs":   12,
            "dataset_size": len(DEVSET)
        },
        "summary": {
            "dspy_score_pct":  round(score_float, 2),
            "normalized_mean": round(normalized, 3),
            "statistics":      stats
        },
        "per_example": EVAL_LOG
    }

    fname_ts     = f"eval_results_{run_id}.json"
    fname_latest = "eval_results_latest.json"

    for fname in [fname_ts, fname_latest]:
        with open(fname, "w") as f:
            json.dump(record, f, indent=2)

    # Print full statistical summary
    print(f"\n{'='*65}")
    print("EVALUATION SUMMARY")
    print(f"{'='*65}")
    print(f"DSPy score:        {score_float:.1f}%")
    print(f"Normalized mean:   {normalized:.3f} / 1.0")
    print(f"\nPer-dimension statistics (mean ± std):")
    for dim in ["intent", "format", "constraint", "efficiency"]:
        s = stats[dim]
        if s:
            print(f"  {dim:<12} {s['mean']:.3f} ± {s['std']:.3f}  "
                  f"[min {s['min']:.2f} / max {s['max']:.2f}]")
    s = stats["token_savings_pct"]
    if s:
        print(f"\nToken savings:     {s['mean']:.1f}% avg  "
              f"[min {s['min']:.1f}% / max {s['max']:.1f}%]")
    print(f"\nExamples logged:   {len(EVAL_LOG)}")
    print(f"Saved:             {fname_ts}")
    print(f"Latest:            {fname_latest}")
    print(f"{'='*65}")


if __name__ == "__main__":
    run_evaluation()
