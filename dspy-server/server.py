import os
import io
import csv
import json
import dspy
import tiktoken
from fastapi import FastAPI, HTTPException, UploadFile
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


# ── File conversion helpers ───────────────────────────────────────────────────

def count_tokens(text: str) -> int:
    return len(enc.encode(text))


def csv_to_markdown_table(content: str) -> str:
    reader = csv.reader(io.StringIO(content))
    rows = list(reader)
    if not rows:
        return content
    header  = rows[0]
    divider = ["---"] * len(header)
    lines   = ["| " + " | ".join(header) + " |",
               "| " + " | ".join(divider) + " |"]
    for row in rows[1:]:
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)


def csv_to_markdown_kv(content: str) -> str:
    reader = csv.DictReader(io.StringIO(content))
    rows = list(reader)
    if not rows:
        return content
    headers = list(rows[0].keys())
    if len(headers) <= 3:
        return csv_to_markdown_table(content)
    result = []
    for i, row in enumerate(rows):
        first_key = headers[0]
        header_val = str(row.get(first_key, f"Item {i+1}")).strip()
        result.append(f"## {header_val}")
        for key in headers[1:]:
            val = str(row.get(key, "")).strip()
            if val and val != "None":
                result.append(f"{key}: {val}")
        result.append("")
    return "\n".join(result)


def pdf_to_text(file_bytes: bytes) -> str:
    try:
        import fitz  # pymupdf
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        text = "\n".join(page.get_text() for page in doc)
        if text and len(text.strip()) > 50:
            print(f"[convert] pymupdf success: {len(text)} chars")
            return text.strip()
    except Exception as e:
        print(f"[convert] pymupdf failed: {e}")

    try:
        import pdfminer.high_level
        text = pdfminer.high_level.extract_text(io.BytesIO(file_bytes))
        if text and len(text.strip()) > 50:
            print(f"[convert] pdfminer success: {len(text)} chars")
            return text.strip()
    except Exception as e:
        print(f"[convert] pdfminer failed: {e}")

    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        text = "\n".join(
            p.extract_text() for p in reader.pages if p.extract_text()
        )
        if text and len(text.strip()) > 50:
            print(f"[convert] pypdf success: {len(text)} chars")
            return text.strip()
    except Exception as e:
        print(f"[convert] pypdf failed: {e}")

    return ""


def docx_to_markdown(file_bytes: bytes) -> str:
    import docx
    doc   = docx.Document(io.BytesIO(file_bytes))
    lines = []
    for para in doc.paragraphs:
        if para.style.name.startswith("Heading"):
            level = para.style.name[-1]
            lines.append(f"{'#' * int(level)} {para.text}")
        elif para.text.strip():
            lines.append(para.text)
    return "\n".join(lines)


def xlsx_to_markdown_kv(file_bytes: bytes) -> str:
    import openpyxl
    wb  = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True)
    ws  = wb.active
    out = io.StringIO()
    writer = csv.writer(out)
    for row in ws.iter_rows(values_only=True):
        writer.writerow([str(v) if v is not None else "" for v in row])
    return csv_to_markdown_kv(out.getvalue())


def html_to_markdown(file_bytes: bytes) -> str:
    from bs4 import BeautifulSoup
    text = file_bytes.decode("utf-8", errors="replace")
    soup = BeautifulSoup(text, "html.parser")
    return soup.get_text(separator="\n")


def txt_to_markdown(content: str) -> str:
    lines = content.split("\n")
    result = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            result.append("")
            continue
        # ALL CAPS lines become ## headers
        if stripped.isupper() and len(stripped) > 3:
            result.append(f"## {stripped.title()}")
        # Lines with colon in first half = KV pair — keep as-is
        elif ":" in stripped and stripped.index(":") < len(stripped) // 2:
            result.append(stripped)
        else:
            result.append(stripped)
    return "\n".join(result)


def json_to_markdown_kv(file_bytes: bytes) -> str:
    text = file_bytes.decode("utf-8", errors="replace")
    data = json.loads(text)
    lines = []
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                first_val = next(iter(item.values()), "Item")
                lines.append(f"## {first_val}")
                for k, v in item.items():
                    lines.append(f"{k}: {v}")
                lines.append("")
    elif isinstance(data, dict):
        for k, v in data.items():
            lines.append(f"{k}: {v}")
    return "\n".join(lines)


# ── /convert endpoint ─────────────────────────────────────────────────────────

@app.post("/convert")
async def convert_file(file: UploadFile):
    content_bytes = await file.read()
    filename      = (file.filename or "").lower()
    markdown      = ""
    format_used   = "markdown-kv"
    original_tokens = 0

    try:
        if filename.endswith(".csv"):
            text            = content_bytes.decode("utf-8", errors="replace")
            original_tokens = count_tokens(text)
            markdown        = csv_to_markdown_kv(text)
            format_used     = "markdown-table" if markdown.startswith("|") else "markdown-kv"

        elif filename.endswith(".pdf"):
            text = pdf_to_text(content_bytes)
            if not text:
                raise HTTPException(
                    400,
                    "Could not extract text from this PDF. "
                    "Make sure it is a text-based PDF, not scanned."
                )
            markdown        = text
            format_used     = "markdown"
            original_tokens = count_tokens(text)

        elif filename.endswith((".docx", ".doc")):
            markdown        = docx_to_markdown(content_bytes)
            original_tokens = count_tokens(markdown)
            format_used     = "markdown"

        elif filename.endswith((".xlsx", ".xls")):
            text            = content_bytes.decode("utf-8", errors="replace")
            original_tokens = count_tokens(text)
            markdown        = xlsx_to_markdown_kv(content_bytes)
            format_used     = "markdown-table" if markdown.startswith("|") else "markdown-kv"

        elif filename.endswith(".json"):
            text            = content_bytes.decode("utf-8", errors="replace")
            original_tokens = count_tokens(text)
            markdown        = json_to_markdown_kv(content_bytes)
            format_used     = "markdown-kv"

        elif filename.endswith((".txt", ".md")):
            raw             = content_bytes.decode("utf-8", errors="replace")
            original_tokens = count_tokens(raw)
            markdown        = txt_to_markdown(raw)
            format_used     = "markdown-kv"

        elif filename.endswith((".html", ".htm")):
            text            = content_bytes.decode("utf-8", errors="replace")
            original_tokens = count_tokens(text)
            markdown        = html_to_markdown(content_bytes)
            format_used     = "markdown"

        else:
            raise HTTPException(400, f"Unsupported file type: {filename}")

        print(f"[convert] Input: {filename}")
        print(f"[convert] Format: {format_used}")
        print(f"[convert] First 200 chars of output:")
        print(markdown[:200])

        converted_tokens  = count_tokens(markdown)
        original_size     = len(content_bytes)
        reduction         = 0.0
        if original_tokens > 0:
            reduction = round(
                (original_tokens - converted_tokens) / original_tokens * 100, 1
            )

        # If conversion made it larger, return original unchanged
        if converted_tokens >= original_tokens and original_tokens > 0:
            return {
                "markdown":            content_bytes.decode("utf-8", errors="replace"),
                "format_used":         "original",
                "original_size_bytes": original_size,
                "original_tokens":     original_tokens,
                "converted_tokens":    original_tokens,
                "token_reduction_pct": 0.0,
                "note": "Conversion would increase tokens. Original returned.",
            }

        return {
            "markdown":            markdown,
            "format_used":         format_used,
            "original_size_bytes": original_size,
            "original_tokens":     original_tokens,
            "converted_tokens":    converted_tokens,
            "token_reduction_pct": reduction,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Conversion failed: {str(e)}")
