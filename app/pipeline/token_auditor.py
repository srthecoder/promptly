"""
Token counting and cost estimation.
Uses tiktoken cl100k_base as a universal estimate across models.
All cost figures are hypothetical (what paid APIs would charge) —
the compression step itself is free.
"""
import tiktoken
from app.config import COST_TABLE

_enc = tiktoken.get_encoding("cl100k_base")


def count_tokens(text: str) -> int:
    """Return exact token count for a string."""
    return len(_enc.encode(text))


def cost_estimate(tokens: int, model: str, direction: str = "input") -> float:
    """
    Return dollar cost for a given token count.
    direction: "input" or "output"
    """
    if model not in COST_TABLE:
        model = "claude-sonnet-4-6"
    rate = COST_TABLE[model][direction]
    return (tokens / 1_000_000) * rate


def savings_report(original: str, compressed: str, target_model: str) -> dict:
    """
    Full savings report comparing original vs compressed text.
    Returns dict with all metrics needed for the UI.
    """
    tok_before = count_tokens(original)
    tok_after  = count_tokens(compressed)
    tok_saved  = tok_before - tok_after
    pct_saved  = round((tok_saved / tok_before) * 100, 1) if tok_before > 0 else 0

    cost_before = cost_estimate(tok_before, target_model, "input")
    cost_after  = cost_estimate(tok_after,  target_model, "input")
    cost_saved  = cost_before - cost_after

    return {
        "original_tokens":  tok_before,
        "compressed_tokens": tok_after,
        "tokens_saved":     tok_saved,
        "percent_saved":    pct_saved,
        "cost_before":      round(cost_before, 6),
        "cost_after":       round(cost_after,  6),
        "cost_saved":       round(cost_saved,  6),
        "target_model":     target_model,
    }


if __name__ == "__main__":
    sample = """
    Hey so I was wondering if you could maybe help me understand, like,
    what the difference is between supervised and unsupervised learning?
    I've been reading about machine learning and I keep seeing these terms
    but I'm not totally sure what they mean or how they're different from
    each other. Could you explain it? Thanks so much!
    """
    compressed = "Explain the difference between supervised and unsupervised learning concisely."
    report = savings_report(sample, compressed, "claude-sonnet-4-6")
    print(report)
