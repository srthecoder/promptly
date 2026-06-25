"""
Central configuration — cost table, model routing, environment loading.
All LLM calls use free backends. Cost table is for showing users
what they WOULD save on paid models.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# ── Free LLM Backend Config ──────────────────────────────────────────────────
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = "llama-3.1-8b-instant"

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-1.5-flash"

# ── Target Model Cost Table ($/million tokens) ────────────────────────────────
# Used ONLY for displaying savings estimates — no paid calls are made
COST_TABLE = {
    "claude-sonnet-4-6": {"input": 3.00,  "output": 15.00},
    "claude-haiku-4-5":  {"input": 0.80,  "output": 4.00},
    "gpt-4o":            {"input": 2.50,  "output": 10.00},
    "gpt-4o-mini":       {"input": 0.15,  "output": 0.60},
    "gemini-1.5-pro":    {"input": 1.25,  "output": 5.00},
}

DEFAULT_TARGET_MODEL = "claude-sonnet-4-6"

# ── Optimization Modes ────────────────────────────────────────────────────────
MODES = {
    "cost_min":      "💰 Cost Minimizer",
    "concise":       "⚡ Concise Answer",
    "deep_research": "🔬 Deep Research",
    "code_gen":      "💻 Code Generation",
    "doc_query":     "📄 Document Query",
}
