import os
import dspy
import tiktoken
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pipeline import PromptlyPipeline

enc = tiktoken.get_encoding("cl100k_base")

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

        input_tokens_used  = len(enc.encode(req.prompt))
        output_tokens_used = len(enc.encode(result["structured"]))
        token_delta        = input_tokens_used - output_tokens_used

        return {
            # The restructured prompt
            "structured":          result["structured"],
            "format_used":         result["format_used"],
            "explanation":         result["explanation"],

            # tiktoken counts
            "input_tokens_used":   input_tokens_used,
            "output_tokens_used":  output_tokens_used,
            "total_tokens_used":   input_tokens_used + output_tokens_used,

            # Prompt comparison metrics
            "original_tokens":     input_tokens_used,
            "restructured_tokens": output_tokens_used,
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
