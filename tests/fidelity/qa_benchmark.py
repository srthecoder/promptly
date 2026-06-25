"""
Fidelity benchmark — validates that compressed prompts produce
equivalent answers to the originals.

Run: python -m tests.fidelity.qa_benchmark
"""
import json
from app.pipeline.compressor import call_llm
from app.modes.cost_min import CostMinMode
from app.pipeline.token_auditor import savings_report

ANSWER_SYSTEM = "Answer the following question directly and concisely."

JUDGE_SYSTEM = """You are an answer equivalence judge.
Given a question, a reference answer, and a test answer, rate how equivalent they are.
Output ONLY a number from 0-100 where:
100 = identical meaning
70-99 = same key facts, minor differences
40-69 = partially correct
0-39 = meaningfully different or wrong"""

BENCHMARK_PAIRS = [
    {
        "original": "Hey could you tell me what the capital of France is? I've been trying to remember it.",
        "question": "What is the capital of France?",
    },
    {
        "original": "I'm building a web app and I need to understand, like, what's the difference between REST and GraphQL APIs? Which one should I use?",
        "question": "What is the difference between REST and GraphQL APIs?",
    },
    {
        "original": "Can you explain what machine learning is in simple terms? I don't have a technical background but I want to understand the basic idea.",
        "question": "What is machine learning?",
    },
]


def get_answer(prompt: str) -> str:
    answer, _ = call_llm(prompt, ANSWER_SYSTEM)
    return answer


def judge_equivalence(question: str, ref: str, test: str) -> int:
    prompt = f"Question: {question}\nReference: {ref}\nTest: {test}"
    score_str, _ = call_llm(prompt, JUDGE_SYSTEM)
    try:
        return int(score_str.strip().split()[0])
    except Exception:
        return 0


def run_benchmark():
    mode = CostMinMode()
    results = []

    for i, pair in enumerate(BENCHMARK_PAIRS):
        print(f"\nTest {i+1}/{len(BENCHMARK_PAIRS)}: {pair['question'][:60]}...")

        # Reference answer from original prompt
        ref_answer = get_answer(pair["original"])

        # Compress and get answer
        compressed_result = mode.compress(pair["original"])
        test_answer = get_answer(compressed_result.compressed_text)

        # Judge
        score = judge_equivalence(pair["question"], ref_answer, test_answer)
        token_report = savings_report(pair["original"], compressed_result.compressed_text, "claude-sonnet-4-6")

        result = {
            "question": pair["question"],
            "fidelity_score": score,
            "tokens_saved_pct": token_report["percent_saved"],
            "original": pair["original"],
            "compressed": compressed_result.compressed_text,
            "ref_answer": ref_answer,
            "test_answer": test_answer,
        }
        results.append(result)
        print(f"  Fidelity: {score}/100 | Tokens saved: {token_report['percent_saved']}%")

    avg_fidelity = sum(r["fidelity_score"] for r in results) / len(results)
    avg_savings = sum(r["tokens_saved_pct"] for r in results) / len(results)

    print(f"\n{'='*50}")
    print(f"Average fidelity:     {avg_fidelity:.1f}/100")
    print(f"Average tokens saved: {avg_savings:.1f}%")
    print(f"{'='*50}")

    with open("tests/fidelity/benchmark_results.json", "w") as f:
        json.dump({"summary": {"avg_fidelity": avg_fidelity, "avg_tokens_saved": avg_savings}, "tests": results}, f, indent=2)
    print("Results saved to tests/fidelity/benchmark_results.json")


if __name__ == "__main__":
    run_benchmark()
