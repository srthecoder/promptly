"""
Central LLM router. Tries backends in order: Ollama → Groq → Gemini.
This is the ONLY file that talks to LLMs directly.
"""
from __future__ import annotations
import os
import requests
from app.config import (
    OLLAMA_HOST, OLLAMA_MODEL,
    GROQ_API_KEY, GROQ_MODEL,
    GEMINI_API_KEY, GEMINI_MODEL,
)
from app.modes.base_mode import BackendStatus


def _try_ollama(prompt: str, system: str) -> str | None:
    """Call local Ollama. Returns text or None if unavailable."""
    try:
        import ollama
        response = ollama.chat(
            model=OLLAMA_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": prompt},
            ],
            options={"temperature": 0.1},
        )
        return response["message"]["content"]
    except Exception:
        return None


def _try_groq(prompt: str, system: str) -> str | None:
    """Call Groq free tier. Returns text or None if unavailable/no key."""
    if not GROQ_API_KEY:
        return None
    try:
        from groq import Groq
        client = Groq(api_key=GROQ_API_KEY)
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": prompt},
            ],
            temperature=0.1,
        )
        return response.choices[0].message.content
    except Exception:
        return None


def _try_gemini(prompt: str, system: str) -> str | None:
    """Call Gemini free tier. Returns text or None if unavailable/no key."""
    if not GEMINI_API_KEY:
        return None
    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(
            model_name=GEMINI_MODEL,
            system_instruction=system,
        )
        response = model.generate_content(prompt)
        return response.text
    except Exception:
        return None


def call_llm(prompt: str, system: str) -> tuple[str, str]:
    """
    Try each free backend in order.
    Returns (response_text, backend_name_used).
    Raises RuntimeError if all backends fail.
    """
    result = _try_ollama(prompt, system)
    if result:
        return result, "ollama"

    result = _try_groq(prompt, system)
    if result:
        return result, "groq"

    result = _try_gemini(prompt, system)
    if result:
        return result, "gemini"

    raise RuntimeError(
        "No LLM backend available. "
        "Run `ollama pull llama3.2` or add GROQ_API_KEY / GEMINI_API_KEY to .env"
    )


def get_backend_status() -> BackendStatus:
    """Check which backend is available. Used for UI status indicator."""
    try:
        import ollama
        models = ollama.list()
        names = [m.model for m in models.models]
        # Accept both "llama3.2" and "llama3.2:latest"
        if any(n == OLLAMA_MODEL or n.startswith(OLLAMA_MODEL + ":") for n in names):
            return BackendStatus("ollama", OLLAMA_MODEL, True, f"Running locally ({OLLAMA_MODEL})")
    except Exception:
        pass

    if GROQ_API_KEY:
        return BackendStatus("groq", GROQ_MODEL, True, f"Groq cloud ({GROQ_MODEL})")

    if GEMINI_API_KEY:
        return BackendStatus("gemini", GEMINI_MODEL, True, f"Gemini cloud ({GEMINI_MODEL})")

    return BackendStatus(
        "none", "", False,
        "No backend found. Run `ollama pull llama3.2` or add a free API key to .env"
    )
