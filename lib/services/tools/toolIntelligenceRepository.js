/**
 * Tool / API / MCP Intelligence — repository.
 *
 * Data access over `tool_intelligence` plus `resolveTool`, which composes the
 * broad tool record with its pricing (from connector_cost_profiles) into a
 * single unified view for the recommendation engine, cost engine, and the
 * Claude Code / MCP export packages.
 */
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../config/db.js';
import {
  AUTH_METHODS, slugify, normalizeTool, noToolResult, aggregateToolRisk,
} from './toolIntelligence.js';
import { resolveConnector } from '../cost/connectorProfileRepository.js';

/** The raw tool record for a name or slug, or null. */
export async function getTool(toolName) {
  const slug = slugify(toolName);
  const [rows] = await pool.query(
    `SELECT * FROM tool_intelligence WHERE tool_name = ? OR slug = ? LIMIT 1`,
    [toolName, slug]
  );
  return rows[0] ? normalizeTool(rows[0]) : null;
}

/**
 * Unified tool view: intelligence + pricing. The honest not-found result when
 * there's no record (never fabricated).
 */
export async function resolveTool(toolName, { platform = null } = {}) {
  const tool = await getTool(toolName);
  if (!tool) return noToolResult(toolName);
  // Compose pricing from the cost registry (Task 5) without duplicating it here.
  const pricing = await resolveConnector(toolName, platform).catch(() => null);
  return {
    found: true,
    ...tool,
    pricing: pricing?.found ? {
      pricing_model: pricing.pricing_model,
      unit_price: pricing.unit_price,
      requires_paid_plan: pricing.requires_paid_plan,
      confidence: pricing.confidence,
    } : null,
  };
}

/** Resolve many tools + an aggregate risk/complexity summary. */
export async function resolveTools(toolNames, { platform = null } = {}) {
  const tools = await Promise.all((toolNames || []).map((n) => resolveTool(n, { platform })));
  return { tools, summary: aggregateToolRisk(tools) };
}

export async function listTools({ category = null } = {}) {
  const where = category ? 'WHERE category = ?' : '';
  const params = category ? [category] : [];
  const [rows] = await pool.query(
    `SELECT * FROM tool_intelligence ${where} ORDER BY tool_name`, params
  );
  return rows.map(normalizeTool);
}

/** Insert/update a tool record (keyed on tool_name). */
export async function upsertTool({
  toolName, slug = null, category = null,
  apiAvailable = null, apiBaseUrl = null, documentationUrl = null,
  authMethod = 'unknown', authNotes = null, rateLimits = null,
  mcpAvailable = null, mcpServer = null, mcpUrl = null,
  pricingModel = null, pricingUrl = null, useCases = null,
  integrationComplexity = 'unknown', securityRisk = 'unknown', securityNotes = null,
  n8nNodeType = null, confidence = 'unknown', lastCheckedAt = null,
}) {
  if (!toolName) throw new Error('[tools] toolName is required');
  if (!AUTH_METHODS.has(authMethod)) throw new Error(`[tools] invalid auth_method '${authMethod}'`);

  const id = uuidv4();
  const bool = (v) => (v == null ? null : v ? 1 : 0);
  await pool.query(
    `INSERT INTO tool_intelligence
       (id, tool_name, slug, category, api_available, api_base_url, documentation_url,
        auth_method, auth_notes, rate_limits, mcp_available, mcp_server, mcp_url,
        pricing_model, pricing_url, use_cases, integration_complexity, security_risk,
        security_notes, n8n_node_type, confidence, last_checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       slug=VALUES(slug), category=VALUES(category), api_available=VALUES(api_available),
       api_base_url=VALUES(api_base_url), documentation_url=VALUES(documentation_url),
       auth_method=VALUES(auth_method), auth_notes=VALUES(auth_notes), rate_limits=VALUES(rate_limits),
       mcp_available=VALUES(mcp_available), mcp_server=VALUES(mcp_server), mcp_url=VALUES(mcp_url),
       pricing_model=VALUES(pricing_model), pricing_url=VALUES(pricing_url), use_cases=VALUES(use_cases),
       integration_complexity=VALUES(integration_complexity), security_risk=VALUES(security_risk),
       security_notes=VALUES(security_notes), n8n_node_type=VALUES(n8n_node_type),
       confidence=VALUES(confidence), last_checked_at=VALUES(last_checked_at)`,
    [id, toolName, slug || slugify(toolName), category, bool(apiAvailable), apiBaseUrl, documentationUrl,
     authMethod, authNotes, rateLimits, bool(mcpAvailable), mcpServer, mcpUrl,
     pricingModel, pricingUrl, useCases == null ? null : JSON.stringify(useCases),
     integrationComplexity, securityRisk, securityNotes, n8nNodeType, confidence, lastCheckedAt || null]
  );
  return { id, toolName };
}

export { noToolResult };
