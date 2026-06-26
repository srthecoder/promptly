/**
 * overlay.js — Injected before content.js on target pages.
 * Exposes window.PromptlyOverlay for content.js to call.
 */

window.PromptlyOverlay = (() => {
  let card = null;

  // ── Design tokens ────────────────────────────────────────────────────────────
  const CORAL       = "#D85A30";
  const CORAL_DARK  = "#bf4e27";
  const CORAL_LIGHT = "rgba(216,90,48,0.12)";

  // ── Logo mark: coral bubble on coral bg square ───────────────────────────────
  const LOGO_SVG = `<div style="width:32px;height:32px;border-radius:9px;background:#D85A30;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
    <svg width="18" height="16" viewBox="0 0 18 16" fill="none">
      <rect x="0.5" y="0.5" width="17" height="12" rx="3" fill="white" fill-opacity="0.95"/>
      <circle cx="6" cy="6.5" r="1.6" fill="#D85A30"/>
      <circle cx="12" cy="6.5" r="1.6" fill="#D85A30"/>
      <path d="M4.5 14.5l3.5-2h5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  </div>`;

  const STYLES = `
    #promptly-overlay,
    #promptly-overlay * {
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif;
    }

    /* ── Card ── */
    #promptly-overlay {
      position: fixed;
      bottom: 28px;
      right: 28px;
      z-index: 999999;
      width: 720px;
      max-width: calc(100vw - 56px);
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.85);
      border-radius: 16px;
      box-shadow:
        0 8px 32px rgba(0,0,0,.12),
        0 2px 8px rgba(0,0,0,.08),
        inset 0 1px 0 rgba(255,255,255,0.9);
      color: #1a1a2e;
      overflow: hidden;
    }

    /* ── Header ── */
    #promptly-overlay .p-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px 11px;
      background: #D85A30;
    }

    #promptly-overlay .p-logo {
      flex-shrink: 0;
      display: flex;
      align-items: center;
    }

    #promptly-overlay .p-wordmark {
      font-size: 14px;
      font-weight: 800;
      color: #fff;
      letter-spacing: -.3px;
    }

    #promptly-overlay .p-mode-badge {
      font-size: 10px;
      font-weight: 600;
      color: rgba(255,255,255,0.9);
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.3);
      border-radius: 20px;
      padding: 2px 9px;
      letter-spacing: .2px;
    }

    #promptly-overlay .p-savings-pill {
      margin-left: auto;
      font-size: 11px;
      font-weight: 700;
      color: #fff;
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.3);
      border-radius: 20px;
      padding: 3px 10px;
    }

    #promptly-overlay .p-close {
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.3);
      color: #fff;
      font-size: 14px;
      line-height: 1;
      cursor: pointer;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background .12s;
      flex-shrink: 0;
    }
    #promptly-overlay .p-close:hover { background: rgba(255,255,255,0.32); }

    /* ── Metrics row ── */
    #promptly-overlay .p-metrics {
      display: grid;
      grid-template-columns: repeat(4, 1fr) 1.25fr;
      gap: 0;
      border-bottom: 1px solid rgba(0,0,0,.07);
    }

    #promptly-overlay .p-metric {
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      border-right: 1px solid rgba(0,0,0,.06);
    }
    #promptly-overlay .p-metric:last-child { border-right: none; }

    #promptly-overlay .p-metric-label {
      font-size: 9.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .6px;
      color: #999;
    }

    #promptly-overlay .p-metric-value {
      font-size: 16px;
      font-weight: 700;
      color: #1a1a2e;
      line-height: 1.1;
    }

    #promptly-overlay .p-metric-value.savings {
      color: ${CORAL};
    }

    #promptly-overlay .p-metric.real-savings {
      background: rgba(216,90,48,0.05);
    }
    #promptly-overlay .p-metric.real-savings .p-metric-label {
      color: ${CORAL};
    }
    #promptly-overlay .p-metric.real-savings .p-metric-value {
      font-size: 18px;
      color: ${CORAL};
    }
    #promptly-overlay .p-metric-sub {
      font-size: 9px;
      color: #aaa;
      margin-top: 1px;
    }

    /* ── Diff panels ── */
    #promptly-overlay .p-panels {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-bottom: 1px solid rgba(0,0,0,.07);
    }

    #promptly-overlay .p-panel {
      padding: 12px 14px;
    }
    #promptly-overlay .p-panel:first-child {
      border-right: 1px solid rgba(0,0,0,.07);
    }

    #promptly-overlay .p-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 7px;
    }

    #promptly-overlay .p-panel-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .6px;
      color: #aaa;
    }

    #promptly-overlay .p-token-pill {
      font-size: 10px;
      font-weight: 600;
      background: rgba(0,0,0,.06);
      border-radius: 20px;
      padding: 2px 8px;
      color: #666;
    }
    #promptly-overlay .p-panel:last-child .p-token-pill {
      background: ${CORAL_LIGHT};
      color: ${CORAL_DARK};
    }

    #promptly-overlay .p-text {
      background: rgba(255,255,255,0.6);
      border: 1px solid rgba(0,0,0,.08);
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 12.5px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 160px;
      overflow-y: auto;
      color: #2a2a3e;
      user-select: text;
    }

    /* ── Explanation bar ── */
    #promptly-overlay .p-explanation {
      display: flex;
      align-items: flex-start;
      gap: 7px;
      padding: 9px 14px;
      background: rgba(255,107,107,0.06);
      border-bottom: 1px solid rgba(255,107,107,0.1);
    }

    #promptly-overlay .p-explanation-icon {
      font-size: 13px;
      flex-shrink: 0;
      margin-top: 1px;
    }

    #promptly-overlay .p-explanation-text {
      font-size: 11.5px;
      color: #555;
      line-height: 1.45;
    }

    /* ── Footer ── */
    #promptly-overlay .p-footer {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 11px 14px;
      background: rgba(255,255,255,0.5);
    }

    #promptly-overlay .p-btn {
      padding: 8px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background .12s, box-shadow .12s, transform .08s;
      border: none;
    }
    #promptly-overlay .p-btn:active { transform: scale(.97); }

    #promptly-overlay .p-btn-use {
      background: ${CORAL};
      background: linear-gradient(135deg, ${CORAL} 0%, #ff8e53 100%);
      color: #fff;
      box-shadow: 0 2px 10px rgba(255,107,107,.35);
    }
    #promptly-overlay .p-btn-use:hover {
      background: linear-gradient(135deg, ${CORAL_DARK} 0%, #e87040 100%);
      box-shadow: 0 4px 14px rgba(255,107,107,.45);
    }

    #promptly-overlay .p-btn-dismiss {
      background: transparent;
      border: 1.5px solid rgba(0,0,0,.15);
      color: #777;
    }
    #promptly-overlay .p-btn-dismiss:hover {
      background: rgba(0,0,0,.05);
      color: #444;
    }

    /* ── Loading state ── */
    #promptly-overlay .p-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 36px 16px;
      font-size: 13px;
      color: #999;
    }

    @keyframes p-spin {
      to { transform: rotate(360deg); }
    }
    #promptly-overlay .p-spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255,107,107,.2);
      border-top-color: ${CORAL};
      border-radius: 50%;
      animation: p-spin .7s linear infinite;
      flex-shrink: 0;
    }

    /* ── Image row ── */
    #promptly-overlay .p-image-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 14px;
      background: rgba(216,90,48,0.05);
      border-bottom: 1px solid rgba(216,90,48,0.12);
      flex-wrap: wrap;
    }

    #promptly-overlay .p-image-col {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    #promptly-overlay .p-image-label {
      font-size: 9.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .5px;
      color: #aaa;
    }

    #promptly-overlay .p-image-val {
      font-size: 12px;
      font-weight: 600;
      color: #333;
    }

    #promptly-overlay .p-image-arrow {
      font-size: 14px;
      color: #D85A30;
      font-weight: 700;
    }

    #promptly-overlay .p-image-saved {
      margin-left: auto;
      font-size: 11px;
      font-weight: 700;
      color: #D85A30;
      background: rgba(216,90,48,0.1);
      border: 1px solid rgba(216,90,48,0.2);
      border-radius: 20px;
      padding: 3px 10px;
      white-space: nowrap;
    }
  `;

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("promptly-styles")) return;
    const style = document.createElement("style");
    style.id = "promptly-styles";
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  function remove() {
    card?.remove();
    card = null;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  function showLoading(modeName) {
    injectStyles();
    remove();

    card = document.createElement("div");
    card.id = "promptly-overlay";
    card.innerHTML = `
      <div class="p-header">
        ${LOGO_SVG}
        <span class="p-wordmark">Promptly</span>
        <span class="p-mode-badge">${escHtml(modeName)}</span>
        <button class="p-close" id="p-close-btn">✕</button>
      </div>
      <div class="p-loading">
        <div class="p-spinner"></div>
        Optimizing with Groq…
      </div>
    `;
    document.body.appendChild(card);
    card.querySelector("#p-close-btn").addEventListener("click", remove);
  }

  // ── Result ───────────────────────────────────────────────────────────────────
  function showResult({ original, optimized, explanation, tokensBefore, tokensAfter, modeName, imageInfo = null, onUse }) {
    injectStyles();
    remove();

    const savedPct = tokensBefore > 0
      ? Math.round((1 - tokensAfter / tokensBefore) * 100)
      : 0;

    const savingsPill = savedPct > 0
      ? `↓ ${savedPct}% tokens`
      : tokensAfter > tokensBefore
        ? "↑ expanded"
        : "restructured";

    // Cost estimates using claude-sonnet $3/MTok input
    const COST_PER_TOKEN = 3.0 / 1_000_000;
    const promptSaving   = Math.max(0, tokensBefore - tokensAfter) * COST_PER_TOKEN;
    const costSaved      = promptSaving > 0
      ? `$${promptSaving.toFixed(5)}`
      : "$0.00000";

    const turnsNum  = savedPct >= 30 ? 2 : savedPct >= 10 ? 1 : 0;
    const turnsSaved = turnsNum > 0 ? `~${turnsNum}` : "0";
    const totalSaved = promptSaving + promptSaving * turnsNum;
    const realSavings = `$${totalSaved.toFixed(5)}`;

    const imageRow = imageInfo ? `
      <div class="p-image-row">
        <div class="p-image-col">
          <span class="p-image-label">Original image</span>
          <span class="p-image-val">${imageInfo.original.w}×${imageInfo.original.h} = ~${imageInfo.tokensOriginal} tokens</span>
        </div>
        <div class="p-image-arrow">→</div>
        <div class="p-image-col">
          <span class="p-image-label">Resized (50%)</span>
          <span class="p-image-val">${imageInfo.resized.w}×${imageInfo.resized.h} = ~${imageInfo.tokensResized} tokens</span>
        </div>
        <div class="p-image-saved">
          🖼 ${imageInfo.tokensOriginal - imageInfo.tokensResized} image tokens saved
        </div>
      </div>` : "";

    card = document.createElement("div");
    card.id = "promptly-overlay";
    card.innerHTML = `
      <div class="p-header">
        ${LOGO_SVG}
        <span class="p-wordmark">Promptly</span>
        <span class="p-mode-badge">${escHtml(modeName)}</span>
        <span class="p-savings-pill">${savingsPill}</span>
        <button class="p-close" id="p-close-btn">✕</button>
      </div>

      <div class="p-metrics">
        <div class="p-metric">
          <div class="p-metric-label">Original</div>
          <div class="p-metric-value">${tokensBefore}</div>
        </div>
        <div class="p-metric">
          <div class="p-metric-label">Optimized</div>
          <div class="p-metric-value">${tokensAfter}</div>
        </div>
        <div class="p-metric">
          <div class="p-metric-label">Cost Saved</div>
          <div class="p-metric-value savings">${costSaved}</div>
        </div>
        <div class="p-metric">
          <div class="p-metric-label">Turns Saved</div>
          <div class="p-metric-value savings">${turnsSaved}</div>
        </div>
        <div class="p-metric real-savings">
          <div class="p-metric-label">Real Savings</div>
          <div class="p-metric-value">${realSavings}</div>
          <div class="p-metric-sub">incl. avoided context</div>
        </div>
      </div>

      ${imageRow}

      <div class="p-panels">
        <div class="p-panel">
          <div class="p-panel-header">
            <span class="p-panel-label">Original</span>
            <span class="p-token-pill">${tokensBefore} tokens</span>
          </div>
          <div class="p-text">${escHtml(original)}</div>
        </div>
        <div class="p-panel">
          <div class="p-panel-header">
            <span class="p-panel-label">Optimized</span>
            <span class="p-token-pill">${tokensAfter} tokens</span>
          </div>
          <div class="p-text">${escHtml(optimized)}</div>
        </div>
      </div>

      ${explanation ? `
      <div class="p-explanation">
        <span class="p-explanation-icon" style="color:${CORAL}">💡</span>
        <span class="p-explanation-text">${escHtml(explanation)}</span>
      </div>` : ""}

      <div class="p-footer">
        <button class="p-btn p-btn-use"     id="p-use-btn">Use This</button>
        <button class="p-btn p-btn-dismiss" id="p-dismiss-btn">Dismiss</button>
      </div>
    `;
    document.body.appendChild(card);

    card.querySelector("#p-close-btn").addEventListener("click",   remove);
    card.querySelector("#p-dismiss-btn").addEventListener("click", remove);
    card.querySelector("#p-use-btn").addEventListener("click", () => {
      onUse(optimized);
      remove();
    });
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  function showError(message) {
    injectStyles();
    if (!card) return;
    const loading = card.querySelector(".p-loading");
    if (loading) {
      loading.innerHTML = `
        <span style="color:#e05c5c;font-size:13px">✕ ${escHtml(message)}</span>
      `;
    }
  }

  return { showLoading, showResult, showError, remove };
})();
