/**
 * Governance & Compliance Scanner — orchestrator (Phase 1).
 * Parse a workflow into the shared model, run every security detector, and
 * return ranked findings + a directional summary.
 */
import { parseN8n } from './n8nParser.js';
import { DETECTORS } from './detectors.js';
import { summarize, rankFindings } from './model.js';

// Make (1.2) registers here once its parser exists — no other change needed.
const PARSERS = { n8n: parseN8n };

export const SUPPORTED_PLATFORMS = Object.keys(PARSERS);

export function scanWorkflow({ workflow, platform = 'n8n' } = {}) {
  const parse = PARSERS[platform];
  if (!parse) throw new Error(`Unsupported platform "${platform}". Phase 1 supports: ${SUPPORTED_PLATFORMS.join(', ')} (Make is milestone 1.2).`);

  const model = parse(workflow);
  const findings = rankFindings(DETECTORS.flatMap((d) => d(model)));

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
