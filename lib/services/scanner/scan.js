/**
 * Governance & Compliance Scanner — orchestrator (Phase 1).
 * Parse a workflow into the shared model, run every security detector, and
 * return ranked findings + a directional summary.
 */
import { parseN8n } from './n8nParser.js';
import { parseMake } from './makeParser.js';
import { DETECTORS } from './detectors.js';
import { PRIVACY_DETECTORS } from './privacy.js';
import { summarize, rankFindings } from './model.js';

// Security (Phase 1) + Privacy (Phase 2) checks run over the same model.
const ALL_DETECTORS = [...DETECTORS, ...PRIVACY_DETECTORS];

// One entry per supported platform; each parser normalizes to WorkflowModel so
// the detectors are shared. (Zapier / Claude-MCP are out of scope per the doc.)
const PARSERS = { n8n: parseN8n, make: parseMake };

export const SUPPORTED_PLATFORMS = Object.keys(PARSERS);

export function scanWorkflow({ workflow, platform = 'n8n' } = {}) {
  const parse = PARSERS[platform];
  if (!parse) throw new Error(`Unsupported platform "${platform}". Supported: ${SUPPORTED_PLATFORMS.join(', ')} (Zapier / Claude-MCP are out of scope).`);

  const model = parse(workflow);
  const findings = rankFindings(ALL_DETECTORS.flatMap((d) => d(model)));

  return {
    platform: model.platform,
    workflow_name: model.name,
    node_count: model.nodes.length,
    scanned_at: null, // stamped by the caller (no implicit clock here)
    findings,
    summary: summarize(findings),
  };
}

export default { scanWorkflow, SUPPORTED_PLATFORMS };
