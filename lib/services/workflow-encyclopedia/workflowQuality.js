/**
 * Workflow Encyclopedia — quality scoring.
 *
 * Deterministic 0–100 quality/usefulness score for a workflow as an EXAMPLE:
 * does it have a real trigger, is it connected, is it a meaningful size, does it
 * integrate real systems? Plus flags for trivial / low-quality workflows so the
 * curation pipeline can filter the DB down to the good ones.
 */
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * @param {object} analysis  from analyzeWorkflow()
 * @param {object} [meta]    { name }
 * @returns {{ score, tier, is_trivial, is_low_quality, reasons: string[] }}
 */
export function scoreWorkflowQuality(analysis, meta = {}) {
  const reasons = [];
  if (!analysis) {
    return { score: 0, tier: 'low', is_trivial: true, is_low_quality: true, reasons: ['Unparseable or empty workflow.'] };
  }

  let score = 0;
  const n = analysis.node_count;

  // Trigger (20)
  if (analysis.trigger_type !== 'unknown') score += 20;
  else reasons.push('No identifiable trigger.');

  // Connectivity (20)
  if (analysis.is_connected) score += 20;
  else if (n >= 2) reasons.push('Nodes are not fully connected.');

  // Size sweet-spot (30) — a useful example is neither trivial nor a monster.
  if (n < 2) reasons.push('Too few nodes to be a meaningful example.');
  else if (n <= 3) score += 12;
  else if (n <= 20) score += 30;
  else if (n <= 50) score += 20;
  else { score += 10; reasons.push('Very large — harder to learn from as an example.'); }

  // Real integrations (18) — multi-system workflows are the useful ones.
  const apps = analysis.integration_count ?? 0;
  if (apps >= 2) score += 18;
  else if (apps === 1) score += 9;
  else reasons.push('No third-party integrations (utility-only workflow).');

  // Node-type diversity (7)
  if ((analysis.node_types?.length ?? 0) >= 3) score += 7;

  // Robustness bonus (5)
  if (analysis.has_error_handling) score += 5;

  // Naming (up to a small penalty for junk names)
  const name = String(meta.name || '').trim().toLowerCase();
  if (!name || /^(my workflow|workflow|untitled|test|新規|copy of)/.test(name)) {
    reasons.push('Generic or missing name.');
  }

  score = clamp(score);

  const is_trivial = n < 2 || (apps === 0 && n <= 2);
  const is_low_quality =
    is_trivial ||
    score < 35 ||
    (analysis.trigger_type === 'unknown' && !analysis.is_connected);

  const tier =
    score >= 75 ? 'excellent' :
    score >= 55 ? 'good' :
    score >= 35 ? 'fair' : 'low';

  return { score, tier, is_trivial, is_low_quality, reasons };
}

export default { scoreWorkflowQuality };
