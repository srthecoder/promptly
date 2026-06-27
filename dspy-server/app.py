import os
import dspy
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pipeline import PromptlyPipeline

app = FastAPI(title="Promptly DSPy Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

lm = dspy.LM(
    model="groq/llama-3.3-70b-versatile",
    api_key=os.environ["GROQ_API_KEY"],
    temperature=0.1
)
# track_usage=True enables native token counting
# No tiktoken needed
dspy.configure(lm=lm, track_usage=True)

pipeline = PromptlyPipeline()

COMPILED_PATH = "compiled/promptly.json"
if os.path.exists(COMPILED_PATH):
    pipeline.load(path=COMPILED_PATH)
    print(f"Loaded compiled program: {COMPILED_PATH}")
else:
    print("No compiled program found.")
    print("Run optimize.py for best results.")


class OptimizeRequest(BaseModel):
    prompt: str


@app.post("/optimize")
async def optimize(req: OptimizeRequest):
    if not req.prompt.strip():
        raise HTTPException(400, "Prompt cannot be empty")

    try:
        result = pipeline.forward(req.prompt)

        # Real token counts from DSPy/Groq API response
        usage = result.get("lm_usage", {})

        # Input tokens = what was sent to the LLM
        # This is the real cost metric
        input_tokens = usage.get(
            "prompt_tokens",
            usage.get("input_tokens", 0)
        )
        output_tokens = usage.get(
            "completion_tokens",
            usage.get("output_tokens", 0)
        )
        total_tokens = input_tokens + output_tokens

        # Original prompt token estimate for comparison
        # (before DSPy processed it)
        original_tokens = round(
            len(req.prompt.split()) * 1.3
        )

        # Restructured prompt token count
        restructured_tokens = round(
            len(result["structured"].split()) * 1.3
        )

        # Token delta: how much shorter is the
        # restructured prompt vs original
        token_delta = original_tokens - restructured_tokens

        return {
            # The restructured prompt
            "structured":          result["structured"],
            "format_used":         result["format_used"],
            "explanation":         result["explanation"],

            # Real DSPy/Groq metrics
            "input_tokens_used":   input_tokens,
            "output_tokens_used":  output_tokens,
            "total_tokens_used":   total_tokens,

            # Prompt comparison metrics
            "original_tokens":     original_tokens,
            "restructured_tokens": restructured_tokens,
            "token_delta":         token_delta,

            # Context: positive = shorter, negative = longer
            "prompt_shortened":    token_delta > 0,
        }

    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/health")
async def health():
    return {
        "status": "running",
        "compiled": os.path.exists(COMPILED_PATH)
    }
