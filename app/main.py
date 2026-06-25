"""
Prompt Optimizer — Main Streamlit App
"""
import streamlit as st
from app.config import MODES, COST_TABLE, DEFAULT_TARGET_MODEL
from app.pipeline.cleaner import clean
from app.pipeline.compressor import get_backend_status
from app.pipeline.token_auditor import savings_report
from app.pipeline.pdf_extractor import extract_pdf
from app.ui.diff_viewer import render_diff
from app.modes.cost_min import CostMinMode
from app.modes.concise import ConciseMode
from app.modes.deep_research import DeepResearchMode
from app.modes.code_gen import CodeGenMode
from app.modes.doc_query import DocQueryMode

MODE_MAP = {
    "cost_min":      CostMinMode(),
    "concise":       ConciseMode(),
    "deep_research": DeepResearchMode(),
    "code_gen":      CodeGenMode(),
    "doc_query":     DocQueryMode(),
}

st.set_page_config(
    page_title="Prompt Optimizer",
    page_icon="⚡",
    layout="wide",
)

# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.title("⚡ Prompt Optimizer")
    st.caption("Turn any input into the most LLM-efficient version.")
    st.divider()

    # Backend status
    status = get_backend_status()
    if status.available:
        st.success(f"🟢 {status.message}")
    else:
        st.error(f"🔴 {status.message}")
        st.code("ollama pull llama3.2", language="bash")

    st.divider()

    # Mode selector
    mode_key = st.radio(
        "Optimization Mode",
        options=list(MODES.keys()),
        format_func=lambda k: MODES[k],
        index=0,
    )

    st.divider()

    # Target model selector (affects cost display only)
    target_model = st.selectbox(
        "Target Model (for cost estimate)",
        options=list(COST_TABLE.keys()),
        index=0,
        help="Which paid model you plan to send the prompt to. Affects cost savings display only — compression itself is free.",
    )

    st.caption("💡 Compression is always free. Cost estimates show what you'd save on the target model.")

# ── Main Area ─────────────────────────────────────────────────────────────────
tab_text, tab_pdf = st.tabs(["✏️ Text / Prompt", "📄 PDF Upload"])

result = None

# ── Text Tab ──────────────────────────────────────────────────────────────────
with tab_text:
    user_input = st.text_area(
        "Paste your prompt, question, or any text",
        height=220,
        placeholder="Type or paste anything here — a rambling question, a rough prompt, code context, documentation...",
    )

    if st.button("⚡ Optimize", type="primary", disabled=not user_input.strip()):
        if not status.available:
            st.error("No LLM backend available. See sidebar for setup instructions.")
        else:
            with st.spinner("Optimizing..."):
                # Step 1: local clean
                cleaned, changes = clean(user_input)
                # Step 2: LLM compression
                mode = MODE_MAP[mode_key]
                result = mode.compress(cleaned, target_model)
                st.session_state["result"] = result
                st.session_state["clean_changes"] = changes

# ── PDF Tab ───────────────────────────────────────────────────────────────────
with tab_pdf:
    uploaded = st.file_uploader("Upload a PDF", type=["pdf"])
    pdf_question = st.text_input(
        "What do you want to know from this document?",
        placeholder="e.g. What are the key findings? What methodology was used?",
    )

    if st.button("⚡ Extract & Optimize", type="primary", disabled=not uploaded):
        if not status.available:
            st.error("No LLM backend available. See sidebar for setup instructions.")
        else:
            with st.spinner("Extracting and compressing PDF..."):
                pdf_result = extract_pdf(uploaded.read())
                # Combine semantic extract with user question
                combined = f"{pdf_result['semantic_extract']}\n\nQuestion: {pdf_question}" if pdf_question else pdf_result["semantic_extract"]
                mode = MODE_MAP["doc_query"]
                result = mode.compress(combined, target_model)
                result.original_text = pdf_result["raw_text"]  # show full original for diff
                st.session_state["result"] = result
                st.session_state["clean_changes"] = [f"PDF: {pdf_result['page_count']} pages extracted"]

# ── Results ───────────────────────────────────────────────────────────────────
if "result" in st.session_state:
    r = st.session_state["result"]

    st.divider()
    st.subheader("Results")

    # Metrics row
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Tokens Saved", f"{r.percent_saved}%")
    col2.metric("Tokens Before", f"{r.tokens_before:,}")
    col3.metric("Tokens After", f"{r.tokens_after:,}")
    col4.metric("Est. Cost Saved", f"${r.cost_saved:.5f}")

    if r.turns_saved_est > 0:
        st.info(f"💬 Estimated follow-up messages avoided: **{r.turns_saved_est}**")

    # What changed
    with st.expander("🔍 What changed and why"):
        st.write(r.explanation)
        if "clean_changes" in st.session_state:
            st.caption("Local cleaning: " + ", ".join(st.session_state["clean_changes"]))

    # Diff view
    st.subheader("Side-by-side Diff")
    render_diff(r.original_text, r.compressed_text)

    # Optimized output + download
    st.subheader("Optimized Output")
    st.text_area("Copy this into your LLM", value=r.compressed_text, height=180)
    st.download_button(
        "⬇️ Download optimized text",
        data=r.compressed_text,
        file_name="optimized_prompt.txt",
        mime="text/plain",
    )
