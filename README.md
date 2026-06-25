# ⚡ Prompt Optimizer

> People don't know how to prompt. This tool bridges that gap.

A universal input optimizer that transforms poorly-written prompts, PDFs, and any written content into LLM-efficient representations — **completely free to run**.

---

## What It Does

Paste anything — a rambling question, a rough prompt, a PDF, code context — and get back the most LLM-efficient version, customized by what you're trying to achieve.

**Token savings is a side effect of good prompting, not the goal.**

---

## Optimization Modes

| Mode | Best For |
|------|----------|
| 💰 Cost Minimizer | Shortest possible prompt, same intent |
| ⚡ Concise Answer | Get a short, direct answer first try |
| 🔬 Deep Research | Thorough, structured analysis in one shot |
| 💻 Code Generation | Working code with no follow-ups needed |
| 📄 Document Query | Ask questions of PDFs without RAG infrastructure |

---

## Setup

### 1. Clone & install
```bash
git clone https://github.com/yourusername/prompt-optimizer
cd prompt-optimizer
pip install -r requirements.txt
```

### 2. Set up a free LLM backend (pick one)

**Option A — Ollama (recommended, fully local, no internet needed)**
```bash
# Install Ollama: https://ollama.ai
ollama pull llama3.2
```

**Option B — Groq (free cloud, fast)**
```bash
# Get free key at console.groq.com
echo "GROQ_API_KEY=your_key" >> .env
```

**Option C — Google Gemini (free cloud)**
```bash
# Get free key at aistudio.google.com
echo "GEMINI_API_KEY=your_key" >> .env
```

### 3. Run
```bash
streamlit run app/main.py
```

---

## Fidelity Benchmark

Validates that compressed prompts produce equivalent answers:

```bash
python -m tests.fidelity.qa_benchmark
```

Outputs fidelity score (0-100) and token savings per test case.

---

## Architecture

```
Input (text / PDF)
    ↓
Local Cleaner          ← deterministic, no LLM
    ↓
Mode-specific LLM Compression  ← Ollama / Groq / Gemini (free)
    ↓
Token Audit            ← tiktoken, exact counts
    ↓
Cost Estimate          ← what you'd save on GPT-4o / Claude Sonnet
    ↓
Side-by-side Diff + Download
```

---

## Cost

**$0.** The compression step uses free local or cloud LLMs.
Cost estimates shown in the UI are hypothetical — they show what you'd save when sending the optimized prompt to a paid model.
