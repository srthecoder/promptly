# Prompt Optimizer — Claude Code Instructions

## Project Purpose
A universal input optimizer that transforms poorly-written prompts, PDFs,
and any written content into LLM-efficient representations.

Core thesis: people don't know how to prompt effectively. This tool bridges
that gap by accepting any input (text, PDF, code, docs) and returning the
most LLM-efficient version, customized by what the user is trying to achieve.

Token savings is a side effect of good prompting — not the goal itself.

---

## Tech Stack
- **Frontend:** Streamlit
- **Compression LLM:** Ollama (local, free) → Groq (free cloud fallback)
- **PDF extraction:** PyMuPDF (fitz)
- **Token counting:** tiktoken (cl100k_base encoding for cross-model estimates)
- **Diff display:** difflib (stdlib) + st.components.v1.html()
- **No paid APIs anywhere in this project**

---

## LLM Backend (Cost-Free, in priority order)
1. **Groq** (cloud fallback) — free tier at console.groq.com
   - Model: llama-3.1-8b-instant
   - Requires GROQ_API_KEY in .env (free to obtain)
2. **Google Gemini** (secondary fallback) — free tier at aistudio.google.com
   - Model: gemini-1.5-flash
   - Requires GEMINI_API_KEY in .env (free to obtain)
3. **Ollama** (primary) — runs locally at http://localhost:11434
   - Preferred model: llama3.2 (fast, 2GB)
   - Fallback model: mistral (better reasoning, 4GB)

The app checks Groq first. If not running, falls back Gemini, lastly Ollama.
If none available, shows a clear setup message to the user.

---

## Optimization Modes
| Mode | Goal | Strategy |
|------|------|----------|
| `cost_min` | Minimum tokens | Aggressive compression, preserve 100% intent |
| `deep_research` | Thorough answer | Expand with scope, structure, format constraints |
| `code_gen` | Working code | Add language, edge cases, output format, constraints |
| `doc_query` | Ask PDF/doc questions | Semantic extraction, no RAG pipeline needed |
| `concise` | Quick answer | Strip to bare intent, add brevity constraint |

---

## Cost Display Table (what users WOULD pay on paid models)
These are used only for showing savings estimates — not for actual API calls.
| Model | Input $/MTok | Output $/MTok |
|-------|-------------|--------------|
| claude-sonnet-4-6 | $3.00 | $15.00 |
| claude-haiku-4-5 | $0.80 | $4.00 |
| gpt-4o | $2.50 | $10.00 |
| gpt-4o-mini | $0.15 | $0.60 |
| gemini-1.5-pro | $1.25 | $5.00 |

---

## Key Architectural Decisions
- Compression always uses free local/cloud model (Ollama/Groq/Gemini)
- Token counting uses tiktoken cl100k_base as universal estimate
- Cost savings shown = what user would save on their CHOSEN target model
- Never mutate original input — always work on a copy
- Each mode in /modes/ implements BaseMode.compress() → CompressionResult
- All LLM calls go through pipeline/compressor.py — never call SDK directly from UI
- PDF pipeline: extract text → semantic compression → return dense representation
- Fidelity testing is a separate optional module, not in the main pipeline

---

## File Conventions
- `CompressionResult` dataclass defined in `modes/base_mode.py`
- All LLM routing logic lives in `pipeline/compressor.py`
- Streamlit state managed via `st.session_state`
- Environment variables loaded via `python-dotenv` from `.env`
- Never hardcode API keys anywhere

---

## Running the App
```bash
# Install dependencies
pip install -r requirements.txt

# (Optional but recommended) Pull Ollama model
ollama pull llama3.2

# Add optional fallback keys to .env
cp .env.example .env

# Run
streamlit run app/main.py
```

---

## Build Order (follow this sequence strictly)
1. `pipeline/token_auditor.py` — pure math, no LLM dependency
2. `modes/base_mode.py` — CompressionResult dataclass + abstract class
3. `pipeline/compressor.py` — LLM routing (Ollama → Groq → Gemini)
4. `modes/cost_min.py` — simplest mode, validate full pipeline works
5. `pipeline/pdf_extractor.py` — independent of modes
6. `app/main.py` — Streamlit UI wiring everything together
7. `modes/` — remaining modes (concise, deep_research, code_gen, doc_query)
8. `ui/diff_viewer.py` — pure UI enhancement, add last
9. `tests/fidelity/qa_benchmark.py` — research validation layer

Never skip ahead. At every step, something should run.
