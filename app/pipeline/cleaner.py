"""
Deterministic local cleaning — runs before LLM compression.
No LLM calls. Removes obvious token bloat: extra whitespace,
repeated punctuation, filler phrases.
"""
import re


FILLER_PHRASES = [
    r"i was wondering if you could",
    r"could you please",
    r"i hope this makes sense",
    r"thanks so much",
    r"thank you so much",
    r"feel free to",
    r"let me know if you need",
    r"as an ai language model",
    r"certainly!",
    r"of course!",
    r"sure!",
    r"absolutely!",
    r"great question",
]

_FILLER_RE = re.compile(
    "|".join(FILLER_PHRASES),
    flags=re.IGNORECASE,
)


def clean(text: str) -> tuple[str, list[str]]:
    """
    Run deterministic cleaning passes on text.
    Returns (cleaned_text, list_of_changes_made).
    """
    changes = []
    original_len = len(text)

    # 1. Collapse multiple blank lines
    cleaned = re.sub(r"\n{3,}", "\n\n", text)
    if len(cleaned) < len(text):
        changes.append("Collapsed excessive blank lines")

    # 2. Collapse multiple spaces
    prev = cleaned
    cleaned = re.sub(r" {2,}", " ", cleaned)
    if cleaned != prev:
        changes.append("Removed double spaces")

    # 3. Strip filler phrases
    prev = cleaned
    cleaned = _FILLER_RE.sub("", cleaned)
    if cleaned != prev:
        changes.append("Removed conversational filler phrases")

    # 4. Strip leading/trailing whitespace per line
    lines = [line.strip() for line in cleaned.splitlines()]
    cleaned = "\n".join(lines).strip()

    # 5. Remove repeated punctuation (e.g. "???", "!!!")
    prev = cleaned
    cleaned = re.sub(r"([!?.]){2,}", r"\1", cleaned)
    if cleaned != prev:
        changes.append("Removed repeated punctuation")

    if not changes:
        changes.append("No local cleaning needed")

    return cleaned, changes
