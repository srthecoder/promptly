// pricing.js
// Single source of truth for all LLM pricing
// Sources verified June 27 2026:
//   Anthropic: platform.claude.com/docs/en/about-claude/pricing
//   OpenAI:    openai.com/api/pricing
//   Google:    ai.google.dev/gemini-api/docs/pricing
// Update this file when providers change prices.
// last_updated field shows users when data was verified.

const _global = typeof window !== 'undefined' ? window : self;
if (_global.__promptlyPricingLoaded) throw new Error('pricing.js already loaded');
_global.__promptlyPricingLoaded = true;

var PRICING_CONFIG = typeof PRICING_CONFIG !== 'undefined' ? PRICING_CONFIG : {
  last_updated: "2026-06-27",
  source_urls: {
    anthropic: "https://www.anthropic.com/pricing",
    openai:    "https://openai.com/api/pricing",
    google:    "https://ai.google.dev/gemini-api/docs/pricing"
  },

  image_token_formula: {
    anthropic: {
      // Source: docs.anthropic.com/en/docs/vision
      // (width * height) / 750
      formula: "width_x_height_div_750"
    },
    openai: {
      // Source: platform.openai.com/docs/guides/vision
      // detail:high = 85 base + 170 per 512x512 tile
      // detail:low  = flat 85 tokens
      formula:         "tiles_based",
      base_tokens:     85,
      tokens_per_tile: 170,
      tile_size:       512
    },
    google: {
      // Source: ai.google.dev/gemini-api/docs/vision
      // Flat 258 tokens per image regardless of resolution
      formula:          "flat_rate",
      tokens_per_image: 258
    }
  },

  pdf_token_formula: {
    // Anthropic/OpenAI: text estimate ~1500 tokens/page
    // Google: PDFs billed as images — 258 tokens/page
    anthropic: { tokens_per_page: 1500 },
    openai:    { tokens_per_page: 1500 },
    google:    { tokens_per_page: 258 }
  },

  models: {

    // ── ANTHROPIC ─────────────────────────────────
    // Verified: platform.claude.com/docs pricing page
    // June 2026

    "claude-fable-5": {
      provider:       "anthropic",
      display:        "Claude Fable 5",
      input_per_1m:   10.00,
      output_per_1m:  50.00,
      image_support:  true,
      pdf_support:    true,
      context_window: "1M"
    },
    "claude-opus-4-8": {
      provider:       "anthropic",
      display:        "Claude Opus 4.8",
      input_per_1m:   5.00,
      output_per_1m:  25.00,
      image_support:  true,
      pdf_support:    true,
      context_window: "1M"
    },
    "claude-opus-4-7": {
      provider:       "anthropic",
      display:        "Claude Opus 4.7",
      input_per_1m:   5.00,
      output_per_1m:  25.00,
      image_support:  true,
      pdf_support:    true,
      context_window: "1M"
    },
    "claude-sonnet-4-6": {
      provider:       "anthropic",
      display:        "Claude Sonnet 4.6",
      input_per_1m:   3.00,
      output_per_1m:  15.00,
      image_support:  true,
      pdf_support:    true,
      context_window: "1M"
    },
    "claude-haiku-4-5": {
      provider:       "anthropic",
      display:        "Claude Haiku 4.5",
      input_per_1m:   1.00,
      output_per_1m:  5.00,
      image_support:  true,
      pdf_support:    true,
      context_window: "200K"
    },

    // ── OPENAI ────────────────────────────────────
    // Verified: openai.com/api/pricing
    // June 2026
    // Note: o3 and o4-mini output includes hidden
    // reasoning tokens billed as output

    "gpt-5-5": {
      provider:       "openai",
      display:        "GPT-5.5",
      input_per_1m:   5.00,
      output_per_1m:  30.00,
      image_support:  true,
      pdf_support:    false,
      context_window: "1M"
    },
    "gpt-5-4": {
      provider:       "openai",
      display:        "GPT-5.4",
      input_per_1m:   2.50,
      output_per_1m:  15.00,
      image_support:  true,
      pdf_support:    false,
      context_window: "1M"
    },
    "gpt-4o": {
      provider:       "openai",
      display:        "GPT-4o",
      input_per_1m:   2.50,
      output_per_1m:  10.00,
      image_support:  true,
      pdf_support:    false,
      context_window: "128K"
    },
    "gpt-4o-mini": {
      provider:       "openai",
      display:        "GPT-4o mini",
      input_per_1m:   0.15,
      output_per_1m:  0.60,
      image_support:  true,
      pdf_support:    false,
      context_window: "128K"
    },
    "gpt-4-1": {
      provider:       "openai",
      display:        "GPT-4.1",
      input_per_1m:   2.00,
      output_per_1m:  8.00,
      image_support:  true,
      pdf_support:    false,
      context_window: "1M"
    },
    "gpt-4-1-mini": {
      provider:       "openai",
      display:        "GPT-4.1 mini",
      input_per_1m:   0.40,
      output_per_1m:  1.60,
      image_support:  true,
      pdf_support:    false,
      context_window: "1M"
    },
    "gpt-4-1-nano": {
      provider:       "openai",
      display:        "GPT-4.1 nano",
      input_per_1m:   0.10,
      output_per_1m:  0.40,
      image_support:  false,
      pdf_support:    false,
      context_window: "1M"
    },
    "o3": {
      provider:       "openai",
      display:        "o3",
      input_per_1m:   2.00,
      output_per_1m:  8.00,
      image_support:  true,
      pdf_support:    false,
      context_window: "200K",
      note:           "Output tokens include hidden reasoning tokens"
    },
    "o4-mini": {
      provider:       "openai",
      display:        "o4-mini",
      input_per_1m:   1.10,
      output_per_1m:  4.40,
      image_support:  true,
      pdf_support:    false,
      context_window: "200K",
      note:           "Output tokens include hidden reasoning tokens"
    },

    // ── GOOGLE GEMINI ─────────────────────────────
    // Verified: ai.google.dev/gemini-api/docs/pricing
    // June 2026
    // IMPORTANT: Gemini 2.0 Flash SHUT DOWN June 1 2026
    // Gemini 3.1 Pro above 200K context:
    //   input rises to $4.00, output to $18.00 per 1M

    "gemini-3-5-flash": {
      provider:       "google",
      display:        "Gemini 3.5 Flash",
      input_per_1m:   1.50,
      output_per_1m:  9.00,
      image_support:  true,
      pdf_support:    true,
      context_window: "1M",
      note:           "Default on Gemini as of May 19 2026"
    },
    "gemini-3-1-pro": {
      provider:       "google",
      display:        "Gemini 3.1 Pro",
      input_per_1m:   2.00,
      output_per_1m:  12.00,
      image_support:  true,
      pdf_support:    true,
      context_window: "2M",
      note:           "Above 200K context: $4.00/$18.00 per 1M"
    },
    "gemini-3-1-flash-lite": {
      provider:       "google",
      display:        "Gemini 3.1 Flash-Lite",
      input_per_1m:   0.25,
      output_per_1m:  1.50,
      image_support:  true,
      pdf_support:    true,
      context_window: "1M"
    },
    "gemini-2-5-pro": {
      provider:       "google",
      display:        "Gemini 2.5 Pro",
      input_per_1m:   1.25,
      output_per_1m:  10.00,
      image_support:  true,
      pdf_support:    true,
      context_window: "1M",
      note:           "Above 200K context: $2.50/$15.00 per 1M"
    },
    "gemini-2-5-flash": {
      provider:       "google",
      display:        "Gemini 2.5 Flash",
      input_per_1m:   0.30,
      output_per_1m:  2.50,
      image_support:  true,
      pdf_support:    true,
      context_window: "1M"
    },
    "gemini-2-5-flash-lite": {
      provider:       "google",
      display:        "Gemini 2.5 Flash-Lite",
      input_per_1m:   0.10,
      output_per_1m:  0.40,
      image_support:  true,
      pdf_support:    true,
      context_window: "1M"
    }
  },

  // ── DOM SELECTORS FOR MODEL DETECTION ─────────
  // These scrape which model the user has selected.
  // Falls back to platform default if selector fails.
  // Update selectors when platform UIs change.

  MODEL_SELECTORS: {
    "claude.ai": {
      selectors: [
        '[data-testid="model-selector-button"]',
        'button[aria-label*="Claude"]',
        '.model-selector'
      ],
      name_map: {
        "fable":  "claude-fable-5",
        "opus":   "claude-opus-4-8",
        "sonnet": "claude-sonnet-4-6",
        "haiku":  "claude-haiku-4-5"
      },
      default: "claude-sonnet-4-6"
    },
    "chatgpt.com": {
      selectors: [
        '[data-testid="model-switcher-dropdown-button"]',
        'button[aria-haspopup="menu"]'
      ],
      name_map: {
        "gpt-5.5":      "gpt-5-5",
        "gpt-5.4":      "gpt-5-4",
        "gpt-4o mini":  "gpt-4o-mini",
        "gpt-4o":       "gpt-4o",
        "gpt-4.1 mini": "gpt-4-1-mini",
        "gpt-4.1 nano": "gpt-4-1-nano",
        "gpt-4.1":      "gpt-4-1",
        "o4-mini":      "o4-mini",
        "o3":           "o3"
      },
      default: "gpt-4o"
    },
    "gemini.google.com": {
      selectors: [
        '[data-model-id]',
        'div[aria-label*="Gemini"]',
        '.model-selector-container'
      ],
      name_map: {
        "3.5 flash":      "gemini-3-5-flash",
        "3.1 pro":        "gemini-3-1-pro",
        "3.1 flash-lite": "gemini-3-1-flash-lite",
        "2.5 pro":        "gemini-2-5-pro",
        "2.5 flash-lite": "gemini-2-5-flash-lite",
        "2.5 flash":      "gemini-2-5-flash"
      },
      default: "gemini-3-5-flash"
    }
  }
};

// ── CALCULATION FUNCTIONS ──────────────────────────────────────────────────────
// Pure functions — no side effects.
// Used by both background.js (via importScripts) and content.js / overlay.js.

function calculateImageTokens(width, height, provider) {
  const formula = PRICING_CONFIG.image_token_formula[provider];
  if (!formula) return 1000;

  if (formula.formula === "width_x_height_div_750") {
    return Math.ceil((width * height) / 750);
  }
  if (formula.formula === "tiles_based") {
    const tiles_x = Math.ceil(width / formula.tile_size);
    const tiles_y = Math.ceil(height / formula.tile_size);
    return formula.base_tokens + (tiles_x * tiles_y * formula.tokens_per_tile);
  }
  if (formula.formula === "flat_rate") {
    return formula.tokens_per_image;
  }
  return 1000;
}

function calculatePDFTokens(page_count, provider) {
  const formula = PRICING_CONFIG.pdf_token_formula[provider];
  if (!formula) return page_count * 1500;
  return page_count * formula.tokens_per_page;
}

function costInDollars(tokens, price_per_million) {
  return (tokens / 1_000_000) * price_per_million;
}

function formatCost(dollars) {
  if (dollars === 0)       return "$0.00";
  if (dollars < 0.000001) return "<$0.000001";
  if (dollars < 0.001)    return `$${dollars.toFixed(6)}`;
  if (dollars < 0.01)     return `$${dollars.toFixed(5)}`;
  if (dollars < 1)        return `$${dollars.toFixed(4)}`;
  return `$${dollars.toFixed(2)}`;
}

function getCostBreakdown({
  model_key,
  input_tokens,
  output_tokens,
  images = [],
  pdf_pages = 0
}) {
  const model = PRICING_CONFIG.models[model_key];
  if (!model) return null;

  const provider = model.provider;

  const image_tokens = images.reduce((sum, img) => {
    return sum + calculateImageTokens(img.width, img.height, provider);
  }, 0);

  const pdf_tokens  = calculatePDFTokens(pdf_pages, provider);
  const total_input = input_tokens + image_tokens + pdf_tokens;

  const text_cost   = costInDollars(input_tokens,  model.input_per_1m);
  const image_cost  = costInDollars(image_tokens,  model.input_per_1m);
  const pdf_cost    = costInDollars(pdf_tokens,    model.input_per_1m);
  const output_cost = costInDollars(output_tokens, model.output_per_1m);
  const total_cost  = text_cost + image_cost + pdf_cost + output_cost;

  return {
    model:           model.display,
    provider,
    pricing_source:  PRICING_CONFIG.source_urls[provider],
    pricing_updated: PRICING_CONFIG.last_updated,
    note:            model.note || null,

    tokens: {
      text_input:  input_tokens,
      image:       image_tokens,
      pdf:         pdf_tokens,
      total_input,
      output:      output_tokens
    },

    rates: {
      input_per_1m:  `$${model.input_per_1m.toFixed(2)}`,
      output_per_1m: `$${model.output_per_1m.toFixed(2)}`
    },

    costs: {
      text_input: formatCost(text_cost),
      image:      image_cost > 0 ? formatCost(image_cost) : null,
      pdf:        pdf_cost   > 0 ? formatCost(pdf_cost)   : null,
      output:     formatCost(output_cost),
      total:      formatCost(total_cost)
    },

    image_count: images.length,
    pdf_pages
  };
}

function detectModel(hostname) {
  const platformKey = Object.keys(PRICING_CONFIG.MODEL_SELECTORS)
    .find(k => hostname.includes(k));
  if (!platformKey) return null;

  const config = PRICING_CONFIG.MODEL_SELECTORS[platformKey];

  for (const selector of config.selectors) {
    const el = document.querySelector(selector);
    if (el) {
      const text = (
        el.textContent ||
        el.getAttribute("aria-label") ||
        el.getAttribute("data-model-id") ||
        ""
      ).toLowerCase();

      for (const [keyword, model_key] of Object.entries(config.name_map)) {
        if (text.includes(keyword.toLowerCase())) {
          return model_key;
        }
      }
    }
  }

  return config.default;
}

function getAttachmentInfo() {
  const images = [];
  const imgEls = document.querySelectorAll(
    '[data-testid*="attachment"] img, ' +
    '.attachment img, ' +
    '.uploaded-image img, ' +
    '[class*="attachment"] img'
  );
  imgEls.forEach(img => {
    if (img.naturalWidth && img.naturalHeight) {
      images.push({ width: img.naturalWidth, height: img.naturalHeight });
    }
  });

  const pdfEls = document.querySelectorAll(
    '[data-testid*="pdf"], .pdf-attachment, [class*="pdf"]'
  );
  // Estimate 10 pages per PDF attachment
  const pdf_pages = pdfEls.length * 10;

  return { images, pdf_pages };
}

// ── COST SECTION RENDERER ──────────────────────────────────────────────────────
// Defined here so it is available in both content.js (FAB panel) and overlay.js.
// escapes HTML inline to avoid depending on overlay.js helpers.

function _escHtmlPricing(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderCostSection(cost_data) {
  if (!cost_data) {
    return `
      <div class="p-cost-section p-cost-unknown">
        💰 Select a model in the platform UI to see cost
      </div>`;
  }

  const { model, costs, rates, pricing_source, pricing_updated } = cost_data;

  return `
    <div class="p-cost-section">
      <div class="p-cost-header">💰 Cost Estimate</div>
      <div class="p-cost-model">${_escHtmlPricing(model)}</div>
      <div class="p-cost-row p-cost-total">
        <span>Total</span>
        <span>${costs.total}</span>
      </div>
      <div class="p-cost-rates">
        ${rates.input_per_1m} in / ${rates.output_per_1m} out per 1M tokens
      </div>
      <div class="p-cost-source">
        <a href="${_escHtmlPricing(pricing_source)}" target="_blank">Official pricing ↗</a>
        · Updated ${_escHtmlPricing(pricing_updated)}
      </div>
    </div>`;
}
