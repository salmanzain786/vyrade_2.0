/**
 * Platform Capability Database (Task B) — the data layer behind the
 * Recommendation Engine.
 *
 * Two levels:
 *   • PLATFORM_PROFILES  — the platform-level summary (cost model, best-fit use
 *     cases, limitations, reliability) — the "Zapier: good for X, weak for Y".
 *   • CAPABILITY_MATRIX  — platform × capability support, each with:
 *       native_support (full|partial|none), requires_workaround, requires_api,
 *       requires_mcp, complexity (low|medium|high), notes.
 *
 * Kept as structured code data (like platformBillingModels / platformTradeoffs)
 * because capability support is near-static reference data. If it ever needs to
 * be CMS-editable, it can be lifted into a table without changing the query API
 * below — callers only touch the accessors.
 */

export const SUPPORT = { FULL: 'full', PARTIAL: 'partial', NONE: 'none' };

// The capabilities a platform is evaluated on (the matrix columns).
export const CAPABILITIES = {
  visual_building: 'Visual drag-and-drop workflow building',
  complex_branching: 'Multi-path conditional / branching logic',
  high_volume: 'High execution-volume economics',
  ai_reasoning: 'AI / LLM reasoning & generation',
  custom_code: 'Arbitrary custom code / logic',
  self_hosting: 'Self-hosting on own infrastructure',
  api_integration: 'Arbitrary HTTP / API integration',
  prebuilt_connectors: 'Library of prebuilt app connectors',
  mcp_connectors: 'MCP-based tool / data connectors',
  human_approval: 'Human-in-the-loop approval steps',
  error_handling: 'Retries & error-handling branches',
  scheduling: 'Scheduled / cron triggers',
  data_transformation: 'Data mapping & transformation',
};
export const CAPABILITY_KEYS = Object.keys(CAPABILITIES);

export const PLATFORM_PROFILES = {
  zapier: {
    platform: 'zapier', name: 'Zapier',
    cost_model: 'Per-task billing; scales with successful action steps.',
    best_fit_use_cases: ['Simple SaaS-to-SaaS automations', 'Fast setup for non-developers', 'Low-to-moderate volume'],
    limitations: ['Weak for complex branching / multi-path logic', 'Expensive at high volume', 'Limited custom code'],
    reliability_notes: 'Very reliable for standard app triggers/actions; fully managed uptime.',
  },
  make: {
    platform: 'make', name: 'Make.com',
    cost_model: 'Per-operation (credit) billing; scales with module count per run.',
    best_fit_use_cases: ['Visual multi-step scenarios', 'Non-developers', 'Data mapping / transformation'],
    limitations: ['Operations scale with workflow complexity', 'Limited arbitrary custom code'],
    reliability_notes: 'Reliable managed platform; good error routes.',
  },
  n8n: {
    platform: 'n8n', name: 'n8n',
    cost_model: 'Self-hosted: hosting only (unmetered executions). Cloud: per-execution.',
    best_fit_use_cases: ['Complex / API-heavy workflows', 'Cost control at scale', 'Teams comfortable owning some technical setup'],
    limitations: ['Requires more technical ownership (self-hosted)', 'AI not fully native'],
    reliability_notes: 'Reliable; self-hosted reliability depends on your own ops/monitoring.',
  },
  claude: {
    platform: 'claude', name: 'Claude Code + MCP',
    cost_model: 'LLM tokens + infrastructure; no orchestration platform fee.',
    best_fit_use_cases: ['Agentic / AI-heavy workflows', 'Custom or repo-based logic', 'Engineering-capable teams'],
    limitations: ['Less deterministic than visual orchestration', 'Requires engineering + guardrails'],
    reliability_notes: 'Reliability depends on engineering quality and guardrails; less deterministic than visual tools.',
  },
  python: {
    platform: 'python', name: 'Python / custom',
    cost_model: 'Infrastructure + engineering time; no platform fee.',
    best_fit_use_cases: ['Full control', 'Complex logic', 'High volume with an engineering team'],
    limitations: ['You build and maintain everything', 'High maintenance burden', 'No prebuilt connector library'],
    reliability_notes: 'As reliable as you engineer it; full ownership of failure modes.',
  },
};
export const MATRIX_PLATFORMS = Object.keys(PLATFORM_PROFILES);

// Compact record builder. Defaults: full native support, low complexity, no
// workaround/api/mcp requirement.
const r = (native, o = {}) => ({
  native_support: native,
  requires_workaround: !!o.workaround,
  requires_api: !!o.api,
  requires_mcp: !!o.mcp,
  complexity: o.complexity || 'low',
  notes: o.notes || '',
});
const { FULL, PARTIAL, NONE } = SUPPORT;

export const CAPABILITY_MATRIX = {
  zapier: {
    visual_building: r(FULL, { notes: 'Linear Zap builder.' }),
    complex_branching: r(PARTIAL, { workaround: true, complexity: 'high', notes: 'Paths are limited; complex logic gets awkward and can fragment across Zaps.' }),
    high_volume: r(PARTIAL, { complexity: 'high', notes: 'Task billing makes high volume costly.' }),
    ai_reasoning: r(PARTIAL, { api: true, complexity: 'medium', notes: 'Via AI app steps or an HTTP action.' }),
    custom_code: r(PARTIAL, { complexity: 'medium', notes: 'Code by Zapier (JS/Python) with limits.' }),
    self_hosting: r(NONE, { notes: 'SaaS only.' }),
    api_integration: r(FULL, { api: true, complexity: 'medium', notes: 'Webhooks / HTTP action.' }),
    prebuilt_connectors: r(FULL, { notes: 'Very large app directory.' }),
    mcp_connectors: r(NONE),
    human_approval: r(PARTIAL, { workaround: true, complexity: 'medium', notes: 'Delay/approval via email or a third-party.' }),
    error_handling: r(PARTIAL, { complexity: 'medium', notes: 'Auto-retries; limited custom error paths.' }),
    scheduling: r(FULL),
    data_transformation: r(PARTIAL, { complexity: 'medium', notes: 'Formatter steps; heavy transforms need code.' }),
  },
  make: {
    visual_building: r(FULL),
    complex_branching: r(FULL, { complexity: 'medium', notes: 'Routers + filters support multi-path.' }),
    high_volume: r(PARTIAL, { complexity: 'medium', notes: 'Operation billing scales with module count.' }),
    ai_reasoning: r(PARTIAL, { api: true, complexity: 'medium' }),
    custom_code: r(PARTIAL, { complexity: 'medium', notes: 'Limited; some code modules.' }),
    self_hosting: r(NONE),
    api_integration: r(FULL, { api: true }),
    prebuilt_connectors: r(FULL),
    mcp_connectors: r(NONE),
    human_approval: r(PARTIAL, { complexity: 'medium' }),
    error_handling: r(FULL, { complexity: 'medium', notes: 'Error handlers / routes.' }),
    scheduling: r(FULL),
    data_transformation: r(FULL, { complexity: 'medium', notes: 'Strong mapping tools.' }),
  },
  n8n: {
    visual_building: r(FULL),
    complex_branching: r(FULL, { complexity: 'medium', notes: 'IF / Switch / Merge nodes.' }),
    high_volume: r(FULL, { complexity: 'medium', notes: 'Self-hosted executions are unmetered.' }),
    ai_reasoning: r(PARTIAL, { complexity: 'medium', notes: 'LangChain nodes or HTTP to an LLM.' }),
    custom_code: r(FULL, { complexity: 'medium', notes: 'Function / Code nodes (JS/Python).' }),
    self_hosting: r(FULL, { notes: 'Open-source, self-hostable.' }),
    api_integration: r(FULL, { api: true, notes: 'HTTP Request node.' }),
    prebuilt_connectors: r(FULL),
    mcp_connectors: r(PARTIAL, { complexity: 'medium', notes: 'Via community / HTTP; not native MCP.' }),
    human_approval: r(FULL, { complexity: 'medium', notes: 'Wait / approval nodes.' }),
    error_handling: r(FULL, { complexity: 'medium', notes: 'Error workflows + retries.' }),
    scheduling: r(FULL),
    data_transformation: r(FULL),
  },
  claude: {
    visual_building: r(NONE, { notes: 'Code-based, not visual.' }),
    complex_branching: r(FULL, { complexity: 'medium', notes: 'Arbitrary code logic.' }),
    high_volume: r(PARTIAL, { complexity: 'high', notes: 'Depends on infra + LLM cost.' }),
    ai_reasoning: r(FULL, { complexity: 'low', notes: 'Native LLM reasoning / generation.' }),
    custom_code: r(FULL, { complexity: 'low' }),
    self_hosting: r(FULL, { complexity: 'high' }),
    api_integration: r(FULL, { api: true, complexity: 'medium' }),
    prebuilt_connectors: r(PARTIAL, { mcp: true, complexity: 'medium', notes: 'Via MCP connectors.' }),
    mcp_connectors: r(FULL, { mcp: true, notes: 'Native MCP.' }),
    human_approval: r(PARTIAL, { complexity: 'high', notes: 'Must be engineered.' }),
    error_handling: r(PARTIAL, { complexity: 'high', notes: 'Code-level; less deterministic than visual orchestration.' }),
    scheduling: r(PARTIAL, { workaround: true, complexity: 'medium', notes: 'Needs an external scheduler / cron.' }),
    data_transformation: r(FULL, { complexity: 'low' }),
  },
  python: {
    visual_building: r(NONE),
    complex_branching: r(FULL, { complexity: 'medium' }),
    high_volume: r(FULL, { complexity: 'high', notes: 'Efficient, but you build the scaling.' }),
    ai_reasoning: r(PARTIAL, { api: true, complexity: 'medium', notes: 'Via LLM SDKs.' }),
    custom_code: r(FULL, { complexity: 'low' }),
    self_hosting: r(FULL, { complexity: 'high' }),
    api_integration: r(FULL, { api: true, complexity: 'medium' }),
    prebuilt_connectors: r(NONE, { workaround: true, complexity: 'high', notes: 'Build each integration yourself.' }),
    mcp_connectors: r(PARTIAL, { mcp: true, complexity: 'high' }),
    human_approval: r(PARTIAL, { complexity: 'high', notes: 'Build the UI / flow yourself.' }),
    error_handling: r(FULL, { complexity: 'medium' }),
    scheduling: r(FULL, { complexity: 'medium', notes: 'cron / scheduler.' }),
    data_transformation: r(FULL, { complexity: 'low' }),
  },
};

// ── Query API ───────────────────────────────────────────────────────────────

export function getPlatformProfile(platform) {
  return PLATFORM_PROFILES[platform] || null;
}

/** One (platform, capability) record, or a safe 'unknown' record. */
export function getCapability(platform, capability) {
  const rec = CAPABILITY_MATRIX[platform]?.[capability];
  if (!rec) return { native_support: 'unknown', requires_workaround: false, requires_api: false, requires_mcp: false, complexity: 'unknown', notes: '' };
  return rec;
}

/** Every capability record for a platform. */
export function getPlatformCapabilities(platform) {
  return CAPABILITY_MATRIX[platform] || null;
}

/** Platforms that support a capability at or above a minimum level. */
export function platformsSupporting(capability, { min = SUPPORT.PARTIAL } = {}) {
  const order = { none: 0, partial: 1, full: 2 };
  const floor = order[min] ?? 1;
  return MATRIX_PLATFORMS.filter((p) => (order[getCapability(p, capability).native_support] ?? -1) >= floor);
}

/** One capability across all platforms — for side-by-side comparison in the UI. */
export function capabilityComparison(capability) {
  return MATRIX_PLATFORMS.map((p) => ({ platform: p, name: PLATFORM_PROFILES[p].name, ...getCapability(p, capability) }));
}

/**
 * Concrete capability facts for the Recommendation Engine to cite, given the
 * signals that actually apply to this Blueprint (branching, AI, volume, …).
 * Turns "Zapier is weaker" into "Complex branching: partial, needs a workaround".
 */
export function capabilityHighlights(platform, sig) {
  const notes = [];
  const say = (capKey) => {
    const rec = getCapability(platform, capKey);
    if (rec.native_support === 'unknown') return;
    const label = CAPABILITIES[capKey];
    const via = rec.requires_mcp ? ', via MCP' : rec.requires_api ? ', via API' : '';
    const wk = rec.requires_workaround ? ', needs a workaround' : '';
    if (rec.native_support === SUPPORT.NONE) notes.push(`${label}: not natively supported${wk || via}.`);
    else if (rec.native_support === SUPPORT.PARTIAL) notes.push(`${label}: partial support${wk}${via}.`);
    else notes.push(`${label}: native support.`);
  };
  if (sig?.has_complex_branching) say('complex_branching');
  if (sig?.ai_required) say('ai_reasoning');
  if (sig?.volume_tier === 'high') say('high_volume');
  if (sig?.hosting_preference === 'self_hosted') say('self_hosting');
  if (sig?.human_approval) say('human_approval');
  return notes;
}

export default {
  SUPPORT, CAPABILITIES, CAPABILITY_KEYS, PLATFORM_PROFILES, MATRIX_PLATFORMS,
  CAPABILITY_MATRIX, getPlatformProfile, getCapability, getPlatformCapabilities,
  platformsSupporting, capabilityComparison,
};
