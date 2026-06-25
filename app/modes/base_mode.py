"""
Base class and CompressionResult dataclass.
All modes must implement compress(text: str) -> CompressionResult.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class CompressionResult:
    original_text:     str
    compressed_text:   str
    mode:              str
    tokens_before:     int
    tokens_after:      int
    percent_saved:     float
    cost_saved:        float        # in dollars, against chosen target model
    explanation:       str          # one sentence: what changed and why
    turns_saved_est:   int = 0      # estimated follow-up messages avoided
    fidelity_score:    float = None # optional, set by qa_benchmark


@dataclass
class BackendStatus:
    """Which free backend is active."""
    name: str           # "ollama" | "groq" | "gemini" | "none"
    model: str
    available: bool
    message: str        # shown in UI sidebar


class BaseMode(ABC):
    """Abstract base. Each mode subclass implements compress()."""

    mode_key: str = "base"
    mode_label: str = "Base"

    @abstractmethod
    def compress(self, text: str, target_model: str = "claude-sonnet-4-6") -> CompressionResult:
        """
        Compress input text according to this mode's strategy.
        Must return a CompressionResult.
        """
        ...

    def _parse_llm_response(self, raw: str) -> tuple[str, str]:
        """
        Parse LLM response that follows the format:
            <compressed text>
            EXPLANATION: <one sentence>

        Returns (compressed_text, explanation).
        """
        if "EXPLANATION:" in raw:
            parts = raw.split("EXPLANATION:", 1)
            return parts[0].strip(), parts[1].strip()
        return raw.strip(), "No explanation provided."
