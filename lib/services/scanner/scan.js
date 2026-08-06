/**
 * Governance & Compliance Scanner — orchestrator (Phase 1).
 * Parse a workflow into the shared model, run every security detector, and
 * return ranked findings + a directional summary.
 */
import { parseN8n } from './n8nParser.js';
import { parseMake } from './makeParser.js';
import { DETECTORS } from './detectors.js';
import { PRIVACY_DETECTORS } from './privacy.js';
import { assessOperationalControls } from './operationalControls.js';
import { mapFrameworks } from './frameworks.js';
import { summarize, rankFindings } from './model.js';

// Security (Phase 1) + Privacy (Phase 2) checks run over the workflow model.
const ALL_DETECTORS = [...DETECTORS, ...PRIVACY_DETECTORS];

// One entry per supported platform; each parser normalizes to WorkflowModel so
// the detectors are shared. (Zapier / Claude-MCP are out of scope per the doc.)
const PARSERS = { n8n: parseN8n, make: parseMake };

export const SUPPORTED_PLATFORMS = Object.keys(PARSERS);

/**
 * @param {{workflow, platform?, blueprint?, versionCount?, owner?}} args
 *  Passing Blueprint context additionally runs the Phase 3 operational-controls
 *  checks (owner/approval/exception/notification/change-control), which read
 *  Blueprint metadata rather than the workflow file.
 */
export function scanWorkflow({ workflow, platform = 'n8n', blueprint = null, versionCount = 1, owner = null } = {}) {
  const parse = PARSERS[platform];
  if (!parse) throw new Error(`Unsupported platform "${platform}". Supported: ${SUPPORTED_PLATFORMS.join(', ')} (Zapier / Claude-MCP are out of scope).`);

  const model = parse(workflow);
  const workflowFindings = ALL_DETECTORS.flatMap((d) => d(model));
  const controlFindings = blueprint ? assessOperationalControls({ blueprint, versionCount, owner }) : [];
  const findings = rankFindings([...workflowFindings, ...controlFindings]);

  return {
    platform: model.platform,
    workflow_name: model.name,
    node_count: model.nodes.length,
    scanned_at: null, // stamped by the caller (no implicit clock here)
    findings,
    summary: summarize(findings),
    framework_mapping: mapFrameworks(findings), // Phase 4 (gap assessment, not certification)
  };
}

export default { scanWorkflow, SUPPORTED_PLATFORMS };
