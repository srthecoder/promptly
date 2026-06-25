"""
Side-by-side diff viewer rendered as HTML in Streamlit.
"""
import difflib
import streamlit as st
import streamlit.components.v1 as components


def render_diff(original: str, compressed: str):
    """Render a styled side-by-side HTML diff in Streamlit."""
    differ = difflib.HtmlDiff(wrapcolumn=60)
    html = differ.make_file(
        original.splitlines(),
        compressed.splitlines(),
        fromdesc="Original",
        todesc="Optimized",
        context=True,
        numlines=3,
    )

    # Inject custom CSS over difflib's defaults
    style = """
    <style>
      body { font-family: 'JetBrains Mono', monospace; font-size: 13px; }
      table.diff { width: 100%; border-collapse: collapse; }
      td { padding: 3px 8px; vertical-align: top; white-space: pre-wrap; word-break: break-word; }
      .diff_header { background: #1e1e2e; color: #cdd6f4; font-weight: bold; }
      .diff_next { display: none; }
      td.diff_add { background: #1e3a1e; color: #a6e3a1; }
      td.diff_chg { background: #2e2a1e; color: #f9e2af; }
      td.diff_sub { background: #3a1e1e; color: #f38ba8; text-decoration: line-through; }
    </style>
    """
    html = html.replace("</head>", f"{style}</head>")
    components.html(html, height=500, scrolling=True)
