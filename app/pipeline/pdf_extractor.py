"""
PDF → semantic text extraction.
Extracts raw text via PyMuPDF, then compresses to
meaning-dense representation via LLM — no RAG pipeline needed.
"""
import fitz  # PyMuPDF
from app.pipeline.compressor import call_llm

PDF_SYSTEM_PROMPT = """You are a semantic extractor for LLM consumption.
Extract only the conceptually unique claims, definitions, relationships,
and key facts from the provided text.

Rules:
- Remove all examples, repetition, transitions, headers, and filler
- Remove formatting artifacts (page numbers, footers, URLs unless essential)
- Output as dense semantic shorthand that preserves 100% of the logical meaning
- Another LLM should be able to answer any question about the original from your output
- Output ONLY the extracted content, nothing else"""


def extract_pdf(file_bytes: bytes) -> dict:
    """
    Accept raw PDF bytes, return semantic extract + metadata.
    """
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    
    raw_pages = []
    for page in doc:
        raw_pages.append(page.get_text())
    
    raw_text = "\n".join(raw_pages)
    page_count = len(doc)
    char_count = len(raw_text)
    doc.close()

    # LLM semantic compression
    semantic_extract, backend = call_llm(raw_text, PDF_SYSTEM_PROMPT)

    return {
        "raw_text":         raw_text,
        "semantic_extract": semantic_extract,
        "page_count":       page_count,
        "raw_char_count":   char_count,
        "backend_used":     backend,
    }
