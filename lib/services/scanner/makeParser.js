/**
 * Make.com scenario parser (Phase 1, milestone 1.2).
 *
 * Vyrade does NOT export importable Make scenarios (makeExporter emits a
 * markdown guide, not a file), so this is UPLOAD-ONLY: the user brings a Make
 * "Export Blueprint" JSON. Make's format is entirely different from n8n's —
 * a `flow` of `module`s ("app:Action"), routers with nested `routes[].flow`,
 * `mapper` for field mappings, numeric connection ids — so this is genuinely
 * separate parsing work that normalizes into the SAME WorkflowModel, letting all
 * four existing detectors apply unchanged.
 */

// Module app prefixes that are utilities/plumbing, not third-party integrations.
const UTILITY_APPS = new Set(['gateway', 'builtin', 'util', 'json', 'flow', 'tools', 'regexp', 'math', 'array', 'datastore']);
const AI_RE = /openai|gpt|anthropic|claude|cohere|mistral|huggingface|gemini|\bai\b|vertex/i;
const BROWSER_RE = /apify|puppeteer|playwright|browserless|selenium|\bbrowser\b/i;

function classify(mod, isFirst) {
  const module = mod?.module || '';
  const [app, action] = module.split(':');
  const short = action || app || module || 'module';
  const name = mod?.metadata?.designer?.name || mod?.label || short;
  const isHttp = /^http:/i.test(module);
  return {
    id: String(mod?.id ?? name),
    name,
    type: module,
    shortType: short,
    app: app && !UTILITY_APPS.has(app) && !isHttp ? app : null,
    isTrigger: isFirst || /webhook|instanttrigger|watch|trigger/i.test(module),
    isWebhook: /gateway:customwebhook|webhook/i.test(module),
    isHttp,
    isAI: AI_RE.test(app || module),
    isBrowser: BROWSER_RE.test(module),
    // Detectors scan `parameters`; Make splits config across parameters +
    // mapper (mapper holds URLs/expressions/secrets), so merge both.
    parameters: { ...(mod?.parameters || {}), ...(mod?.mapper || {}) },
    // Make connections are numeric ids; the account name isn't in the export,
    // so personal-credential detection is limited on Make (upload-only).
    credentials: {},
    retryOnFail: false,
    maxTries: null,
  };
}

// Flatten Make's nested flow (routers + error handlers) into a flat node list,
// building directional edges as we go.
function flatten(flow, ctx, prevId, isTopLevel) {
  if (!Array.isArray(flow)) return;
  let prev = prevId;
  flow.forEach((mod, i) => {
    const node = classify(mod, isTopLevel && i === 0);
    ctx.nodes.push(node);
    if (prev) ctx.edges.push({ from: prev, to: node.id });
    prev = node.id;

    if (Array.isArray(mod?.routes)) {
      for (const route of mod.routes) flatten(route?.flow, ctx, node.id, false);
    }
    if (Array.isArray(mod?.onerror) && mod.onerror.length) {
      ctx.hasErrorHandling = true;
      flatten(mod.onerror, ctx, node.id, false);
    }
  });
}

/** @returns {import('./model.js').WorkflowModel} */
export function parseMake(scenarioJson) {
  const wf = typeof scenarioJson === 'string' ? safeParse(scenarioJson) : scenarioJson;
  if (!wf || typeof wf !== 'object' || !Array.isArray(wf.flow)) {
    throw new Error('Invalid Make scenario JSON (expected a { flow: [...] } blueprint export)');
  }

  const ctx = { nodes: [], edges: [], hasErrorHandling: false };
  flatten(wf.flow, ctx, null, true);

  return {
    platform: 'make',
    name: wf.name || 'Untitled scenario',
    nodes: ctx.nodes,
    connections: ctx.edges,
    triggerIds: ctx.nodes.filter((n) => n.isTrigger).map((n) => n.id),
    hasErrorHandling: ctx.hasErrorHandling,
    raw: wf,
  };
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
