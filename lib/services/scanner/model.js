/**
 * Governance & Compliance Scanner — shared model (Phase 1).
 *
 * BOTH the n8n parser (1.1) and the future Make parser (1.2) normalize their
 * very different formats into this ONE model, so every detector is written once
 * against a platform-neutral shape. Findings carry a stable `type` slug so later
 * phases (framework mapping, report) can consume them without re-parsing.
 */

export const SEVERITY = { CRITICAL: 'critical', HIGH: 'high', MEDIUM: 'medium', LOW: 'low', INFO: 'info' };
const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

/**
 * @typedef {Object} ScanNode
 * @property {string} id
 * @property {string} name
 * @property {string} type        raw platform type (e.g. n8n-nodes-base.webhook)
 * @property {string} shortType   vendor-stripped (e.g. webhook)
 * @property {string|null} app    integration app, or null for utility nodes
 * @property {boolean} isTrigger
 * @property {boolean} isWebhook
 * @property {boolean} isHttp
 * @property {boolean} isAI
 * @property {boolean} isBrowser
 * @property {object} parameters
 * @property {object} credentials
 */

/**
 * @typedef {Object} WorkflowModel
 * @property {string} platform            'n8n' | 'make'
 * @property {string} name
 * @property {ScanNode[]} nodes
 * @property {{from:string,to:string}[]} connections
 * @property {string[]} triggerIds
 * @property {boolean} hasErrorHandling
 * @property {object} raw
 */

/** Build a finding. `type` is a stable slug used by later phases. */
export function finding({ type, severity, title, detail, node = null, remediation = null, manualReview = false }) {
  return { type, severity, title, detail, node, remediation, manual_review: !!manualReview };
}

/**
 * Roll findings into a directional summary. Deliberately conservative: the
 * risk level is driven by the single worst finding, and we never claim more
 * precision than we have (matches the spec's "gap assessment, not certification").
 */
export function summarize(findings) {
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;

  const worst = findings.reduce((w, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[w] ? f.severity : w), 'info');
  const risk_level = bySeverity.critical > 0 || bySeverity.high > 0 ? 'High'
    : bySeverity.medium > 0 ? 'Medium'
      : 'Low';

  return {
    total: findings.length,
    by_severity: bySeverity,
    worst_severity: findings.length ? worst : null,
    risk_level,
    manual_review_count: findings.filter((f) => f.manual_review).length,
  };
}

/** Sort findings most-severe first (stable within a severity). */
export function rankFindings(findings) {
  return [...findings].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}
