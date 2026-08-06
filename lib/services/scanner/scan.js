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
import { comparePolicyToWorkflow, detectVersionDrift } from './policyDetectors.js';
import { policyHasConstraints } from './policy.js';
import { mapFrameworks } from './frameworks.js';
import { generateAssessmentReport } from './report.js';
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
export function scanWorkflow({ workflow, platform = 'n8n', blueprint = null, versionCount = 1, owner = null, policy = null, policyAuthored = false, currentVersion = null, workflowVersion = null } = {}) {
  const parse = PARSERS[platform];
  if (!parse) throw new Error(`Unsupported platform "${platform}". Supported: ${SUPPORTED_PLATFORMS.join(', ')} (Zapier / Claude-MCP are out of scope).`);

  const model = parse(workflow);
  const workflowFindings = ALL_DETECTORS.flatMap((d) => d(model));
  const controlFindings = blueprint ? assessOperationalControls({ blueprint, versionCount, owner }) : [];
  // Phase 6 — Blueprint-vs-workflow diff (policy) + version drift.
  const policyFindings = [
    ...comparePolicyToWorkflow({ policy, model, blueprint }),
    ...detectVersionDrift({ workflowVersion, currentVersion }),
  ];
  const findings = rankFindings([...workflowFindings, ...controlFindings, ...policyFindings]);
  const framework_mapping = mapFrameworks(findings); // Phase 4

  return {
    platform: model.platform,
    workflow_name: model.name,
    node_count: model.nodes.length,
    scanned_at: null, // stamped by the caller (no implicit clock here)
    findings,
    summary: summarize(findings),
    framework_mapping,
    // Phase 5 — the customer-facing assessment report over Phases 1–4 (+ 6).
    report: generateAssessmentReport({
      findings, framework_mapping, platform: model.platform,
      workflow_name: model.name, node_count: model.nodes.length,
      blueprintAssessed: !!blueprint,
      policy, policyActive: !!(policy && policy.enabled && policyHasConstraints(policy)),
      policyAuthored, workflowVersion, currentVersion,
    }),
  };
}

/**
 * Scan a Blueprint scan-context (from getScanContextForBlueprint): runs the full
 * workflow scan when a generated workflow exists, else falls back to
 * operational-controls only (Phase 3). One path shared by the API route, the
 * `/compliance/[id]` page, and scan persistence, so all three agree.
 * @param {{workflow, platform, blueprint, versionCount, owner}} ctx
 */
export function scanContext(ctx) {
  if (ctx.workflow) return scanWorkflow(ctx);
  // No generated workflow: run operational controls + the policy checks that
  // don't need a workflow (approvals / alerting / log-retention), against the
  // Blueprint. Version drift needs a workflow origin, so it's skipped here.
  const controlFindings = assessOperationalControls(ctx);
  const policyFindings = comparePolicyToWorkflow({ policy: ctx.policy, model: null, blueprint: ctx.blueprint });
  const findings = rankFindings([...controlFindings, ...policyFindings]);
  const framework_mapping = mapFrameworks(findings);
  return {
    platform: ctx.platform, workflow_name: null, node_count: 0, scanned_at: null,
    findings, summary: summarize(findings), framework_mapping,
    report: generateAssessmentReport({
      findings, framework_mapping, platform: ctx.platform, node_count: 0, blueprintAssessed: true,
      policy: ctx.policy, policyActive: !!(ctx.policy && ctx.policy.enabled && policyHasConstraints(ctx.policy)),
      policyAuthored: ctx.policyAuthored, workflowVersion: null, currentVersion: ctx.currentVersion,
    }),
  };
}

export default { scanWorkflow, scanContext, SUPPORTED_PLATFORMS };
