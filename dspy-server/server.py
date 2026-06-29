import os
import io
import csv
import json
import dspy
import tiktoken
import base64
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pipeline import PromptlyPipeline
import requests

enc = tiktoken.get_encoding("cl100k_base")

# Datalab API configuration (Marker-powered)
DATALAB_API_KEY = os.environ.get("DATALAB_API_KEY")
DATALAB_CONVERT_ENDPOINT = "https://www.datalab.to/api/v1/convert"

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


def pdf_to_markdown(file_bytes: bytes) -> str:
    """Convert PDF to markdown using Datalab API (Marker-powered)"""
    if not DATALAB_API_KEY:
        print("[convert] Datalab API key not configured, using fallback")
        return pdf_to_markdown_fallback(file_bytes)
    
    try:
        # Call Datalab convert API with PDF file
        response = requests.post(
            DATALAB_CONVERT_ENDPOINT,
            headers={
                "X-API-Key": DATALAB_API_KEY
            },
            files={
                "file": ("document.pdf", io.BytesIO(file_bytes), "application/pdf")
            },
            timeout=120
        )
        
        if response.status_code == 200:
            result = response.json()
            # Datalab returns request_id and request_check_url for async polling
            # For now, check if markdown is in the response
            markdown = result.get("markdown", "")
            if markdown and len(markdown.strip()) > 50:
                print(f"[convert] Datalab API success: {len(markdown)} chars")
                return markdown.strip()
            else:
                # Try polling if async
                request_id = result.get("request_id")
                if request_id:
                    markdown = _poll_datalab_result(request_id)
                    if markdown:
                        return markdown
                print(f"[convert] Datalab returned empty/incomplete result, using fallback")
                return pdf_to_markdown_fallback(file_bytes)
        else:
            error_msg = response.json().get("message", response.text) if response.text else f"Status {response.status_code}"
            print(f"[convert] Datalab API error {response.status_code}: {error_msg}")
            return pdf_to_markdown_fallback(file_bytes)
            
    except Exception as e:
        print(f"[convert] Datalab API failed: {e}, using fallback")
        return pdf_to_markdown_fallback(file_bytes)


def _poll_datalab_result(request_id: str, max_polls: int = 60) -> str:
    """Poll Datalab API for async conversion result"""
    import time
    
    poll_url = f"https://www.datalab.to/api/v1/convert/{request_id}"
    
    for attempt in range(max_polls):
        try:
            response = requests.get(
                poll_url,
                headers={"X-API-Key": DATALAB_API_KEY},
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                markdown = result.get("markdown")
                if markdown and len(markdown.strip()) > 50:
                    print(f"[convert] Datalab poll success (attempt {attempt+1}): {len(markdown)} chars")
                    return markdown.strip()
                
                # Still processing
                time.sleep(2)
            else:
                print(f"[convert] Datalab poll error {response.status_code} on attempt {attempt+1}")
                return ""
                
        except Exception as e:
            print(f"[convert] Datalab poll failed (attempt {attempt+1}): {e}")
            return ""
    
    print(f"[convert] Datalab poll timeout after {max_polls} attempts")
    return ""


def pdf_to_markdown_fallback(file_bytes: bytes) -> str:
    """Fallback PDF extraction when Adobe API unavailable"""
    # Fallback 1: pdfplumber with tables
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            full_text = []
            for page in pdf.pages:
                tables = page.extract_tables()
                if tables:
                    for table in tables:
                        if table:
                            full_text.append("")
                            header = table[0]
                            full_text.append("| " + " | ".join(str(cell or "").strip() for cell in header) + " |")
                            full_text.append("| " + " | ".join(["---"] * len(header)) + " |")
                            for row in table[1:]:
                                full_text.append("| " + " | ".join(str(cell or "").strip() for cell in row) + " |")
                            full_text.append("")
                text = page.extract_text()
                if text:
                    full_text.append(text)
                    full_text.append("")
            result = "\n".join(full_text).strip()
            if result and len(result) > 50:
                print(f"[convert] pdfplumber fallback success: {len(result)} chars")
                return result
    except Exception as e:
        print(f"[convert] pdfplumber fallback failed: {e}")
    
    # Fallback 2: pymupdf
    try:
        import fitz
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        text = "\n".join(page.get_text() for page in doc)
        if text and len(text.strip()) > 50:
            print(f"[convert] pymupdf fallback success: {len(text)} chars")
            return text.strip()
    except Exception as e:
        print(f"[convert] pymupdf fallback failed: {e}")
    
    # Fallback 3: pypdf
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        text = "\n".join(
            p.extract_text() for p in reader.pages if p.extract_text()
        )
        if text and len(text.strip()) > 50:
            print(f"[convert] pypdf fallback success: {len(text)} chars")
            return text.strip()
    except Exception as e:
        print(f"[convert] pypdf fallback failed: {e}")
    
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

def sniff_filetype(content_bytes: bytes, filename: str) -> str:
    """
    Return the effective file type based on magic bytes first,
    falling back to extension. Prevents binary garbage when a
    PDF is uploaded with a .md/.txt extension.
    """
    if content_bytes[:4] == b"%PDF":
        return "pdf"
    if content_bytes[:2] in (b"PK", ) and filename.endswith((".docx", ".doc", ".xlsx", ".xls")):
        # ZIP-based Office formats — trust the extension
        return filename.rsplit(".", 1)[-1].lstrip(".")
    return filename.rsplit(".", 1)[-1].lstrip(".") if "." in filename else ""


@app.post("/convert")
async def convert_file(file: UploadFile):
    content_bytes = await file.read()
    filename      = (file.filename or "").lower()
    filetype      = sniff_filetype(content_bytes, filename)
    markdown      = ""
    format_used   = "markdown-kv"
    original_tokens = 0

    try:
        if filetype == "csv":
            text            = content_bytes.decode("utf-8", errors="replace")
            original_tokens = count_tokens(text)
            markdown        = csv_to_markdown_kv(text)
            format_used     = "markdown-table" if markdown.startswith("|") else "markdown-kv"

        elif filetype == "pdf":
            markdown = pdf_to_markdown(content_bytes)
            if not markdown:
                raise HTTPException(
                    400,
                    "Could not extract text from this PDF. "
                    "Make sure it is a text-based PDF, not scanned."
                )
            format_used     = "markdown"
            original_tokens = count_tokens(content_bytes.decode("utf-8", errors="replace"))

        elif filetype in ("docx", "doc"):
            markdown        = docx_to_markdown(content_bytes)
            original_tokens = count_tokens(markdown)
            format_used     = "markdown"

        elif filetype in ("xlsx", "xls"):
            original_tokens = count_tokens(content_bytes.decode("utf-8", errors="replace"))
            markdown        = xlsx_to_markdown_kv(content_bytes)
            format_used     = "markdown-table" if markdown.startswith("|") else "markdown-kv"

        elif filetype == "json":
            text            = content_bytes.decode("utf-8", errors="replace")
            original_tokens = count_tokens(text)
            markdown        = json_to_markdown_kv(content_bytes)
            format_used     = "markdown-kv"

        elif filetype in ("txt", "md"):
            raw             = content_bytes.decode("utf-8", errors="replace")
            original_tokens = count_tokens(raw)
            markdown        = txt_to_markdown(raw)
            format_used     = "markdown-kv"

        elif filetype in ("html", "htm"):
            text            = content_bytes.decode("utf-8", errors="replace")
            original_tokens = count_tokens(text)
            markdown        = html_to_markdown(content_bytes)
            format_used     = "markdown"

        else:
            raise HTTPException(400, f"Unsupported file type: {filename} (detected: {filetype})")

        print(f"[convert] Input: {filename} (detected: {filetype})")
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

        # Always return the extracted/converted markdown.
        # Never fall back to raw file bytes, which would be binary garbage.
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
