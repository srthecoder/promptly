/**
 * content.js — Injected on claude.ai, chat.openai.com, gemini.google.com, copilot.microsoft.com.
 * Finds the active textarea, listens for the optimize-prompt command forwarded
 * from background.js, and drives the FAB panel (no separate overlay).
 */

// ── Double-injection guard ────────────────────────────────────────────────────
if (window.__promptlyLoaded) {
  throw new Error('Promptly already loaded');
}
window.__promptlyLoaded = true;

console.log('[Promptly] content.js loaded on:', window.location.hostname);

// ── Stats tracking ────────────────────────────────────────────────────────────
const COST_PER_TOKEN_GLOBAL = 3.0 / 1_000_000;

const DEFAULT_STATS = {
  totalOptimizations: 0,
  totalTokensSaved:   0,
  totalCostSaved:     0.0,
  bestCompression:    0,
  sessionOptimizations: 0,
  sessionTokensSaved:   0,
  modeUsage: { cost_min: 0, concise: 0, deep_research: 0, code_gen: 0 },
  avgPromptLength:     0,
  avgCompressedLength: 0,
  lastUpdated:         null
};

function recordOptimization(tokensBefore, tokensAfter, mode) {
  const saved  = Math.max(0, tokensBefore - tokensAfter);
  const cost   = saved * COST_PER_TOKEN_GLOBAL;
  const pct    = tokensBefore > 0 ? Math.round((saved / tokensBefore) * 100) : 0;
  const today  = new Date().toDateString();

  chrome.storage.local.get(['promptlyStats'], (data) => {
    const s = data.promptlyStats ? { ...DEFAULT_STATS, ...data.promptlyStats } : { ...DEFAULT_STATS };

    // Reset "today" counters when the date changes
    if (s.lastUpdated !== today) {
      s.sessionOptimizations = 0;
      s.sessionTokensSaved   = 0;
    }

    s.totalOptimizations++;
    s.totalTokensSaved   += saved;
    s.totalCostSaved     += cost;
    s.bestCompression    = Math.max(s.bestCompression, pct);
    s.sessionOptimizations++;
    s.sessionTokensSaved += saved;
    if (!s.modeUsage) s.modeUsage = { ...DEFAULT_STATS.modeUsage };
    s.modeUsage[mode]    = (s.modeUsage[mode] || 0) + 1;

    // Running averages for prompt length
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

const MODE_LABELS = {
  cost_min:      "Cost Minimizer",
  concise:       "Concise Answer",
  deep_research: "Deep Research",
  code_gen:      "Code Generation"
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

// ── Context cost tracking ─────────────────────────────────────────────────────
const IMG_ATTACH_SELECTORS = [
  '[data-testid="file-thumbnail"]',
  '[data-testid="attachment"] img',
  '.attachment-item img',
  '.image-attachment',
  'img[data-original-src]'
];

function getMessageCount() {
  const host = window.location.hostname;

  if (host.includes('claude.ai')) {
    return document.querySelectorAll(
      '[data-testid="human-turn"], .human-turn, div[class*="human"]'
    ).length;
  }
  if (host.includes('openai.com') || host.includes('chatgpt.com')) {
    return document.querySelectorAll('[data-message-author-role="user"]').length;
  }
  if (host.includes('gemini.google.com')) {
    return document.querySelectorAll('.user-query, user-query, [class*="user-message"]').length;
  }
  return 0;
}

function hasImageAttachment() {
  return IMG_ATTACH_SELECTORS.some(sel => !!document.querySelector(sel));
}

// ── Code pattern detection ────────────────────────────────────────────────────
const CODE_PATTERNS = /```|function\s+\w+|const\s+\w+\s*=|def\s+\w+|class\s+\w+[\s:{]|import\s+\w|#include|SELECT\s+\w|CREATE\s+TABLE/i;

function detectMode(text, userMode) {
  if (CODE_PATTERNS.test(text)) return 'code_gen';
  return userMode;
}

// ── Image compression ─────────────────────────────────────────────────────────
const compressImage = (file, mode = 'photo') => new Promise(resolve => {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(img.width  * 0.5);
    canvas.height = Math.round(img.height * 0.5);
    const ctx = canvas.getContext('2d');
    if (mode === 'text') ctx.filter = 'grayscale(100%)';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const origSize = file.size;
    canvas.toBlob(blob => {
      resolve({
        file:             new File([blob], file.name, { type: 'image/jpeg' }),
        originalW:        img.width,
        originalH:        img.height,
        originalTokens:   Math.round((img.width  * img.height)  / 750),
        compressedTokens: Math.round((canvas.width * canvas.height) / 750),
        originalKB:       Math.round(origSize   / 1024),
        compressedKB:     Math.round(blob.size  / 1024)
      });
    }, 'image/jpeg', 0.82);
  };
  img.src = URL.createObjectURL(file);
});

// ── Platform-aware file insertion ─────────────────────────────────────────────
const insertCompressedFile = async (file) => {
  const host = window.location.hostname;

  // Gemini-specific: needs Object.defineProperty + click
  if (host.includes('gemini.google.com')) {
    const inputs = document.querySelectorAll('input[type="file"]');
    for (const input of inputs) {
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        Object.defineProperty(input, 'files', { value: dt.files, writable: false });
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input',  { bubbles: true }));
        input.click();
        return 'file-input';
      } catch (e) { continue; }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = file.name; a.click();
    return 'download';
  }

  // Strategy 1: direct file input
  const inputs = document.querySelectorAll('input[type="file"]');
  for (const input of inputs) {
    if (input.id === 'p-file-input') continue;
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input',  { bubbles: true }));
      return 'file-input';
    } catch (e) { continue; }
  }

  // Strategy 2: drag-and-drop simulation
  const dropZones = ['[contenteditable="true"]', '#prompt-textarea', 'main', 'body'];
  for (const sel of dropZones) {
    const zone = document.querySelector(sel);
    if (!zone) continue;
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      ['dragenter', 'dragover', 'drop'].forEach(e =>
        zone.dispatchEvent(new DragEvent(e, { dataTransfer: dt, bubbles: true }))
      );
      return 'drag-drop';
    } catch (e) { continue; }
  }

  // Strategy 3: clipboard paste
  const target = document.querySelector('[contenteditable="true"], textarea');
  if (target) {
    target.focus();
    const dt = new DataTransfer();
    dt.items.add(file);
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
    return 'clipboard';
  }

  // Strategy 4: download fallback
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'download';
};

// ── FAB + Panel ───────────────────────────────────────────────────────────────
function createFAB() {
  console.log('[Promptly] injectFAB called');
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

    /* ── Bubble ── */
    #promptly-bubble {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #D85A30;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 16px rgba(216,90,48,0.4);
      transition: transform .15s, box-shadow .15s;
      flex-shrink: 0;
      position: relative;
    }
    #promptly-bubble:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 20px rgba(216,90,48,0.5);
    }
    #promptly-bubble svg { pointer-events: none; }

    #p-warn-dot {
      display: none;
      position: absolute;
      top: 2px; right: 2px;
      width: 16px; height: 16px;
      border-radius: 50%;
      background: #ef4444;
      border: 2px solid #fff;
      color: #fff;
      font-size: 9px; font-weight: 800;
      align-items: center; justify-content: center;
      line-height: 1;
    }
    #p-warn-dot.visible { display: flex; }

    /* ── Panel ── */
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
      opacity: 0;
      pointer-events: none;
      transition: transform .18s cubic-bezier(.34,1.56,.64,1), opacity .15s ease;
    }
    #promptly-panel.open {
      transform: scale(1) translateY(0);
      opacity: 1;
      pointer-events: all;
    }

    /* ── Tabs ── */
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
    .p-prompt-hint {
      font-size: 12px; color: #993C1D;
      line-height: 1.6; text-align: center;
      padding: 4px 0 10px;
    }
    .p-prompt-hint kbd {
      display: inline-block;
      background: rgba(216,90,48,0.1);
      border: 1px solid rgba(216,90,48,0.25);
      border-radius: 4px; padding: 1px 5px;
      font-size: 10.5px; color: #993C1D; font-family: monospace;
    }

    /* ── Context tracker ── */
    .p-ctx-tracker {
      background: rgba(216,90,48,0.05);
      border: 1px solid rgba(216,90,48,0.15);
      border-radius: 10px; padding: 10px 11px;
      font-size: 11px; color: #333;
    }
    .p-ctx-title { font-size: 11px; font-weight: 700; color: #993C1D; margin-bottom: 7px; }
    .p-ctx-row   { display: flex; justify-content: space-between; margin-bottom: 3px; line-height: 1.6; }
    .p-ctx-label { color: #666; }
    .p-ctx-val   { font-weight: 600; color: #1a1a1a; }
    .p-ctx-tip   {
      margin-top: 8px; font-size: 10.5px; color: #993C1D;
      line-height: 1.5; padding-top: 7px;
      border-top: 1px solid rgba(216,90,48,0.12);
    }

    /* ── In-panel optimization states ── */
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

    #p-opt-result { display: none; }

    .p-opt-metrics {
      display: grid; grid-template-columns: repeat(3, 1fr);
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
      font-size: 9.5px; font-weight: 700;
      text-transform: uppercase; letter-spacing: .5px;
      color: #aaa; margin-bottom: 3px;
    }
    .p-opt-text {
      background: rgba(255,255,255,0.7);
      border: 1px solid rgba(0,0,0,0.08);
      border-radius: 7px; padding: 7px 9px;
      font-size: 11.5px; line-height: 1.5;
      white-space: pre-wrap; word-break: break-word;
      max-height: 90px; overflow-y: auto;
      color: #2a2a3e; margin-bottom: 8px;
      user-select: text;
    }
    .p-opt-text.optimized {
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

    /* ── Attach tab ── */
    .p-compress-modes { display: flex; gap: 6px; margin-bottom: 10px; }
    .p-cmode-btn {
      flex: 1; padding: 6px 4px;
      background: #fff;
      border: 1.5px solid rgba(216,90,48,0.25);
      border-radius: 8px; cursor: pointer;
      font-size: 11px; font-family: inherit; color: #993C1D;
      transition: background .12s, border-color .12s; text-align: center;
    }
    .p-cmode-btn.active { background: #D85A30; border-color: #D85A30; color: #fff; font-weight: 600; }
    .p-cmode-btn:not(.active):hover { background: rgba(216,90,48,0.06); }

    .p-dropzone {
      border: 2px dashed rgba(216,90,48,0.3);
      border-radius: 12px; padding: 16px; text-align: center;
      cursor: pointer;
      transition: border-color .12s, background .12s;
      position: relative;
    }
    .p-dropzone:hover, .p-dropzone.drag-over {
      border-color: #D85A30; background: rgba(216,90,48,0.04);
    }
    .p-dropzone input[type="file"] {
      position: absolute; inset: 0; opacity: 0;
      cursor: pointer; width: 100%; height: 100%;
    }
    .p-drop-icon  { font-size: 22px; margin-bottom: 6px; }
    .p-drop-title { font-size: 12px; font-weight: 600; color: #993C1D; margin-bottom: 2px; }
    .p-drop-sub   { font-size: 11px; color: #993C1D; opacity: 0.65; }

    .p-file-result { margin-top: 12px; display: none; }
    .p-file-result.visible { display: block; }
    .p-file-name {
      font-size: 11px; font-weight: 600; color: #1a1a1a;
      margin-bottom: 8px; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }
    .p-stats {
      background: rgba(216,90,48,0.05);
      border: 1px solid rgba(216,90,48,0.15);
      border-radius: 8px; padding: 8px 10px;
      font-size: 11px; color: #333; line-height: 1.8; margin-bottom: 8px;
    }
    .p-stats-row   { display: flex; justify-content: space-between; }
    .p-stats-label { color: #666; }
    .p-stats-val   { font-weight: 600; color: #1a1a1a; }
    .p-stats-note  {
      font-size: 10px; color: #993C1D; opacity: 0.75;
      margin-top: 4px; padding-top: 4px;
      border-top: 1px solid rgba(216,90,48,0.12);
    }
    .p-savings-pill {
      display: inline-block; background: #D85A30; color: #fff;
      font-size: 10.5px; font-weight: 700;
      padding: 2px 8px; border-radius: 20px; margin-bottom: 10px;
    }
    .p-insert-btn {
      width: 100%; padding: 9px; background: #D85A30; color: #fff;
      border: none; border-radius: 10px;
      font-size: 13px; font-weight: 500; font-family: inherit;
      cursor: pointer; transition: background .12s;
    }
    .p-insert-btn:hover    { background: #bf4e27; }
    .p-insert-btn:disabled { background: #e8a080; cursor: default; }
    .p-insert-status {
      margin-top: 7px; font-size: 11px; font-weight: 600;
      text-align: center; min-height: 16px;
    }
    .p-insert-status.ok   { color: #16a34a; }
    .p-insert-status.warn { color: #d97706; }

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

    .p-st-mode-row {
      padding: 7px 11px;
      border-bottom: 1px solid rgba(216,90,48,0.08);
    }
    .p-st-mode-row:last-child { border-bottom: none; }
    .p-st-mode-header {
      display: flex; justify-content: space-between;
      font-size: 11px; margin-bottom: 4px;
    }
    .p-st-mode-name { color: #333; }
    .p-st-mode-pct  { font-weight: 700; color: #D85A30; }
    .p-st-bar-track {
      height: 5px; border-radius: 3px;
      background: rgba(216,90,48,0.15); overflow: hidden;
    }
    .p-st-bar-fill {
      height: 100%; border-radius: 3px;
      background: #D85A30;
      transition: width .3s ease;
    }

    .p-st-reset-btn {
      width: 100%; margin-top: 12px; padding: 7px;
      background: transparent;
      border: 1.5px solid rgba(216,90,48,0.25);
      border-radius: 8px; cursor: pointer;
      font-size: 11px; font-weight: 600; font-family: inherit;
      color: #993C1D;
      transition: background .12s, border-color .12s;
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
          <div class="p-prompt-hint">
            Press <kbd>⌘⇧P</kbd> to optimize<br>the current prompt
          </div>
          <div class="p-ctx-tracker" id="p-ctx-tracker">
            <div class="p-ctx-title">📈 Context Cost Tracker</div>
            <div class="p-ctx-row">
              <span class="p-ctx-label">Messages so far</span>
              <span class="p-ctx-val" id="p-ctx-msgs">—</span>
            </div>
            <div class="p-ctx-row">
              <span class="p-ctx-label">Est. context tokens</span>
              <span class="p-ctx-val" id="p-ctx-tokens">—</span>
            </div>
            <div class="p-ctx-row" id="p-ctx-img-row" style="display:none">
              <span class="p-ctx-label">Image re-sent</span>
              <span class="p-ctx-val" id="p-ctx-img-cost">—</span>
            </div>
            <div class="p-ctx-row" id="p-ctx-total-row" style="display:none">
              <span class="p-ctx-label">Total session cost</span>
              <span class="p-ctx-val" id="p-ctx-total">—</span>
            </div>
            <div class="p-ctx-tip" id="p-ctx-tip" style="display:none"></div>
          </div>
        </div>

        <!-- loading -->
        <div id="p-opt-loading">
          <div class="p-opt-spinner"></div>
          <span class="p-opt-spinner-label">Optimizing…</span>
        </div>

        <!-- result -->
        <div id="p-opt-result">
          <div class="p-opt-metrics" id="p-opt-metrics"></div>
          <div class="p-opt-section-label">Original</div>
          <div class="p-opt-text" id="p-opt-original"></div>
          <div class="p-opt-section-label">Optimized</div>
          <div class="p-opt-text optimized" id="p-opt-optimized"></div>
          <div class="p-opt-explanation" id="p-opt-explanation"></div>
          <div class="p-opt-actions">
            <button class="p-opt-use-btn"     id="p-opt-use">Use This</button>
            <button class="p-opt-dismiss-btn" id="p-opt-dismiss">Dismiss</button>
          </div>
        </div>
      </div>

      <div class="p-pane" id="p-pane-attach">
        <div class="p-compress-modes">
          <button class="p-cmode-btn active" data-mode="photo">📷 Photo/Color</button>
          <button class="p-cmode-btn"        data-mode="text">📄 Text/Diagram</button>
        </div>
        <div class="p-dropzone" id="p-dropzone">
          <input type="file" id="p-file-input" accept="image/*,.pdf" />
          <div class="p-drop-icon">📎</div>
          <div class="p-drop-title">Drop image or PDF</div>
          <div class="p-drop-sub">Compresses before inserting</div>
        </div>
        <div class="p-file-result" id="p-file-result">
          <div class="p-file-name" id="p-file-name"></div>
          <div class="p-stats"     id="p-stats"></div>
          <div><span class="p-savings-pill" id="p-savings-pill"></span></div>
          <button class="p-insert-btn"      id="p-insert-btn">Insert to chat</button>
          <div class="p-insert-status"      id="p-insert-status"></div>
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
  function showResult({ original, optimized, explanation, tokensBefore, tokensAfter, onUse }) {
    fab.querySelector('#p-opt-idle').style.display    = 'none';
    fab.querySelector('#p-opt-loading').style.display = 'none';
    fab.querySelector('#p-opt-result').style.display  = 'block';

    const savedPct = tokensBefore > 0
      ? Math.round((1 - tokensAfter / tokensBefore) * 100)
      : 0;

    fab.querySelector('#p-opt-metrics').innerHTML = `
      <div class="p-opt-metric">
        <div class="p-opt-metric-label">Before</div>
        <div class="p-opt-metric-value">${tokensBefore}</div>
      </div>
      <div class="p-opt-metric">
        <div class="p-opt-metric-label">After</div>
        <div class="p-opt-metric-value">${tokensAfter}</div>
      </div>
      <div class="p-opt-metric">
        <div class="p-opt-metric-label">Saved</div>
        <div class="p-opt-metric-value saved">${savedPct > 0 ? savedPct + '%' : '—'}</div>
      </div>`;

    fab.querySelector('#p-opt-original').textContent  = original;
    fab.querySelector('#p-opt-optimized').textContent = optimized;

    const expEl = fab.querySelector('#p-opt-explanation');
    if (explanation) {
      expEl.textContent = '💡 ' + explanation;
      expEl.classList.add('visible');
    } else {
      expEl.classList.remove('visible');
    }

    const useBtn = fab.querySelector('#p-opt-use');
    const dimBtn = fab.querySelector('#p-opt-dismiss');
    useBtn.onclick = () => { onUse(optimized); showIdle(); };
    dimBtn.onclick = () => showIdle();
  }

  // Expose on the FAB element so optimize() can reach it
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
    if (panel.classList.contains('open')) updateContextTracker();
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

  // ── Compression mode toggle ────────────────────────────────────────────────
  let compressionMode = 'photo';
  fab.querySelectorAll('.p-cmode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      fab.querySelectorAll('.p-cmode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      compressionMode = btn.dataset.mode;
    });
  });

  // ── Drop zone ─────────────────────────────────────────────────────────────
  const dropzone = fab.querySelector('#p-dropzone');
  dropzone.addEventListener('dragover',  (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', ()  => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });

  const fileInput = fab.querySelector('#p-file-input');
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  let compressedFile = null;

  async function handleFile(file) {
    const resultEl  = fab.querySelector('#p-file-result');
    const nameEl    = fab.querySelector('#p-file-name');
    const statsEl   = fab.querySelector('#p-stats');
    const pillEl    = fab.querySelector('#p-savings-pill');
    const insertBtn = fab.querySelector('#p-insert-btn');
    const statusEl  = fab.querySelector('#p-insert-status');

    nameEl.textContent = file.name.length > 20 ? file.name.slice(0, 17) + '…' : file.name;
    statusEl.textContent = ''; statusEl.className = 'p-insert-status';

    if (file.type.startsWith('image/')) {
      insertBtn.disabled = true;
      insertBtn.textContent = 'Compressing…';

      const info = await compressImage(file, compressionMode);
      compressedFile = info.file;

      const savedPct = Math.round((1 - info.compressedTokens / info.originalTokens) * 100);
      const wOut = Math.round(info.originalW * 0.5);
      const hOut = Math.round(info.originalH * 0.5);

      if (compressionMode === 'text') {
        const kbSaved = Math.max(0, info.originalKB - info.compressedKB);
        statsEl.innerHTML = `
          <div class="p-stats-row">
            <span class="p-stats-label">Before</span>
            <span class="p-stats-val">${info.originalW}×${info.originalH} · ~${info.originalTokens.toLocaleString()}t · ${info.originalKB}KB</span>
          </div>
          <div class="p-stats-row">
            <span class="p-stats-label">After</span>
            <span class="p-stats-val">${wOut}×${hOut} · ~${info.compressedTokens.toLocaleString()}t · ${info.compressedKB}KB</span>
          </div>
          <div class="p-stats-note">
            Same token count — grayscale reduces file size only (~${kbSaved}KB), not LLM vision tokens
          </div>`;
        pillEl.textContent = `${savedPct}% fewer tokens · ~${kbSaved}KB smaller file`;
      } else {
        statsEl.innerHTML = `
          <div class="p-stats-row">
            <span class="p-stats-label">Before</span>
            <span class="p-stats-val">${info.originalW}×${info.originalH} · ~${info.originalTokens.toLocaleString()}t · ${info.originalKB}KB</span>
          </div>
          <div class="p-stats-row">
            <span class="p-stats-label">After</span>
            <span class="p-stats-val">${wOut}×${hOut} · ~${info.compressedTokens.toLocaleString()}t · ${info.compressedKB}KB</span>
          </div>`;
        pillEl.textContent = `Saved ${savedPct}% fewer tokens`;
      }

      insertBtn.disabled = false;
      insertBtn.textContent = 'Insert to chat';
    } else {
      compressedFile = file;
      statsEl.innerHTML = `<div class="p-stats-row"><span class="p-stats-label">File</span><span class="p-stats-val">${Math.round(file.size/1024)} KB</span></div>`;
      pillEl.textContent = 'Ready to insert';
      insertBtn.disabled = false;
      insertBtn.textContent = 'Insert to chat';
    }

    resultEl.classList.add('visible');
  }

  fab.querySelector('#p-insert-btn').addEventListener('click', async () => {
    if (!compressedFile) return;
    const insertBtn = fab.querySelector('#p-insert-btn');
    const statusEl  = fab.querySelector('#p-insert-status');
    insertBtn.disabled = true; insertBtn.textContent = 'Inserting…';

    const strategy = await insertCompressedFile(compressedFile);

    insertBtn.disabled = false; insertBtn.textContent = 'Insert to chat';
    if (strategy === 'download') {
      statusEl.className = 'p-insert-status warn';
      statusEl.textContent = '⚠ Downloaded — upload manually';
    } else {
      statusEl.className = 'p-insert-status ok';
      statusEl.textContent = '✓ Inserted into chat';
    }
  });

  // ── Context tracker ────────────────────────────────────────────────────────
  const AVG_TOKENS_PER_MSG = 500;
  const IMG_TOKENS         = 1700;
  const COST_PER_TOKEN     = 3.0 / 1_000_000;

  function updateContextTracker() {
    const msgCount = getMessageCount();
    const hasImage = hasImageAttachment();

    fab.querySelector('#p-ctx-msgs').textContent   = msgCount || '0';
    const ctxTokens = msgCount * AVG_TOKENS_PER_MSG;
    fab.querySelector('#p-ctx-tokens').textContent = ctxTokens.toLocaleString() + 't';

    const imgRow   = fab.querySelector('#p-ctx-img-row');
    const totalRow = fab.querySelector('#p-ctx-total-row');
    const tipEl    = fab.querySelector('#p-ctx-tip');

    if (hasImage && msgCount > 0) {
      const totalImgTokens = msgCount * IMG_TOKENS;
      const totalCost = ((ctxTokens + totalImgTokens) * COST_PER_TOKEN).toFixed(5);
      imgRow.style.display   = 'flex';
      totalRow.style.display = 'flex';
      fab.querySelector('#p-ctx-img-cost').textContent = `${msgCount}× ${IMG_TOKENS}t = ${totalImgTokens.toLocaleString()}t`;
      fab.querySelector('#p-ctx-total').textContent    = `~$${totalCost}`;
      tipEl.style.display  = 'block';
      tipEl.textContent    = `💡 A complete first prompt saves you paying for this context ${msgCount} more times.`;
    } else {
      imgRow.style.display   = 'none';
      totalRow.style.display = 'none';
      tipEl.style.display    = 'none';
    }

    if (msgCount > 5 && hasImage) warnDot.classList.add('visible');
    else                           warnDot.classList.remove('visible');
  }

  updateContextTracker();

  let ctxPending = false;
  const ctxObserver = new MutationObserver(() => {
    if (ctxPending) return;
    ctxPending = true;
    requestAnimationFrame(() => { ctxPending = false; updateContextTracker(); });
  });
  ctxObserver.observe(document.body, { childList: true, subtree: true });

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

      // Session (today) stats — reset if the stored date is stale
      const todayCount  = s.lastUpdated === today ? (s.sessionOptimizations || 0) : 0;
      const todayTokens = s.lastUpdated === today ? (s.sessionTokensSaved   || 0) : 0;
      const todayCost   = todayTokens * COST_PER_TOKEN_GLOBAL;

      // Mode bars — all 4 modes, even if zero
      const modeUsage = s.modeUsage || {};
      const totalModePresses = Object.values(modeUsage).reduce((a, b) => a + b, 0) || 1;
      const modeRows = [
        { key: 'cost_min',      label: '💰 Cost Min'   },
        { key: 'code_gen',      label: '💻 Code Gen'   },
        { key: 'concise',       label: '⚡ Concise'    },
        { key: 'deep_research', label: '🔬 Deep Research' }
      ]
        .map(({ key, label }) => {
          const count = modeUsage[key] || 0;
          const pct   = Math.round((count / totalModePresses) * 100);
          return `
            <div class="p-st-mode-row">
              <div class="p-st-mode-header">
                <span class="p-st-mode-name">${label}</span>
                <span class="p-st-mode-pct">${pct}%</span>
              </div>
              <div class="p-st-bar-track">
                <div class="p-st-bar-fill" style="width:${pct}%"></div>
              </div>
            </div>`;
        })
        .join('');

      el.innerHTML = `
        <div class="p-st-section">Today</div>
        <div class="p-st-block">
          <div class="p-st-row">
            <span class="p-st-label">Optimizations</span>
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
            <span class="p-st-label">Total optimized</span>
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
        </div>

        <div class="p-st-section">Your Most Used Mode</div>
        <div class="p-st-block">${modeRows}</div>

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

  // Open the panel and switch to Prompt tab
  const panel = fab.querySelector('#promptly-panel');
  panel.classList.add('open');
  fab.querySelectorAll('.p-tab').forEach(t => t.classList.remove('active'));
  fab.querySelectorAll('.p-pane').forEach(p => p.classList.remove('active'));
  fab.querySelector('.p-tab[data-tab="prompt"]').classList.add('active');
  fab.querySelector('#p-pane-prompt').classList.add('active');

  fab._showLoading();

  const { defaultMode = "cost_min" } = await chrome.storage.sync.get("defaultMode");
  const mode = detectMode(prompt, defaultMode);

  chrome.runtime.sendMessage(
    { type: "OPTIMIZE", prompt, mode },
    (resp) => {
      if (chrome.runtime.lastError || !resp) {
        fab._showIdle();
        return;
      }
      if (!resp.ok) {
        fab._showIdle();
        return;
      }
      recordOptimization(resp.tokensBefore, resp.tokensAfter, mode);
      fab._showResult({
        original:     prompt,
        optimized:    resp.optimized,
        explanation:  resp.explanation ?? "",
        tokensBefore: resp.tokensBefore,
        tokensAfter:  resp.tokensAfter,
        onUse: (text) => replacePromptText(text)
      });
    }
  );
}

// ── Init ──────────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createFAB);
} else {
  createFAB();
}

chrome.runtime.onMessage.addListener((msg) => {
  console.log('[Promptly] message received:', msg);
  if (msg.action === "optimize") optimize();
});
