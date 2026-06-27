"""
Structured (JSON) Prompting Experiment
=======================================
For each test case, sends both the raw prose prompt and its structured
JSON equivalent to Groq, then runs a third LLM-as-judge call that scores
both responses blindly on four quality dimensions.

Metrics collected per case:
  Efficiency  — input tokens, output tokens, latency, cost estimate
  Quality     — completeness, relevance, clarity, conciseness (each 1–10)
                scored by a separate judge call, blind to which prompt type
                produced each response

Usage:
    python3 experiment.py                 # run all 7 cases
    python3 experiment.py --case 2        # run one case by index
    python3 experiment.py --dry-run       # token counts only, no API
    python3 experiment.py --save          # write results to results.json
    python3 experiment.py --no-judge      # skip quality scoring (faster)
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

import tiktoken
from dotenv import load_dotenv
from groq import Groq

from prompts import TEST_CASES

# ── Config ────────────────────────────────────────────────────────────────────

load_dotenv(Path(__file__).parent.parent.parent / ".env")

GROQ_MODEL            = "llama-3.3-70b-versatile"
ENCODER               = tiktoken.get_encoding("cl100k_base")
COST_PER_INPUT_TOKEN  = 0.59 / 1_000_000
COST_PER_OUTPUT_TOKEN = 0.79 / 1_000_000

QUALITY_DIMENSIONS = ["completeness", "relevance", "clarity", "conciseness"]

JUDGE_SYSTEM = """\
You are a response quality evaluator. You will be shown an original task/prompt
and two responses (A and B). Score each response on four dimensions from 1–10:

  completeness  — does it fully address everything the task asked for?
  relevance     — does it stay on topic without drifting or padding?
  clarity       — is the response easy to read and well-organised?
  conciseness   — does it avoid unnecessary verbosity?

You must not know or guess which prompt style generated each response.
Evaluate only the OUTPUT quality.

Respond with valid JSON only — no prose before or after:
{
  "A": {"completeness": <1-10>, "relevance": <1-10>, "clarity": <1-10>, "conciseness": <1-10>},
  "B": {"completeness": <1-10>, "relevance": <1-10>, "clarity": <1-10>, "conciseness": <1-10>},
  "reasoning": "<one sentence per dimension explaining the key difference>"
}"""

# ── Helpers ───────────────────────────────────────────────────────────────────

def count_tokens(text: str) -> int:
    return len(ENCODER.encode(text))


def call_groq(client: Groq, prompt: str, system=None) -> dict:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    t0   = time.perf_counter()
    resp = client.chat.completions.create(
        model=GROQ_MODEL,
        temperature=0.3,
        messages=messages,
    )
    latency = time.perf_counter() - t0

    content    = resp.choices[0].message.content or ""
    input_toks = resp.usage.prompt_tokens
    output_toks= resp.usage.completion_tokens

    return {
        "content":       content,
        "input_tokens":  input_toks,
        "output_tokens": output_toks,
        "latency":       round(latency, 3),
    }


def judge_responses(client: Groq, task_desc: str, resp_a: str, resp_b: str) -> dict:
    """
    Sends a blind A/B judge call. Returns scores dict or None on parse failure.
    The assignment of raw→A or structured→B is randomised per call to reduce
    position bias (we track the mapping and flip scores back before returning).
    """
    import random
    flip = random.random() > 0.5   # if True, structured is presented as A

    if flip:
        text_a, text_b = resp_b, resp_a   # structured=A, raw=B
    else:
        text_a, text_b = resp_a, resp_b   # raw=A, structured=B

    user_msg = (
        f"TASK:\n{task_desc}\n\n"
        f"--- RESPONSE A ---\n{text_a}\n\n"
        f"--- RESPONSE B ---\n{text_b}"
    )

    result = call_groq(client, user_msg, system=JUDGE_SYSTEM)
    raw_json = result["content"].strip()

    # Strip markdown code fences if the model wrapped the JSON
    raw_json = re.sub(r"^```(?:json)?\s*", "", raw_json)
    raw_json = re.sub(r"\s*```$", "", raw_json)

    try:
        parsed = json.loads(raw_json)
    except json.JSONDecodeError:
        return None

    scores_a = parsed.get("A", {})
    scores_b = parsed.get("B", {})

    if flip:
        raw_scores        = scores_b
        structured_scores = scores_a
    else:
        raw_scores        = scores_a
        structured_scores = scores_b

    def avg(d):
        vals = [v for v in d.values() if isinstance(v, (int, float))]
        return round(sum(vals) / len(vals), 2) if vals else 0.0

    return {
        "raw":        {**raw_scores,        "overall": avg(raw_scores)},
        "structured": {**structured_scores, "overall": avg(structured_scores)},
        "reasoning":  parsed.get("reasoning", ""),
        "judge_tokens": result["input_tokens"] + result["output_tokens"],
    }


def score_bar(score: float, out_of: float = 10, width: int = 10) -> str:
    filled = round((score / out_of) * width)
    return "█" * filled + "░" * (width - filled)


def fmt_pct(a: float, b: float) -> str:
    if b == 0:
        return "n/a"
    delta = (a - b) / b * 100
    sign  = "+" if delta > 0 else ""
    return f"{sign}{delta:.1f}%"


DIVIDER = "─" * 72
SECTION = "═" * 72

# ── Per-case display ──────────────────────────────────────────────────────────

def print_header(n: int):
    print(f"\n{SECTION}")
    print("  STRUCTURED (JSON) PROMPTING EXPERIMENT")
    print(f"  Model : {GROQ_MODEL}   Cases : {n}")
    print(SECTION)


def print_case_header(idx: int, total: int, name: str, category: str):
    print(f"\n{'━'*72}")
    print(f"  [{idx+1}/{total}]  {name}  ·  {category}")
    print(f"{'━'*72}")


def print_efficiency(raw_r: dict, str_r: dict, raw_prompt: str, str_prompt: str):
    ri, ro = raw_r["input_tokens"], raw_r["output_tokens"]
    si, so = str_r["input_tokens"], str_r["output_tokens"]
    ri_cost = ri * COST_PER_INPUT_TOKEN
    si_cost = si * COST_PER_INPUT_TOKEN
    ro_cost = ro * COST_PER_OUTPUT_TOKEN
    so_cost = so * COST_PER_OUTPUT_TOKEN

    pt_raw = count_tokens(raw_prompt)
    pt_str = count_tokens(str_prompt)

    print(f"\n  EFFICIENCY")
    print(f"  {'Metric':<26} {'Raw':>10} {'Structured':>12} {'Δ':>10}")
    print(f"  {DIVIDER[:58]}")
    print(f"  {'Prompt tokens':<26} {pt_raw:>10} {pt_str:>12} {fmt_pct(pt_str, pt_raw):>10}")
    print(f"  {'Input tokens (billed)':<26} {ri:>10} {si:>12} {fmt_pct(si, ri):>10}")
    print(f"  {'Output tokens':<26} {ro:>10} {so:>12} {fmt_pct(so, ro):>10}")
    print(f"  {'Total tokens':<26} {ri+ro:>10} {si+so:>12} {fmt_pct(si+so, ri+ro):>10}")
    print(f"  {'Input cost /1k calls':<26} ${ri_cost*1000:.4f}      ${si_cost*1000:.4f}  {fmt_pct(si_cost, ri_cost):>10}")
    print(f"  {'Output cost /1k calls':<26} ${ro_cost*1000:.4f}      ${so_cost*1000:.4f}  {fmt_pct(so_cost, ro_cost):>10}")
    print(f"  {'Latency (s)':<26} {raw_r['latency']:>10.3f} {str_r['latency']:>12.3f} {fmt_pct(str_r['latency'], raw_r['latency']):>10}")


def print_quality(scores: dict):
    if scores is None:
        print(f"\n  QUALITY  (judge parse failed — skipped)")
        return

    rs = scores["raw"]
    ss = scores["structured"]

    print(f"\n  QUALITY  (LLM-as-judge, blind A/B, scored 1–10)")
    print(f"  {'Dimension':<18} {'Raw':>5}  {'':10}  {'Structured':>10}  {'':10}  {'Winner'}")
    print(f"  {DIVIDER[:68]}")

    for dim in QUALITY_DIMENSIONS:
        rv = rs.get(dim, 0)
        sv = ss.get(dim, 0)
        winner = "structured ▲" if sv > rv else ("raw ▲" if rv > sv else "tie")
        print(
            f"  {dim:<18} {rv:>5.1f}  {score_bar(rv):<10}  "
            f"{sv:>10.1f}  {score_bar(sv):<10}  {winner}"
        )

    print(f"  {DIVIDER[:68]}")
    ro = rs["overall"]
    so = ss["overall"]
    winner = "structured ▲" if so > ro else ("raw ▲" if ro > so else "tie")
    print(
        f"  {'OVERALL':<18} {ro:>5.1f}  {score_bar(ro):<10}  "
        f"{so:>10.1f}  {score_bar(so):<10}  {winner}"
    )

    if scores.get("reasoning"):
        print(f"\n  Judge reasoning: {scores['reasoning']}")


def print_responses(raw_content: str, str_content: str):
    print(f"\n  RESPONSES (first 250 chars each)")
    print(f"  Raw →")
    print(f"    {raw_content[:250].replace(chr(10), ' ')}")
    print(f"\n  Structured →")
    print(f"    {str_content[:250].replace(chr(10), ' ')}")


# ── Summary ───────────────────────────────────────────────────────────────────

def print_summary(results: list):
    print(f"\n\n{SECTION}")
    print("  FULL EXPERIMENT SUMMARY")
    print(SECTION)

    # Efficiency totals
    tri  = sum(r["raw"]["input_tokens"]  for r in results)
    tro  = sum(r["raw"]["output_tokens"] for r in results)
    tsi  = sum(r["structured"]["input_tokens"]  for r in results)
    tso  = sum(r["structured"]["output_tokens"] for r in results)
    rc   = tri * COST_PER_INPUT_TOKEN + tro * COST_PER_OUTPUT_TOKEN
    sc   = tsi * COST_PER_INPUT_TOKEN + tso * COST_PER_OUTPUT_TOKEN
    alr  = sum(r["raw"]["latency"]  for r in results) / len(results)
    als  = sum(r["structured"]["latency"] for r in results) / len(results)

    print(f"\n  EFFICIENCY TOTALS ({len(results)} cases)")
    print(f"  {'Metric':<30} {'Raw':>12} {'Structured':>14} {'Δ':>10}")
    print(f"  {DIVIDER[:66]}")
    print(f"  {'Input tokens':<30} {tri:>12} {tsi:>14} {fmt_pct(tsi,tri):>10}")
    print(f"  {'Output tokens':<30} {tro:>12} {tso:>14} {fmt_pct(tso,tro):>10}")
    print(f"  {'Total tokens':<30} {tri+tro:>12} {tsi+tso:>14} {fmt_pct(tsi+tso,tri+tro):>10}")
    print(f"  {'Cost estimate':<30} ${rc:.5f}      ${sc:.5f}  {fmt_pct(sc,rc):>10}")
    print(f"  {'Avg latency (s)':<30} {alr:>12.3f} {als:>14.3f} {fmt_pct(als,alr):>10}")

    # Quality averages (skip cases where judge failed)
    judged = [r for r in results if r.get("quality") is not None]
    if judged:
        print(f"\n  QUALITY AVERAGES ({len(judged)} judged cases)")
        print(f"  {'Dimension':<18} {'Raw avg':>9} {'Str avg':>10} {'Winner'}")
        print(f"  {DIVIDER[:52]}")
        for dim in QUALITY_DIMENSIONS + ["overall"]:
            rv = sum(r["quality"]["raw"].get(dim, 0)        for r in judged) / len(judged)
            sv = sum(r["quality"]["structured"].get(dim, 0) for r in judged) / len(judged)
            winner = "structured ▲" if sv > rv else ("raw ▲" if rv > sv else "tie")
            print(f"  {dim:<18} {rv:>9.2f} {sv:>10.2f}  {winner}")

    # Per-case scorecard
    print(f"\n  PER-CASE SCORECARD")
    print(f"  {'Case':<26} {'Tok Δ':>8}  {'Quality Raw':>11}  {'Quality Str':>11}  {'Better'}")
    print(f"  {DIVIDER[:70]}")
    for r in results:
        ri = r["raw"]["input_tokens"]
        si = r["structured"]["input_tokens"]
        tok_d = fmt_pct(si, ri)
        if r.get("quality"):
            qr = r["quality"]["raw"]["overall"]
            qs = r["quality"]["structured"]["overall"]
            better = "structured" if qs > qr else ("raw" if qr > qs else "tie")
        else:
            qr = qs = 0.0
            better = "n/a"
        print(f"  {r['name']:<26} {tok_d:>8}  {qr:>11.1f}  {qs:>11.1f}  {better}")

    print()


# ── Dry run ───────────────────────────────────────────────────────────────────

def dry_run():
    print_header(len(TEST_CASES))
    print("\n  DRY RUN — token counts only, no API calls\n")
    print(f"  {'Case':<26} {'Raw':>7} {'Str':>7} {'Δ tok':>7} {'Δ%':>8}")
    print(f"  {DIVIDER[:57]}")
    for tc in TEST_CASES:
        rt = count_tokens(tc["raw"])
        st = count_tokens(tc["structured"])
        print(f"  {tc['name']:<26} {rt:>7} {st:>7} {st-rt:>+7} {fmt_pct(st,rt):>8}")
    print()


# ── Main ──────────────────────────────────────────────────────────────────────

def run_experiment(cases: list, save: bool, no_judge: bool) -> list:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        sys.exit("❌  GROQ_API_KEY not found in .env")

    client  = Groq(api_key=api_key)
    results = []

    print_header(len(cases))

    for idx, tc in enumerate(cases):
        print_case_header(idx, len(cases), tc["name"], tc["category"])

        print(f"\n  ⏳ [1/3] Raw prompt → Groq…")
        raw_r = call_groq(client, tc["raw"])

        print(f"  ⏳ [2/3] Structured prompt → Groq…")
        str_r = call_groq(client, tc["structured"])

        print_efficiency(raw_r, str_r, tc["raw"], tc["structured"])
        print_responses(raw_r["content"], str_r["content"])

        quality = None
        if not no_judge:
            print(f"\n  ⏳ [3/3] Judge call (blind A/B quality scoring)…")
            quality = judge_responses(
                client,
                task_desc=tc["raw"],       # give the judge the raw task so it knows what was asked
                resp_a=raw_r["content"],
                resp_b=str_r["content"],
            )
        print_quality(quality)

        results.append({
            "name":       tc["name"],
            "category":   tc["category"],
            "raw":        raw_r,
            "structured": str_r,
            "quality":    quality,
        })

    print_summary(results)

    if save:
        out = Path(__file__).parent / "results.json"
        out.write_text(json.dumps(results, indent=2))
        print(f"  Saved → {out}\n")

    return results


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Structured JSON prompting experiment")
    parser.add_argument("--case",     type=int,            help="Run one case by index (0-based)")
    parser.add_argument("--dry-run",  action="store_true", help="Token counts only, no API calls")
    parser.add_argument("--save",     action="store_true", help="Write results to results.json")
    parser.add_argument("--no-judge", action="store_true", help="Skip quality scoring, efficiency only")
    args = parser.parse_args()

    if args.dry_run:
        dry_run()
        sys.exit(0)

    cases = [TEST_CASES[args.case]] if args.case is not None else TEST_CASES
    run_experiment(cases, save=args.save, no_judge=args.no_judge)
