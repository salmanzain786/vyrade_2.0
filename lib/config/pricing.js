// Token pricing + usage helpers. Cost is computed server-side from the model
// and token counts, so a conversation's spend is authoritative.
//
// RATES are USD per 1,000,000 tokens. UPDATE THESE to your actual/negotiated
// OpenAI rates. You can also override the active model's rate at runtime with
// OPENAI_PRICE_INPUT / OPENAI_PRICE_OUTPUT (USD per 1M) without editing code.
const RATES = {
  'gpt-4o':        { input: 2.50, output: 10.00 },
  'gpt-4o-mini':   { input: 0.15, output: 0.60 },
  'gpt-4.1':       { input: 2.00, output: 8.00 },
  'gpt-4.1-mini':  { input: 0.40, output: 1.60 },
  // Placeholders for the gpt-5 family — adjust to real rates.
  'gpt-5':         { input: 1.25, output: 10.00 },
  'gpt-5-mini':    { input: 0.25, output: 2.00 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
  default:         { input: 0.50, output: 1.50 },
};

function rateFor(model) {
  const envIn = Number(process.env.OPENAI_PRICE_INPUT);
  const envOut = Number(process.env.OPENAI_PRICE_OUTPUT);
  if (Number.isFinite(envIn) && Number.isFinite(envOut)) {
    return { input: envIn, output: envOut };
  }
  return RATES[model] || RATES.default;
}

/** A zeroed usage record. */
export function emptyUsage(model = null) {
  return { model, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

/** Normalize an OpenAI completion (or streaming chunk) `.usage` into our shape. */
export function usageFromCompletion(completion, model) {
  const u = completion?.usage || {};
  const promptTokens = u.prompt_tokens || 0;
  const completionTokens = u.completion_tokens || 0;
  return {
    model: model || completion?.model || null,
    promptTokens,
    completionTokens,
    totalTokens: u.total_tokens || promptTokens + completionTokens,
  };
}

/** Sum two usage records (used to combine multiple LLM calls in one turn). */
export function mergeUsage(a, b) {
  const x = a || emptyUsage();
  const y = b || emptyUsage();
  return {
    model: x.model || y.model || null,
    promptTokens: (x.promptTokens || 0) + (y.promptTokens || 0),
    completionTokens: (x.completionTokens || 0) + (y.completionTokens || 0),
    totalTokens: (x.totalTokens || 0) + (y.totalTokens || 0),
  };
}

/** USD cost of a usage record, from the model's input/output rates. */
export function costForUsage(usage) {
  if (!usage) return 0;
  const { input, output } = rateFor(usage.model);
  const cost =
    ((usage.promptTokens || 0) / 1_000_000) * input +
    ((usage.completionTokens || 0) / 1_000_000) * output;
  // Round to 6 dp (matches the DECIMAL(_,6) columns).
  return Math.round(cost * 1e6) / 1e6;
}
