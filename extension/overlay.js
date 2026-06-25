/**
 * overlay.js — Injected before content.js on target pages.
 * Exposes window.PromptlyOverlay for content.js to call.
 */

window.PromptlyOverlay = (() => {
  let card = null;

  const STYLES = `
    #promptly-overlay * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }

    #promptly-overlay {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      width: 680px;
      max-width: calc(100vw - 48px);
      background: #1e1e2e;
      border: 1px solid #313145;
      border-radius: 12px;
      box-shadow: 0 16px 48px rgba(0,0,0,.65);
      color: #e8e8f0;
      overflow: hidden;
    }

    #promptly-overlay .p-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      background: #16162a;
      border-bottom: 1px solid #313145;
    }

    #promptly-overlay .p-title {
      font-size: 13px;
      font-weight: 700;
      color: #7c6af7;
      letter-spacing: -.2px;
    }

    #promptly-overlay .p-meta {
      font-size: 11px;
      color: #888899;
      margin-left: 10px;
    }

    #promptly-overlay .p-savings {
      font-size: 11px;
      font-weight: 600;
      color: #4caf7d;
      margin-left: auto;
      margin-right: 12px;
    }

    #promptly-overlay .p-close {
      background: none;
      border: none;
      color: #888899;
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
      transition: color .12s;
    }
    #promptly-overlay .p-close:hover { color: #e8e8f0; }

    #promptly-overlay .p-panels {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
    }

    #promptly-overlay .p-panel {
      padding: 12px 14px;
    }
    #promptly-overlay .p-panel:first-child {
      border-right: 1px solid #313145;
    }

    #promptly-overlay .p-panel-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .6px;
      color: #555568;
      margin-bottom: 6px;
      font-weight: 600;
    }

    #promptly-overlay .p-text {
      background: #13131f;
      border: 1px solid #2a2a3d;
      border-radius: 7px;
      padding: 10px 12px;
      font-size: 12.5px;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 180px;
      overflow-y: auto;
      color: #c8c8e0;
      resize: none;
      width: 100%;
      user-select: text;
    }

    #promptly-overlay .p-explanation {
      grid-column: 1 / -1;
      padding: 0 14px 10px;
      font-size: 11px;
      color: #666678;
      line-height: 1.4;
    }

    #promptly-overlay .p-footer {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-top: 1px solid #313145;
      background: #16162a;
    }

    #promptly-overlay .p-btn {
      padding: 7px 18px;
      border: none;
      border-radius: 7px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background .12s, opacity .12s;
    }

    #promptly-overlay .p-btn-use {
      background: #7c6af7;
      color: #fff;
    }
    #promptly-overlay .p-btn-use:hover { background: #9585ff; }

    #promptly-overlay .p-btn-dismiss {
      background: transparent;
      border: 1px solid #313145;
      color: #888899;
    }
    #promptly-overlay .p-btn-dismiss:hover { background: #2a2a3d; color: #e8e8f0; }

    #promptly-overlay .p-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 32px 16px;
      font-size: 13px;
      color: #666678;
    }

    @keyframes p-spin {
      to { transform: rotate(360deg); }
    }
    #promptly-overlay .p-spinner {
      width: 18px;
      height: 18px;
      border: 2px solid #313145;
      border-top-color: #7c6af7;
      border-radius: 50%;
      animation: p-spin .7s linear infinite;
    }
  `;

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

  function showLoading(modeName) {
    injectStyles();
    remove();

    card = document.createElement("div");
    card.id = "promptly-overlay";
    card.innerHTML = `
      <div class="p-topbar">
        <span class="p-title">Promptly ⚡</span>
        <span class="p-meta">${modeName}</span>
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

  function showResult({ original, optimized, explanation, tokensBefore, tokensAfter, modeName, onUse }) {
    injectStyles();
    remove();

    const savedPct = tokensBefore > 0
      ? Math.round((1 - tokensAfter / tokensBefore) * 100)
      : 0;
    const savingsLabel = savedPct > 0
      ? `${savedPct}% fewer tokens`
      : tokensAfter > tokensBefore
        ? "expanded for clarity"
        : "restructured";

    card = document.createElement("div");
    card.id = "promptly-overlay";
    card.innerHTML = `
      <div class="p-topbar">
        <span class="p-title">Promptly ⚡</span>
        <span class="p-meta">${modeName}</span>
        <span class="p-savings">${savingsLabel}</span>
        <button class="p-close" id="p-close-btn">✕</button>
      </div>
      <div class="p-panels">
        <div class="p-panel">
          <div class="p-panel-label">Original · ${tokensBefore} tokens</div>
          <div class="p-text">${escHtml(original)}</div>
        </div>
        <div class="p-panel">
          <div class="p-panel-label">Optimized · ${tokensAfter} tokens</div>
          <div class="p-text">${escHtml(optimized)}</div>
        </div>
        ${explanation ? `<div class="p-explanation">ℹ️ ${escHtml(explanation)}</div>` : ""}
      </div>
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

  function showError(message) {
    injectStyles();
    if (!card) return;
    card.querySelector(".p-loading").innerHTML = `
      <span style="color:#e05c5c">✕ ${escHtml(message)}</span>
    `;
  }

  function escHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  return { showLoading, showResult, showError, remove };
})();
