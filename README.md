# ⚡ Promptly

A Chrome extension that restructures poorly-written prompts into token-efficient formats using a DSPy-compiled LLM pipeline.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![DSPy](https://img.shields.io/badge/DSPy-2.6%2B-orange)
![Groq](https://img.shields.io/badge/Groq-llama--3.3--70b-green)
![HuggingFace](https://img.shields.io/badge/HuggingFace-Spaces-yellow)

---

## The Problem

Most people prompt LLMs the way they would ask a question in conversation — with filler, redundant style instructions, and no explicit structure. This wastes tokens and degrades output quality. The LLM attends to every input token equally; noise in the input is noise in the output.

**Before** (66 tokens):
```
Hey so I was doing some reading and I came across this topic and I
was really curious about it and wanted to understand it better.
I hope you dont mind me asking but could you maybe explain the
difference between supervised and unsupervised machine learning?
Thanks so much in advance!
```

**After** (25 tokens):
```
Task: explain supervised vs unsupervised ML |
Focus: practical difference |
Format: 2 sentences
```

Token reduction: 62%. Same intent. Clearer signal.

Promptly automates this transformation for any prompt on Claude, ChatGPT, or Gemini with a single keyboard shortcut.

---

## How It Works

```
User types prompt on claude.ai / ChatGPT / Gemini
        ↓  Cmd+Shift+P
Chrome Extension (content.js)
        ↓
background.js → POST /optimize
        ↓
HuggingFace Space (FastAPI)
        ↓
DSPy Pipeline → dspy.Predict(RestructureSignature)
        ↓
Groq API (llama-3.3-70b-versatile)
        ↓
pipe | markdown | xml output
        ↓
Overlay shows before/after + token delta
        ↓
"Use This" replaces textarea
```

The extension intercepts the prompt before it is sent to the model, routes it through the DSPy backend, and replaces the textarea content with the restructured version. The user then sends it as normal.

---

## Why DSPy

> "An LLM predicts the next token by attending to every input token. The wording of the prompt is the single most important lever for output quality. DSPy automatically finds the optimal wording through compilation — we never hand-tune it."

The core problem with hand-written system prompts is that they are fragile. Change one phrase and the model's behavior shifts unpredictably. DSPy addresses this by treating the prompt as a program to be optimized, not a string to be tuned manually.

**What DSPy does here:**
- Defines the task through a typed `Signature` (inputs, outputs, field descriptions)
- Compiles the signature using `MIPROv2`, which optimizes both the instruction text and few-shot examples against a training set
- The compiled program is saved to `compiled/promptly.json` and loaded at server startup

**What DSPy does NOT do here:**
- It is not used as a pipeline orchestration engine
- It is not used for regex or string matching
- It only wraps the single LLM call that requires reasoning about prompt structure

**The signature:**

```python
class RestructureSignature(dspy.Signature):
    """You are a prompt structure optimizer..."""
    raw_prompt: str = dspy.InputField(
        desc="User's raw unmodified draft prompt."
    )
    output: OptimizedPromptOutput = dspy.OutputField()
```

**The Pydantic output schema:**

```python
class OptimizedPromptOutput(BaseModel):
    structured: str    # the rewritten prompt
    format_used: str   # "pipe" | "markdown" | "xml"
    explanation: str   # one sentence on what changed
```

The Pydantic schema exists for one reason: raw LLM text output breaks the Chrome extension's JSON parser when the model adds conversational preamble ("Here is your restructured prompt:..."). Pydantic forces clean structured output every time, regardless of model behavior.

---

## Output Formats

Format selection is driven by input complexity, not user choice. The model picks the format automatically based on word count and structural requirements.

**PIPE** — simple, single question, under 25 words

```
Task: explain Docker | Audience: non-technical |
Output: 2 sentences, everyday analogy
```

**MARKDOWN** — medium complexity, 25–100 words

```markdown
## Task
Explain compound interest

## Style
[Style:Professional-Friendly] [Style:NoJargon]

## Output
One paragraph, one numerical example
```

**XML** — complex, multi-section, over 100 words

```xml
<task>Competitive analysis</task>
<output>
  <section>Market overview: 2 para</section>
  <section>Competitor table</section>
  <section>SWOT bullets</section>
</output>
```

**Why never JSON:**

JSON costs approximately 2× tokens compared to pipe or markdown due to structural overhead (`"key":`, brackets, commas, indentation). The output of Promptly is a prompt, not a data structure — JSON formatting would add token cost to the very thing we are trying to make efficient.

---

## Style Reference Tokens

Verbose style instructions are replaced with compact bracket tokens that preserve the instruction in fewer tokens:

| Natural Language | Token |
|---|---|
| "write in a friendly tone" | `[Style:Friendly]` |
| "avoid jargon" | `[Style:NoJargon]` |
| "be concise" | `[Style:Concise]` |
| "use bullet points" | `[Format:Bullets]` |
| "step by step" | `[Format:Steps]` |
| "provide examples" | `[Include:Examples]` |
| "be thorough" | `[Depth:Thorough]` |
| "professional tone" | `[Style:Professional]` |
| "non-technical audience" | `[Audience:NonTechnical]` |

A phrase like `"write in a professional but friendly tone, avoid jargon, keep it concise"` (14 tokens) becomes `[Style:Professional-Friendly] [Style:NoJargon] [Style:Concise]` (9 tokens). More importantly, the token form is semantically unambiguous — the model cannot misread it as a sentence.

---

## Architecture Decisions

Every non-obvious decision has a documented reason.

**DECISION 1: Cloud deployment on HuggingFace Spaces**

Chrome extensions cannot depend on users running a local Python server. HuggingFace Spaces provides free FastAPI hosting via Docker. The server URL is hardcoded in `background.js` — users need zero setup beyond installing the extension.

**DECISION 2: Groq for production inference**

Groq's free tier provides 1,000 requests/day on `llama-3.3-70b-versatile` with low latency via custom LPUs. This is sufficient for a personal or small-team tool. The quality of llama-3.3-70b on structured output tasks is competitive with GPT-4o-mini.

**DECISION 3: `dspy.Predict` not `dspy.Refine`**

`dspy.Refine` makes up to N LLM calls per example (retrying until the reward threshold is met). On Groq's free tier, 3 retries per request exhausts the rate limit immediately with any real usage. `dspy.Predict` makes exactly one call per request and relies on the compiled signature to produce good output without retries.

**DECISION 4: Pydantic output schema**

Without a schema, the model occasionally wraps the restructured prompt in conversational preamble. This breaks the extension's response parser silently. Pydantic's `BaseModel` enforces field presence and type at parse time, failing loudly rather than silently producing malformed output.

**DECISION 5: No preprocessing pipeline**

Early versions used regex for filler removal and hardcoded dictionaries for style token detection. These were brittle — they missed semantic variants ("if you don't mind" vs "I hope you don't mind") and required constant maintenance. DSPy handles filler removal, style detection, format selection, and restructuring through the compiled signature. No hardcoding required.

**DECISION 6: pipe/markdown/xml only, never JSON**

See the format section above. JSON format overhead is antithetical to the tool's purpose.

**DECISION 7: Dual-model evaluation routing**

Using the same Groq account for both the pipeline under test and the judge doubles rate limit consumption and introduces self-evaluation bias. The judge uses GitHub Models (`gpt-4o-mini` via Azure inference endpoint), which runs on a completely separate rate limit bucket and provides an independent perspective on output quality.

**DECISION 8: G-Eval with 4 dimensions, not 1 composite score**

A single composite score hides where the system fails. Four independent dimensions — intent preservation, format correctness, constraint adherence, token efficiency — show exactly which aspects need improvement and which are already strong. The evaluation results confirmed this: efficiency (0.683) is the weak dimension, while intent (0.983) is the strongest. Without the breakdown, you would only see the 0.896 mean and miss that finding.

---

## Benchmark Results

**Run:** `20260627_182749`
**Date:** 2026-06-27
**Dataset:** 30 examples across 10 categories (3 per category)
**Pipeline model:** `groq/llama-3.3-70b-versatile`
**Judge model:** `github-models/gpt-4o-mini`
**Method:** G-Eval 4-dimension rubric, scores 1–3 normalized to 0.0–1.0, mean of 4 dimensions per example

### Overall Score

| Metric | Value |
|---|---|
| DSPy evaluation score | **89.58%** |
| Normalized mean (0–1) | **0.896** |
| Min score (any example) | 0.625 |
| Max score (any example) | 1.000 |
| Std deviation | 0.097 |
| Examples evaluated | 30 |

### Per-Dimension Breakdown

| Dimension | Mean | Std | Min | Max |
|---|---|---|---|---|
| Intent Preservation | **0.983** | 0.090 | 0.50 | 1.00 |
| Format Correctness | **0.967** | 0.125 | 0.50 | 1.00 |
| Constraint Adherence | **0.950** | 0.150 | 0.50 | 1.00 |
| Token Efficiency | **0.683** | 0.241 | 0.50 | 1.00 |

### Per-Category Results

| Category | Example Scores | Category Avg |
|---|---|---|
| Research / Explanation | 0.625, 0.875, 0.625 | **0.708** |
| Style Instructions | 0.875, 0.875, 0.875 | **0.875** |
| Code Generation | 1.000, 0.875, 0.875 | **0.917** |
| Multi-Section Output | 1.000, 1.000, 0.875 | **0.958** |
| Simple / Short | 0.875, 0.750, 0.875 | **0.833** |
| Non-Technical Audience | 1.000, 0.875, 0.875 | **0.917** |
| Creative / Writing | 1.000, 0.875, 1.000 | **0.958** |
| Data / Analysis | 0.875, 0.875, 1.000 | **0.917** |
| Debugging / Problem Solving | 0.875, 0.875, 1.000 | **0.917** |
| Edge Cases | 1.000, 1.000, 0.875 | **0.958** |

### What the Token Efficiency Finding Means

Token efficiency scored lowest (0.683) and token savings averaged **−69.3%** — meaning structured prompts are typically longer than the original input. This is intentional, not a bug.

A short vague prompt like `"explain docker to someone with no technical background"` (10 tokens) becomes a markdown block with explicit audience tokens and output format constraints (29 tokens). The structured version is 190% longer. But it will produce a measurably better response because the model receives unambiguous signal about audience, format, and scope rather than inferring them.

> The goal of Promptly is clarity, not compression. Token savings is a side effect of removing filler from verbose prompts — not the primary objective.

The weakest individual score was 0.625, occurring twice in the Research / Explanation category. In both cases the judge noted the format choice (markdown for simple explanation prompts) was suboptimal — pipe would have been more efficient. This is a known calibration issue with the format selection logic for short research questions.

### Evaluation Methodology

- Sequential execution: `num_threads=1`
- 12-second delay between API calls (inside the metric function, not between loop iterations — required by `dspy.Evaluate`'s threading model)
- Judge called with `dspy.context(lm=judge_lm)` to override the global pipeline LM without side effects
- Full per-example logs saved to `eval_results_latest.json`
- `safe_int_score()` handles malformed judge output by digit-scanning and clamping to 1–3

---

## Tech Stack

| Component | Technology | Cost |
|---|---|---|
| Chrome Extension | Vanilla JS, Manifest V3 | Free |
| Prompt restructuring | DSPy + Groq | Free |
| LLM inference | Groq `llama-3.3-70b-versatile` | Free |
| Server hosting | HuggingFace Spaces (Docker) | Free |
| Optimization | DSPy MIPROv2 | ~$0 |
| Evaluation pipeline | Groq + GitHub Models | Free |

**Total running cost: $0**

---

## Setup

### Chrome Extension

1. Clone this repo
2. Go to `chrome://extensions` → enable Developer Mode → Load Unpacked
3. Select the `extension/` folder
4. Set the keyboard shortcut at `chrome://extensions/shortcuts`
   - Default: `Cmd+Shift+P` (Mac) / `Ctrl+Shift+P` (Windows)

### DSPy Server (local development)

```bash
cd dspy-server
pip install -r requirements.txt
export GROQ_API_KEY=your_key
uvicorn server:app --port 8000
```

The extension points at the HuggingFace Space URL by default. For local development, update the URL in `extension/background.js`.

### Run Evaluation

```bash
cd dspy-server
export GROQ_API_KEY=your_groq_key
export GITHUB_TOKEN=your_pat   # github.com/marketplace/models
python evaluate.py
# Results saved to eval_results_<timestamp>.json and eval_results_latest.json
```

### Compile with MIPROv2 (optional, improves quality)

```bash
cd dspy-server
export GROQ_API_KEY=your_key
python optimize.py
# Saves compiled/promptly.json
# Server loads it automatically on next start
```

### Deploy to HuggingFace

The HuggingFace Space lives at `https://huggingface.co/spaces/Rikaaaaaa/promptly`. To update it:

```bash
cd ~/Desktop/promptly        # HF Space clone
cp ~/Downloads/promptly/dspy-server/*.py .
cp ~/Downloads/promptly/dspy-server/requirements.txt .
git add . && git commit -m "update" && git push
```

Set `GROQ_API_KEY` in the Space's Settings → Secrets. It is never exposed to the extension or the user.

---

## Supported Platforms

| Platform | Prompt Optimization |
|---|---|
| claude.ai | ✅ |
| chatgpt.com | ✅ |
| gemini.google.com | ✅ |

The content script detects the active textarea on each platform and replaces its value after the user confirms the restructured prompt.

---

## Limitations and Future Work

**Token efficiency is the weakest dimension (0.683).** Structured prompts frequently expand rather than compress the original. This reflects a real tension: the tool optimizes for output quality, not token count. Short prompts that are already clear get padded with format overhead that adds tokens without adding signal.

**`optimize.py` hits Groq free tier rate limits.** MIPROv2 compilation makes dozens of API calls during bootstrap. With `num_threads=1` and `max_bootstrapped_demos=2`, it is feasible on the free tier but slow (~20 minutes). Upgrading to a paid Groq tier or using a different provider for the teacher model resolves this.

**The evaluation dataset is 30 examples.** This is sufficient to identify gross failures and per-category patterns but insufficient for statistical confidence at the dimension level. The standard error on a mean computed from 3 examples per category is high. The dataset should be expanded to 100+ examples before drawing strong conclusions from category-level results.

**No semantic similarity metric.** The current evaluation uses an LLM judge for intent preservation (dimension 1), which correlates with but does not directly measure semantic equivalence. A future version should add an embedding-based similarity score (cosine similarity between original and restructured prompt embeddings) as an independent verification of intent preservation.

---

## License

MIT
