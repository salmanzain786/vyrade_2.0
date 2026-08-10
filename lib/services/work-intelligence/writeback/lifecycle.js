/**
 * Blueprint lifecycle stages for write-back (Work Intelligence, Phase 4.2).
 * The spec's own list, derived from Vyrade's EXISTING signals (blueprint status,
 * recommendation, cost, generated workflow, governance scan, implementation) —
 * no new lifecycle tracking, just a projection of state we already have.
 */
export const LIFECYCLE_STAGES = [
  { key: 'clarification_required', label: 'Blueprint clarification required' },
  { key: 'requirements_complete', label: 'Requirements completed' },
  { key: 'architecture_review', label: 'Architecture review' },
  { key: 'cost_model_ready', label: 'Cost model ready' },
  { key: 'implementation_prepared', label: 'Implementation package generated' },
  { key: 'security_assessment', label: 'Security assessment' },
  { key: 'testing', label: 'Testing in progress' },
  { key: 'deployment_approval', label: 'Deployment approval pending' },
  { key: 'workflow_active', label: 'Workflow active' },
  { key: 'outcome_review', label: 'Outcome review due' },
];

/**
 * Map current Blueprint state → the furthest lifecycle stage reached.
 * @param {{blueprintStatus, hasRecommendation, hasCost, hasWorkflow, importPassed, govScanned, implemented, active, measured}} s
 */
export function deriveLifecycleStage(s = {}) {
  let idx = 0; // clarification_required (default: a fresh Blueprint)
  if (s.blueprintStatus === 'requirements_complete') idx = Math.max(idx, 1);
  if (s.hasRecommendation) idx = Math.max(idx, 2);
  if (s.hasCost) idx = Math.max(idx, 3);
  if (s.hasWorkflow) idx = Math.max(idx, 4);
  if (s.govScanned) idx = Math.max(idx, 5);
  if (s.importPassed) idx = Math.max(idx, 6);          // testing
  if (s.implemented && !s.active) idx = Math.max(idx, 7); // deployment approval pending
  if (s.active) idx = Math.max(idx, 8);                 // workflow active
  if (s.measured) idx = Math.max(idx, 9);               // outcome review due
  const stage = LIFECYCLE_STAGES[idx];
  return {
    index: idx, key: stage.key, label: stage.label,
    stages: LIFECYCLE_STAGES.map((x, i) => ({ ...x, done: i <= idx })),
  };
}

export default { LIFECYCLE_STAGES, deriveLifecycleStage };
