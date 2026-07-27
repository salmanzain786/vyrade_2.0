/**
 * Tool / API / MCP Intelligence (Task D) — pure governance + shaping.
 *
 * The broad knowledge layer about a tool: API/MCP availability, auth method,
 * rate limits, docs, use cases, integration complexity, and security risk.
 * Pricing lives in connector_cost_profiles (Task 5) and is composed in by the
 * repository — this module is DB-free and testable.
 *
 * Honesty rule (shared with the rest of the engine): unknown fields stay
 * `unknown`/null, never guessed.
 */

export const AUTH_METHODS = new Set([
  'api_key', 'oauth2', 'oauth1', 'basic', 'bearer', 'token', 'jwt', 'none', 'unknown',
]);
export const COMPLEXITY_LEVELS = new Set(['low', 'medium', 'high', 'unknown']);
export const RISK_LEVELS = new Set(['low', 'medium', 'high', 'unknown']);

const RANK = { unknown: 0, low: 1, medium: 2, high: 3 };
const byRank = (r) => Object.keys(RANK).find((k) => RANK[k] === r) || 'unknown';

const asBool = (v) => (v == null ? null : !!Number(v));
const asJson = (v) => {
  if (v == null) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return v;
};

export function slugify(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim() || null;
}

const camel = (r, snake, cml) => r[snake] ?? r[cml];

/** Normalise a DB row (snake or camel) into a typed tool-intelligence object. */
export function normalizeTool(row) {
  if (!row) return null;
  return {
    tool_name: camel(row, 'tool_name', 'toolName'),
    slug: row.slug ?? slugify(camel(row, 'tool_name', 'toolName')),
    category: row.category ?? null,
    api_available: asBool(camel(row, 'api_available', 'apiAvailable')),
    api_base_url: camel(row, 'api_base_url', 'apiBaseUrl') ?? null,
    documentation_url: camel(row, 'documentation_url', 'documentationUrl') ?? null,
    auth_method: camel(row, 'auth_method', 'authMethod') || 'unknown',
    auth_notes: camel(row, 'auth_notes', 'authNotes') ?? null,
    rate_limits: camel(row, 'rate_limits', 'rateLimits') ?? null,
    mcp_available: asBool(camel(row, 'mcp_available', 'mcpAvailable')),
    mcp_server: camel(row, 'mcp_server', 'mcpServer') ?? null,
    mcp_url: camel(row, 'mcp_url', 'mcpUrl') ?? null,
    pricing_model: camel(row, 'pricing_model', 'pricingModel') ?? null,
    pricing_url: camel(row, 'pricing_url', 'pricingUrl') ?? null,
    use_cases: asJson(camel(row, 'use_cases', 'useCases')) || [],
    integration_complexity: camel(row, 'integration_complexity', 'integrationComplexity') || 'unknown',
    security_risk: camel(row, 'security_risk', 'securityRisk') || 'unknown',
    security_notes: camel(row, 'security_notes', 'securityNotes') ?? null,
    n8n_node_type: camel(row, 'n8n_node_type', 'n8nNodeType') ?? null,
    confidence: row.confidence || 'unknown',
    last_checked_at: camel(row, 'last_checked_at', 'lastCheckedAt') ?? null,
  };
}

/** The honest "no record" result. */
export function noToolResult(toolName = null) {
  return {
    found: false,
    tool_name: toolName,
    auth_method: 'unknown',
    api_available: null,
    mcp_available: null,
    integration_complexity: 'unknown',
    security_risk: 'unknown',
    reason: `No tool-intelligence record for '${toolName ?? 'this tool'}'.`,
  };
}

/**
 * Aggregate risk/complexity across a set of resolved tools — the signal the
 * Recommendation Engine and export packages care about ("does this automation
 * touch anything high-risk / hard to integrate?").
 */
export function aggregateToolRisk(tools) {
  let sec = 0, cx = 0;
  let known = 0;
  const unresolved = [];
  const mcpMissing = [];
  for (const t of tools || []) {
    if (!t || t.found === false) { if (t?.tool_name) unresolved.push(t.tool_name); continue; }
    known += 1;
    sec = Math.max(sec, RANK[t.security_risk] ?? 0);
    cx = Math.max(cx, RANK[t.integration_complexity] ?? 0);
    if (t.mcp_available === false) mcpMissing.push(t.tool_name);
  }
  return {
    max_security_risk: byRank(sec),
    max_integration_complexity: byRank(cx),
    known_tools: known,
    unresolved_tools: unresolved,           // no intelligence on file → a gap
    mcp_unavailable: mcpMissing,            // matters for the Claude/MCP package
  };
}

export default {
  AUTH_METHODS, COMPLEXITY_LEVELS, RISK_LEVELS,
  slugify, normalizeTool, noToolResult, aggregateToolRisk,
};
