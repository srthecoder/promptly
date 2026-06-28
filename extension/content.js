/**
 * content.js — Injected on claude.ai, chat.openai.com, gemini.google.com, copilot.microsoft.com.
 * Single strategy: RESTRUCTURE. Drives the FAB panel; no separate overlay.
 */

if (window.__promptlyLoaded) throw new Error('Promptly already loaded');
window.__promptlyLoaded = true;

console.log('[Promptly] content.js loaded on:', window.location.hostname);

// ── Stats ─────────────────────────────────────────────────────────────────────
const COST_PER_TOKEN_GLOBAL = 3.0 / 1_000_000;

const DEFAULT_STATS = {
  totalOptimizations:   0,
  totalTokensSaved:     0,
  totalCostSaved:       0.0,
  bestCompression:      0,
  sessionOptimizations: 0,
  sessionTokensSaved:   0,
  avgPromptLength:      0,
  avgCompressedLength:  0,
  lastUpdated:          null
};

function recordOptimization(tokensBefore, tokensAfter) {
  const saved = Math.max(0, tokensBefore - tokensAfter);
  const cost  = saved * COST_PER_TOKEN_GLOBAL;
  const pct   = tokensBefore > 0 ? Math.round((saved / tokensBefore) * 100) : 0;
  const today = new Date().toDateString();

  chrome.storage.local.get(['promptlyStats'], (data) => {
    const s = data.promptlyStats ? { ...DEFAULT_STATS, ...data.promptlyStats } : { ...DEFAULT_STATS };

    if (s.lastUpdated !== today) {
      s.sessionOptimizations = 0;
      s.sessionTokensSaved   = 0;
    }

    s.totalOptimizations++;
    s.totalTokensSaved   += saved;
    s.totalCostSaved     += cost;
    s.bestCompression     = Math.max(s.bestCompression, pct);
    s.sessionOptimizations++;
    s.sessionTokensSaved += saved;

    const n = s.totalOptimizations;
    s.avgPromptLength     = Math.round((s.avgPromptLength     * (n - 1) + tokensBefore) / n);
    s.avgCompressedLength = Math.round((s.avgCompressedLength * (n - 1) + tokensAfter)  / n);
    s.lastUpdated = today;

    chrome.storage.local.set({ promptlyStats: s });
  });
}

// ── Prompt text helpers ───────────────────────────────────────────────────────
const getPromptText = () => {
  const host = window.location.hostname;
  let el = null;

  if (host.includes('openai.com') || host.includes('chatgpt.com')) {
    el = document.querySelector('#prompt-textarea') ||
         document.querySelector('div[contenteditable="true"]');
    return el ? (el.innerText || el.textContent || '').trim() : '';
  }
  if (host.includes('gemini.google.com')) {
    el = document.querySelector('.ql-editor') ||
         document.querySelector('rich-textarea') ||
         document.querySelector('div[contenteditable="true"]');
    return el ? (el.innerText || el.textContent || '').trim() : '';
  }
  el = document.querySelector('div[contenteditable="true"]');
  return el ? (el.innerText || el.textContent || '').trim() : '';
};

const replacePromptText = (newText) => {
  const host = window.location.hostname;
  let el = null;

  if (host.includes('openai.com') || host.includes('chatgpt.com')) {
    el = document.querySelector('#prompt-textarea') ||
         document.querySelector('div[contenteditable="true"]');
  } else if (host.includes('gemini.google.com')) {
    el = document.querySelector('.ql-editor') ||
         document.querySelector('div[contenteditable="true"]');
  } else {
    el = document.querySelector('div[contenteditable="true"]');
  }

  if (!el) return false;
  el.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, newText);
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
};

// ── Wait for prompt element ───────────────────────────────────────────────────
function waitForPromptEl(ms = 5000) {
  return new Promise((resolve) => {
    if (getPromptText() !== '') return resolve(true);
    const observer = new MutationObserver(() => {
      if (getPromptText() !== '') { observer.disconnect(); resolve(true); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(false); }, ms);
  });
}

// ── Attach .md file to platform chat ──────────────────────────────────────────
async function attachMarkdownFile(markdownText, originalFilename) {
  const baseName   = originalFilename.replace(/\.[^/.]+$/, '');
  const timestamp  = Date.now();
  const mdFilename = `${baseName}_${timestamp}.md`;
  const blob   = new Blob([markdownText], { type: 'text/markdown' });
  const mdFile = new File([blob], mdFilename, { type: 'text/markdown' });

  // Strategy 1: platform file input
  const inputs = document.querySelectorAll('input[type="file"]');
  for (const input of inputs) {
    if (input.id === 'p-file-input') continue;
    try {
      const dt = new DataTransfer();
      dt.items.add(mdFile);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input',  { bubbles: true }));
      await new Promise(r => setTimeout(r, 800));
      const attached = document.querySelector(
        '[data-testid*="attachment"], .attachment, [class*="upload-preview"], [class*="file-chip"]'
      );
      if (attached) {
        console.log('[Promptly] Attached .md via file input');
        return { success: true, method: 'file_input', filename: mdFilename };
      }
    } catch (e) { console.log('[Promptly] file input failed:', e); }
  }

  // Strategy 2: drag-drop onto the chat input
  const dropSelectors = [
    '[contenteditable="true"]', '#prompt-textarea', 'textarea', '.conversation-input', 'main'
  ];
  for (const sel of dropSelectors) {
    const target = document.querySelector(sel);
    if (!target) continue;
    try {
      const dt = new DataTransfer();
      dt.items.add(mdFile);
      target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }));
      await new Promise(r => setTimeout(r, 100));
      target.dispatchEvent(new DragEvent('dragover',  { bubbles: true, dataTransfer: dt }));
      await new Promise(r => setTimeout(r, 100));
      target.dispatchEvent(new DragEvent('drop',      { bubbles: true, dataTransfer: dt }));
      await new Promise(r => setTimeout(r, 800));
      console.log('[Promptly] Drag-drop .md attempted');
      return { success: true, method: 'drag_drop', filename: mdFilename };
    } catch (e) { console.log('[Promptly] drag-drop failed:', e); }
  }

  // Strategy 3: clipboard paste
  try {
    const pasteTarget = document.querySelector('[contenteditable="true"], #prompt-textarea, textarea');
    if (pasteTarget) {
      pasteTarget.focus();
      const dt = new DataTransfer();
      dt.items.add(mdFile);
      pasteTarget.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: dt }));
      await new Promise(r => setTimeout(r, 800));
      return { success: true, method: 'clipboard', filename: mdFilename };
    }
  } catch (e) { console.log('[Promptly] clipboard paste failed:', e); }

  // Strategy 4: download fallback
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = mdFilename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { success: false, method: 'download', filename: mdFilename,
           message: `Downloaded ${mdFilename} — attach it manually` };
}

// ── FAB + Panel ───────────────────────────────────────────────────────────────
function createFAB() {
  console.log('[Promptly] createFAB called');
  if (document.getElementById('promptly-fab')) return;

  const style = document.createElement('style');
  style.textContent = `
    #promptly-fab {
      position: fixed;
      right: 16px;
      bottom: 80px;
      z-index: 999998;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    #promptly-bubble {
      width: 48px; height: 48px;
      border-radius: 50%;
      background: #D85A30;
      border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 16px rgba(216,90,48,0.4);
      transition: transform .15s, box-shadow .15s;
      flex-shrink: 0; position: relative;
    }
    #promptly-bubble:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 20px rgba(216,90,48,0.5);
    }
    #promptly-bubble svg { pointer-events: none; }

    #p-warn-dot {
      display: none; position: absolute; top: 2px; right: 2px;
      width: 16px; height: 16px; border-radius: 50%;
      background: #ef4444; border: 2px solid #fff;
      color: #fff; font-size: 9px; font-weight: 800;
      align-items: center; justify-content: center; line-height: 1;
    }
    #p-warn-dot.visible { display: flex; }

    #promptly-panel {
      width: 280px;
      background: rgba(255,255,255,0.97);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-radius: 16px;
      border: 1px solid rgba(216,90,48,0.2);
      box-shadow: 0 8px 32px rgba(216,90,48,0.15);
      overflow: hidden;
      transform-origin: bottom right;
      transform: scale(0.85) translateY(8px);
      opacity: 0; pointer-events: none;
      transition: transform .18s cubic-bezier(.34,1.56,.64,1), opacity .15s ease;
    }
    #promptly-panel.open {
      transform: scale(1) translateY(0);
      opacity: 1; pointer-events: all;
    }

    .p-tab-bar {
      display: flex;
      border-bottom: 1px solid rgba(216,90,48,0.12);
    }
    .p-tab {
      flex: 1; padding: 9px 0;
      background: none; border: none; cursor: pointer;
      font-size: 12px; font-family: inherit;
      color: #993C1D; opacity: 0.5;
      transition: opacity .12s, background .12s;
    }
    .p-tab.active { opacity: 1; background: rgba(216,90,48,0.06); font-weight: 600; }
    .p-tab:hover  { opacity: 0.8; }

    .p-pane { display: none; padding: 14px; }
    .p-pane.active { display: block; }

    /* ── Prompt tab idle ── */
    .p-idle-empty {
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      text-align: center; padding: 28px 16px;
      gap: 8px; min-height: 100px;
    }
    .p-idle-text {
      font-size: 12px; color: #aaa; line-height: 1.5;
    }
    .p-idle-kbd {
      display: inline-block;
      background: rgba(216,90,48,0.12);
      border: 1px solid rgba(216,90,48,0.3);
      border-radius: 6px; padding: 3px 9px;
      font-size: 13px; font-weight: 700;
      color: #D85A30; font-family: monospace;
      letter-spacing: 0.02em;
    }

    /* ── Loading ── */
    #p-opt-loading {
      display: none; flex-direction: column;
      align-items: center; padding: 24px 14px; gap: 10px;
    }
    @keyframes p-fab-spin { to { transform: rotate(360deg); } }
    .p-opt-spinner {
      width: 22px; height: 22px;
      border: 2px solid rgba(216,90,48,0.2);
      border-top-color: #D85A30;
      border-radius: 50%;
      animation: p-fab-spin .7s linear infinite;
    }
    .p-opt-spinner-label { font-size: 12px; color: #993C1D; }

    /* ── Result ── */
    #p-opt-result { display: none; }

    .p-format-badge {
      display: inline-block; font-size: 11px; font-weight: 700;
      text-transform: uppercase; letter-spacing: .08em;
      background: rgba(216,90,48,0.12); color: #D85A30;
      padding: 4px 12px; border-radius: 20px; margin-bottom: 12px;
      border: 1px solid rgba(216,90,48,0.25);
    }

    .p-opt-metrics {
      display: grid; grid-template-columns: 1fr 1fr;
      border: 1px solid rgba(216,90,48,0.15);
      border-radius: 8px; overflow: hidden; margin-bottom: 10px;
    }
    .p-opt-metric {
      padding: 7px 9px; display: flex; flex-direction: column; gap: 2px;
      border-right: 1px solid rgba(216,90,48,0.12);
      background: rgba(216,90,48,0.03);
    }
    .p-opt-metric:last-child { border-right: none; }
    .p-opt-metric-label {
      font-size: 8.5px; font-weight: 700;
      text-transform: uppercase; letter-spacing: .5px; color: #999;
    }
    .p-opt-metric-value { font-size: 14px; font-weight: 700; color: #1a1a1a; }
    .p-opt-metric-value.saved { color: #D85A30; }

    .p-opt-section-label {
      font-size: 9px; font-weight: 700;
      text-transform: uppercase; letter-spacing: .6px;
      color: #bbb; margin-bottom: 4px;
    }
    .p-opt-text {
      background: rgba(255,255,255,0.7);
      border: 1px solid rgba(0,0,0,0.08);
      border-radius: 7px; padding: 8px 10px;
      font-size: 11.5px; line-height: 1.5;
      white-space: pre-wrap; word-break: break-word;
      max-height: 90px; overflow-y: auto;
      color: #2a2a3e; margin-bottom: 14px;
      user-select: text;
    }
    .p-opt-text.restructured {
      border-color: rgba(216,90,48,0.2);
      background: rgba(216,90,48,0.03);
    }
    .p-opt-explanation {
      font-size: 10.5px; color: #666; line-height: 1.45;
      margin-bottom: 10px; padding: 6px 8px;
      background: rgba(216,90,48,0.04);
      border-radius: 6px; display: none;
    }
    .p-opt-explanation.visible { display: block; }
    .p-opt-actions { display: flex; gap: 6px; margin-top: 2px; }
    .p-opt-use-btn {
      flex: 1; padding: 8px;
      background: #D85A30; color: #fff;
      border: none; border-radius: 8px;
      font-size: 12px; font-weight: 600; font-family: inherit;
      cursor: pointer; transition: background .12s;
    }
    .p-opt-use-btn:hover { background: #bf4e27; }
    .p-opt-dismiss-btn {
      padding: 8px 12px;
      background: transparent;
      border: 1.5px solid rgba(0,0,0,0.15);
      border-radius: 8px; font-size: 12px; font-weight: 500;
      font-family: inherit; color: #777;
      cursor: pointer; transition: background .12s;
    }
    .p-opt-dismiss-btn:hover { background: rgba(0,0,0,0.05); }

    /* ── Cost section ── */
    .p-cost-section {
      background: #fff5f3;
      border-radius: 8px;
      padding: 9px 11px;
      margin-bottom: 10px;
      font-size: 11px;
      color: #555;
    }
    .p-cost-unknown { color: #999; font-style: italic; }
    .p-cost-header {
      font-size: 9px; font-weight: 700;
      letter-spacing: 0.05em; color: #999;
      text-transform: uppercase; margin-bottom: 5px;
    }
    .p-cost-model {
      font-weight: 600; color: #333;
      margin-bottom: 5px; font-size: 11px;
    }
    .p-cost-row {
      display: flex; justify-content: space-between; padding: 1px 0;
    }
    .p-cost-total {
      font-weight: 700; color: #c0392b;
      font-size: 11px; padding-top: 3px;
    }
    .p-cost-divider { border-top: 1px solid #e8d5d0; margin: 3px 0; }
    .p-cost-rates { color: #999; margin-top: 5px; font-size: 9.5px; }
    .p-cost-note  { color: #c0392b; margin-top: 3px; font-size: 9.5px; }
    .p-cost-source { margin-top: 5px; font-size: 9.5px; }
    .p-cost-source a { color: #c0392b; text-decoration: none; }

    /* ── Attach tab ── */
    .p-dropzone {
      border: 2px dashed rgba(216,90,48,0.3);
      border-radius: 12px; padding: 20px 14px; text-align: center;
      cursor: pointer; transition: border-color .12s, background .12s;
      position: relative;
    }
    .p-dropzone:hover, .p-dropzone.drag-over {
      border-color: #D85A30; background: rgba(216,90,48,0.04);
    }
    .p-dropzone input[type="file"] {
      position: absolute; inset: 0; opacity: 0;
      cursor: pointer; width: 100%; height: 100%;
    }
    .p-drop-icon  { font-size: 22px; margin-bottom: 8px; }
    .p-drop-title { font-size: 12px; font-weight: 600; color: #993C1D; margin-bottom: 4px; }
    .p-drop-types { font-size: 10.5px; color: #aaa; margin-bottom: 10px; line-height: 1.6; }
    .p-drop-badge {
      display: inline-block; font-size: 10px; font-weight: 700;
      background: rgba(216,90,48,0.08); color: #D85A30;
      border: 1px solid rgba(216,90,48,0.2);
      padding: 2px 8px; border-radius: 20px;
    }

    .p-convert-result { margin-top: 12px; display: none; }
    .p-convert-result.visible { display: block; }
    .p-file-name {
      font-size: 11px; font-weight: 600; color: #1a1a1a;
      margin-bottom: 8px; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }
    .p-convert-stats {
      background: rgba(216,90,48,0.05);
      border: 1px solid rgba(216,90,48,0.15);
      border-radius: 8px; padding: 8px 10px;
      font-size: 11px; color: #333; line-height: 1.8; margin-bottom: 8px;
    }
    .p-stats-row   { display: flex; justify-content: space-between; }
    .p-stats-label { color: #666; }
    .p-stats-val   { font-weight: 600; color: #1a1a1a; }
    .p-savings-pill {
      display: inline-block; background: #D85A30; color: #fff;
      font-size: 10.5px; font-weight: 700;
      padding: 2px 8px; border-radius: 20px; margin-bottom: 10px;
    }
    .p-attach-btn {
      width: 100%; padding: 9px; background: #D85A30; color: #fff;
      border: none; border-radius: 10px;
      font-size: 13px; font-weight: 500; font-family: inherit;
      cursor: pointer; transition: background .12s;
    }
    .p-attach-btn:hover    { background: #bf4e27; }
    .p-attach-btn:disabled { background: #e8a080; cursor: default; }
    .p-attach-status {
      margin-top: 7px; font-size: 11px; font-weight: 600;
      text-align: center; min-height: 16px;
    }
    .p-attach-status.ok   { color: #16a34a; }
    .p-attach-status.warn { color: #d97706; }
    .p-attach-status.err  { color: #dc2626; }

    /* ── Stats tab ── */
    #p-pane-stats { padding: 14px; overflow-y: auto; max-height: 420px; }

    .p-st-section {
      font-size: 9.5px; font-weight: 800;
      text-transform: uppercase; letter-spacing: .7px;
      color: #993C1D; margin-bottom: 6px; margin-top: 12px;
    }
    .p-st-section:first-child { margin-top: 0; }

    .p-st-block {
      background: rgba(216,90,48,0.04);
      border: 1px solid rgba(216,90,48,0.14);
      border-radius: 10px; overflow: hidden; margin-bottom: 4px;
    }
    .p-st-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 7px 11px; font-size: 11.5px;
      border-bottom: 1px solid rgba(216,90,48,0.08);
    }
    .p-st-row:last-child { border-bottom: none; }
    .p-st-label { color: #555; }
    .p-st-val   { font-weight: 700; color: #D85A30; }
    .p-st-val.neutral { color: #1a1a1a; }

    .p-st-reset-btn {
      width: 100%; margin-top: 12px; padding: 7px;
      background: transparent;
      border: 1.5px solid rgba(216,90,48,0.25);
      border-radius: 8px; cursor: pointer;
      font-size: 11px; font-weight: 600; font-family: inherit;
      color: #993C1D; transition: background .12s, border-color .12s;
    }
    .p-st-reset-btn:hover {
      background: rgba(216,90,48,0.06);
      border-color: rgba(216,90,48,0.4);
    }
    .p-stats-empty {
      text-align: center; font-size: 11px; color: #aaa;
      padding: 24px 0; line-height: 1.7;
    }
  `;
  document.head.appendChild(style);

  const fab = document.createElement('div');
  fab.id = 'promptly-fab';
  fab.innerHTML = `
    <div id="promptly-panel">
      <div class="p-tab-bar">
        <button class="p-tab active" data-tab="prompt">✏️ Prompt</button>
        <button class="p-tab"        data-tab="attach">📎 Attach</button>
        <button class="p-tab"        data-tab="stats">📊 Stats</button>
      </div>

      <div class="p-pane active" id="p-pane-prompt">
        <!-- idle -->
        <div id="p-opt-idle">
          <div class="p-idle-empty">
            <span class="p-idle-text">Press</span>
            <kbd class="p-idle-kbd">⌘⇧P</kbd>
            <span class="p-idle-text">to restructure your prompt into a token-efficient format</span>
          </div>
        </div>

        <!-- loading -->
        <div id="p-opt-loading">
          <div class="p-opt-spinner"></div>
          <span class="p-opt-spinner-label">Restructuring…</span>
        </div>

        <!-- result -->
        <div id="p-opt-result">
          <div id="p-format-badge" class="p-format-badge" style="display:none"></div>
          <div class="p-opt-metrics" id="p-opt-metrics"></div>
          <div class="p-opt-section-label">Original</div>
          <div class="p-opt-text" id="p-opt-original"></div>
          <div class="p-opt-section-label">Restructured</div>
          <div class="p-opt-text restructured" id="p-opt-optimized"></div>
          <div id="p-opt-cost"></div>
          <div class="p-opt-actions">
            <button class="p-opt-use-btn"     id="p-opt-use">Use This</button>
            <button class="p-opt-dismiss-btn" id="p-opt-dismiss">Dismiss</button>
          </div>
        </div>
      </div>

      <div class="p-pane" id="p-pane-attach">
        <div class="p-dropzone" id="p-dropzone">
          <input type="file" id="p-file-input"
            accept=".pdf,.docx,.doc,.txt,.csv,.xlsx,.xls,.json,.html,.htm,.md" />
          <div class="p-drop-icon">📎</div>
          <div class="p-drop-title">Drop file or click to upload</div>
          <div class="p-drop-types">PDF · DOCX · CSV · XLSX · TXT · JSON · HTML</div>
          <span class="p-drop-badge">Converted to Markdown-KV</span>
        </div>
        <div class="p-convert-result" id="p-convert-result">
          <div class="p-file-name"    id="p-file-name"></div>
          <div class="p-convert-stats" id="p-convert-stats"></div>
          <div><span class="p-savings-pill" id="p-savings-pill"></span></div>
          <button class="p-attach-btn"  id="p-attach-btn">Attach to chat</button>
          <div class="p-attach-status"  id="p-attach-status"></div>
        </div>
      </div>

      <div class="p-pane" id="p-pane-stats">
        <div id="p-stats-content">
          <div class="p-stats-empty">No optimizations yet.<br>Press ⌘⇧P to get started.</div>
        </div>
      </div>
    </div>

    <button id="promptly-bubble" title="Promptly">
      <span id="p-warn-dot">!</span>
      <svg width="26" height="24" viewBox="0 0 26 24" fill="none">
        <rect x="1" y="1" width="24" height="16" rx="4" fill="white"/>
        <circle cx="9"  cy="9" r="2.2" fill="#D85A30"/>
        <circle cx="17" cy="9" r="2.2" fill="#D85A30"/>
        <path d="M6 21l5-4h9" stroke="white" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </button>
  `;
  document.body.appendChild(fab);

  const panel   = fab.querySelector('#promptly-panel');
  const bubble  = fab.querySelector('#promptly-bubble');
  const warnDot = fab.querySelector('#p-warn-dot');

  // ── Panel state helpers ────────────────────────────────────────────────────
  function showIdle() {
    fab.querySelector('#p-opt-idle').style.display    = 'block';
    fab.querySelector('#p-opt-loading').style.display = 'none';
    fab.querySelector('#p-opt-result').style.display  = 'none';
  }
  function showLoading() {
    fab.querySelector('#p-opt-idle').style.display    = 'none';
    fab.querySelector('#p-opt-loading').style.display = 'flex';
    fab.querySelector('#p-opt-result').style.display  = 'none';
  }
  function showResult({ original, optimized, explanation, result, onUse }) {
    fab.querySelector('#p-opt-idle').style.display    = 'none';
    fab.querySelector('#p-opt-loading').style.display = 'none';
    fab.querySelector('#p-opt-result').style.display  = 'block';

    const format_used         = result.format_used         ?? 'pipe';
    const input_tokens_used   = result.input_tokens_used   ?? 0;
    const output_tokens_used  = result.output_tokens_used  ?? 0;
    const original_tokens     = result.original_tokens     ?? 0;
    const restructured_tokens = result.restructured_tokens ?? 0;
    const token_delta         = result.token_delta         ?? 0;
    const cost_data           = result.cost_data           ?? null;

    console.log('[Promptly] showResult cost_data:', cost_data);

    // Format badge (pipe / markdown / xml)
    const badgeEl = fab.querySelector('#p-format-badge');
    const icons = { pipe: '|', markdown: '#', xml: '</>' };
    badgeEl.textContent = (icons[format_used] || '') + ' ' + format_used.toUpperCase();
    badgeEl.style.display = 'inline-block';

    const deltaLabel = token_delta > 0
      ? `−${token_delta} saved`
      : token_delta < 0
        ? `+${Math.abs(token_delta)} added`
        : '±0';

    fab.querySelector('#p-opt-metrics').innerHTML = `
      <div class="p-opt-metric">
        <div class="p-opt-metric-label">INPUT USED</div>
        <div class="p-opt-metric-value">${input_tokens_used} tokens</div>
      </div>
      <div class="p-opt-metric">
        <div class="p-opt-metric-label">OUTPUT USED</div>
        <div class="p-opt-metric-value">${output_tokens_used} tokens</div>
      </div>`;

    fab.querySelector('#p-opt-cost').innerHTML = renderCostSection(cost_data);

    fab.querySelector('#p-opt-original').textContent  = original;
    fab.querySelector('#p-opt-optimized').textContent = optimized;

    fab.querySelector('#p-opt-use').onclick     = () => { onUse(optimized); showIdle(); };
    fab.querySelector('#p-opt-dismiss').onclick = () => showIdle();
  }

  fab._showLoading = showLoading;
  fab._showResult  = showResult;
  fab._showIdle    = showIdle;

  // ── Draggable FAB ──────────────────────────────────────────────────────────
  let isDragging = false, dragOffsetX = 0, dragOffsetY = 0, hasDragged = false;

  fab.addEventListener('mousedown', (e) => {
    if (e.target.closest('#promptly-panel')) return;
    isDragging  = true;
    hasDragged  = false;
    dragOffsetX = e.clientX - fab.getBoundingClientRect().left;
    dragOffsetY = e.clientY - fab.getBoundingClientRect().top;
    fab.style.transition = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    hasDragged = true;
    const x = e.clientX - dragOffsetX, y = e.clientY - dragOffsetY;
    const maxX = window.innerWidth  - fab.offsetWidth  - 8;
    const maxY = window.innerHeight - fab.offsetHeight - 8;
    fab.style.left   = Math.max(8, Math.min(x, maxX)) + 'px';
    fab.style.top    = Math.max(8, Math.min(y, maxY)) + 'px';
    fab.style.right  = 'auto';
    fab.style.bottom = 'auto';
  });
  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    fab.style.transition = '';
    if (hasDragged) chrome.storage.sync.set({ fabX: fab.style.left, fabY: fab.style.top });
  });

  chrome.storage.sync.get(['fabX', 'fabY'], (pos) => {
    if (pos.fabX && pos.fabY) {
      fab.style.left = pos.fabX; fab.style.top = pos.fabY;
      fab.style.right = 'auto'; fab.style.bottom = 'auto';
    }
  });

  bubble.addEventListener('click', () => {
    if (hasDragged) return;
    panel.classList.toggle('open');
    // panel opened
  });

  document.addEventListener('click', (e) => {
    if (!fab.contains(e.target)) panel.classList.remove('open');
  }, true);

  // ── Tab switching ──────────────────────────────────────────────────────────
  fab.querySelectorAll('.p-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      fab.querySelectorAll('.p-tab').forEach(t => t.classList.remove('active'));
      fab.querySelectorAll('.p-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      fab.querySelector(`#p-pane-${tab.dataset.tab}`).classList.add('active');
      if (tab.dataset.tab === 'stats') renderStats();
    });
  });

  // ── Attach tab ────────────────────────────────────────────────────────────
  const dropzone  = fab.querySelector('#p-dropzone');
  const fileInput = fab.querySelector('#p-file-input');

  dropzone.addEventListener('dragover',  (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', ()  => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleConvertFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleConvertFile(fileInput.files[0]);
  });

  let convertedMarkdown = null;
  let convertedFilename = null;

  async function handleConvertFile(file) {
    const resultEl  = fab.querySelector('#p-convert-result');
    const nameEl    = fab.querySelector('#p-file-name');
    const statsEl   = fab.querySelector('#p-convert-stats');
    const pillEl    = fab.querySelector('#p-savings-pill');
    const attachBtn = fab.querySelector('#p-attach-btn');
    const statusEl  = fab.querySelector('#p-attach-status');

    convertedMarkdown = null;
    convertedFilename = file.name;
    nameEl.textContent   = file.name.length > 28 ? file.name.slice(0, 25) + '…' : file.name;
    statusEl.textContent = '';
    statusEl.className   = 'p-attach-status';
    attachBtn.disabled   = true;
    attachBtn.textContent = `Converting ${file.name}…`;
    pillEl.textContent   = '';
    statsEl.innerHTML    = '';
    resultEl.classList.add('visible');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const resp = await fetch('https://rikaaaaaa-promptly.hf.space/convert', {
        method: 'POST',
        body:   formData
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || 'Server error');
      }

      const data = await resp.json();
      console.log('[Promptly] Server response:', data);
      console.log('[Promptly] markdown field:', data.markdown ? data.markdown.slice(0, 100) : 'MISSING');
      convertedMarkdown = data.markdown;

      const origTokens = data.original_tokens ?? 0;
      const convTokens = data.converted_tokens ?? 0;

      const ext = file.name.split('.').pop().toLowerCase();
      const wasConverted = !['txt', 'md'].includes(ext);

      pillEl.textContent = '';

      if (wasConverted) {
        statsEl.innerHTML = `
          <div class="p-stats-row" style="color:#D85A30;font-weight:600;">
            <span>Converted to Markdown</span>
          </div>
          <div class="p-stats-row">
            <span class="p-stats-label">Original tokens</span>
            <span class="p-stats-val">${origTokens.toLocaleString()}</span>
          </div>
          <div class="p-stats-row">
            <span class="p-stats-label">Markdown tokens</span>
            <span class="p-stats-val">${convTokens.toLocaleString()}</span>
          </div>`;
        attachBtn.textContent = 'Attach as Markdown';
      } else {
        statsEl.innerHTML = `
          <div class="p-stats-row">
            <span class="p-stats-label">Tokens</span>
            <span class="p-stats-val">${convTokens.toLocaleString()}</span>
          </div>`;
        attachBtn.textContent = 'Attach to chat';
      }
      attachBtn.disabled = false;

    } catch (err) {
      console.error('[Promptly] Conversion failed:', err);
      statsEl.innerHTML    = '';
      pillEl.textContent   = '';
      attachBtn.textContent = 'Attach to chat';
      attachBtn.disabled   = true;
      statusEl.className   = 'p-attach-status err';
      statusEl.textContent = `Conversion failed — ${err.message || 'try a different file'}`;
    }
  }

  fab.querySelector('#p-attach-btn').addEventListener('click', async () => {
    if (!convertedMarkdown || !convertedFilename) return;
    const attachBtn = fab.querySelector('#p-attach-btn');
    const statusEl  = fab.querySelector('#p-attach-status');
    attachBtn.disabled    = true;
    attachBtn.textContent = 'Attaching…';

    const result = await attachMarkdownFile(convertedMarkdown, convertedFilename);

    attachBtn.disabled    = false;
    attachBtn.textContent = 'Attach to chat';

    if (result.method === 'download') {
      statusEl.className   = 'p-attach-status warn';
      statusEl.textContent = `⚠ Downloaded ${result.filename} — attach manually`;
    } else {
      statusEl.className   = 'p-attach-status ok';
      statusEl.textContent = `✓ ${result.filename} attached`;
    }
  });

  // ── Stats renderer ─────────────────────────────────────────────────────────
  function renderStats() {
    const el = fab.querySelector('#p-stats-content');

    chrome.storage.local.get(['promptlyStats'], (data) => {
      const s     = data.promptlyStats ? { ...DEFAULT_STATS, ...data.promptlyStats } : null;
      const today = new Date().toDateString();

      if (!s || s.totalOptimizations === 0) {
        el.innerHTML = `<div class="p-stats-empty">No optimizations yet.<br>Press ⌘⇧P to get started.</div>`;
        return;
      }

      const todayCount  = s.lastUpdated === today ? (s.sessionOptimizations || 0) : 0;
      const todayTokens = s.lastUpdated === today ? (s.sessionTokensSaved   || 0) : 0;
      const todayCost   = todayTokens * COST_PER_TOKEN_GLOBAL;

      el.innerHTML = `
        <div class="p-st-section">Today</div>
        <div class="p-st-block">
          <div class="p-st-row">
            <span class="p-st-label">Restructured</span>
            <span class="p-st-val neutral">${todayCount}</span>
          </div>
          <div class="p-st-row">
            <span class="p-st-label">Tokens saved</span>
            <span class="p-st-val">${todayTokens.toLocaleString()}</span>
          </div>
          <div class="p-st-row">
            <span class="p-st-label">Cost saved</span>
            <span class="p-st-val">$${todayCost.toFixed(3)}</span>
          </div>
        </div>

        <div class="p-st-section">All Time</div>
        <div class="p-st-block">
          <div class="p-st-row">
            <span class="p-st-label">Total restructured</span>
            <span class="p-st-val neutral">${s.totalOptimizations.toLocaleString()}</span>
          </div>
          <div class="p-st-row">
            <span class="p-st-label">Tokens saved</span>
            <span class="p-st-val">${s.totalTokensSaved.toLocaleString()}</span>
          </div>
          <div class="p-st-row">
            <span class="p-st-label">Money saved</span>
            <span class="p-st-val">$${s.totalCostSaved.toFixed(3)}</span>
          </div>
          <div class="p-st-row">
            <span class="p-st-label">Best compression</span>
            <span class="p-st-val">${s.bestCompression}%</span>
          </div>
          <div class="p-st-row">
            <span class="p-st-label">Avg prompt length</span>
            <span class="p-st-val neutral">${s.avgPromptLength} tok</span>
          </div>
          <div class="p-st-row">
            <span class="p-st-label">Avg after restructure</span>
            <span class="p-st-val neutral">${s.avgCompressedLength} tok</span>
          </div>
        </div>

        <button class="p-st-reset-btn" id="p-stats-reset">Reset Stats</button>
      `;

      el.querySelector('#p-stats-reset').addEventListener('click', () => {
        if (!confirm('Reset all Promptly stats?')) return;
        chrome.storage.local.remove('promptlyStats', renderStats);
      });
    });
  }
}

// ── Optimize command ──────────────────────────────────────────────────────────
async function optimize() {
  await waitForPromptEl();
  const prompt = getPromptText().trim();
  if (!prompt) return;

  const fab = document.getElementById('promptly-fab');
  if (!fab) return;

  const panel = fab.querySelector('#promptly-panel');
  panel.classList.add('open');
  fab.querySelectorAll('.p-tab').forEach(t => t.classList.remove('active'));
  fab.querySelectorAll('.p-pane').forEach(p => p.classList.remove('active'));
  fab.querySelector('.p-tab[data-tab="prompt"]').classList.add('active');
  fab.querySelector('#p-pane-prompt').classList.add('active');

  fab._showLoading();

  const detected_model = detectModel(window.location.hostname);
  const { images, pdf_pages } = getAttachmentInfo();

  chrome.runtime.sendMessage({
    type:      'OPTIMIZE',
    prompt,
    hostname:  window.location.hostname,
    model_key: detected_model,
    images,
    pdf_pages
  }, (resp) => {
    console.log('[Promptly] response:', resp);
    if (chrome.runtime.lastError || !resp) { fab._showIdle(); return; }
    if (!resp.ok)                          { fab._showIdle(); return; }

    recordOptimization(resp.original_tokens, resp.restructured_tokens);
    fab._showResult({
      original:    prompt,
      optimized:   resp.structured,
      explanation: resp.explanation ?? '',
      result:      resp,
      onUse: (text) => replacePromptText(text)
    });
  });
}

// ── Model change watcher ──────────────────────────────────────────────────────
function watchModelChanges() {
  const hostname    = window.location.hostname;
  const platformKey = Object.keys(PRICING_CONFIG.MODEL_SELECTORS)
    .find(k => hostname.includes(k));
  if (!platformKey) return;

  const config = PRICING_CONFIG.MODEL_SELECTORS[platformKey];
  for (const selector of config.selectors) {
    const el = document.querySelector(selector);
    if (el) {
      const observer = new MutationObserver(() => {
        const model = detectModel(hostname);
        console.log('[Promptly] Model changed to:', model);
      });
      observer.observe(el, { childList: true, subtree: true, characterData: true });
      break;
    }
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { createFAB(); watchModelChanges(); });
} else {
  createFAB();
  watchModelChanges();
}

chrome.runtime.onMessage.addListener((msg) => {
  console.log('[Promptly] message received:', msg);
  if (msg.type === 'OPTIMIZE') optimize();
});