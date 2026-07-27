/**
 * Customer-facing Automation Blueprint report (Task F).
 *
 * The paid "Automation Blueprint Workshop" deliverable. It assembles every
 * Vyrade engine into one structured, client-ready report:
 *   Blueprint (systems, rules, process) + Recommendation Engine (best platform)
 *   + Cost Engine (cost comparison) + Tool Intelligence (auth/security/risk),
 * plus derived risk areas, an implementation roadmap, and next steps.
 *
 * Deterministic assembly on top of deterministic engines — reproducible and
 * auditable, not an LLM opinion.
 */
import { recommend } from '../recommendation/recommendationEngine.js';
import { buildCostComparison } from '../cost/costComparison.js';
import { resolveTools } from '../tools/toolIntelligenceRepository.js';

const RANK = { unknown: 0, low: 1, medium: 2, high: 3 };

function systemNames(bp) {
  const names = new Set((bp.systems || []).map((s) => s?.name).filter(Boolean));
  if (bp?.trigger?.source_system) names.add(bp.trigger.source_system);
  return [...names];
}

// ── Section builders ────────────────────────────────────────────────────────

function businessProblem(bp) {
  const bi = bp.business_intent || {};
  return {
    goal: bi.business_goal || null,
    desired_outcome: bi.desired_outcome || null,
    summary: bi.business_goal
      ? `The business needs to ${lower(bi.business_goal)}${bi.desired_outcome ? `, so that ${lower(bi.desired_outcome)}` : ''}.`
      : 'Business goal not yet captured.',
  };
}

function currentProcess(bp) {
  const steps = (bp.process_steps || []).slice().sort((a, b) => a.sequence - b.sequence);
  return {
    trigger: bp.trigger?.event || bp.trigger?.trigger_type || 'unspecified',
    source: bp.trigger?.source_system || null,
    steps: steps.map((s) => s.action),
    note: 'Today these steps are performed manually. This automation removes that manual effort.',
  };
}

function automationBlueprint(bp) {
  const steps = (bp.process_steps || []).slice().sort((a, b) => a.sequence - b.sequence);
  return {
    trigger: { type: bp.trigger?.trigger_type || 'unknown', event: bp.trigger?.event || null, source: bp.trigger?.source_system || null },
    steps: steps.map((s) => ({ sequence: s.sequence, action: s.action, action_type: s.action_type })),
    systems_count: (bp.systems || []).length,
    volume: { estimated_executions: bp.volume?.estimated_executions ?? null, period: bp.volume?.period ?? null },
    has_ai: steps.some((s) => s.action_type === 'ai_reasoning' || s.action_type === 'generate_content'),
    has_branching: (bp.business_rules?.length || 0) + steps.filter((s) => s.action_type === 'business_decision').length > 0,
  };
}

async function systemsSection(bp) {
  const names = systemNames(bp);
  const { tools } = await resolveTools(names);
  const byName = new Map(tools.map((t) => [(t.tool_name || '').toLowerCase(), t]));
  return (bp.systems || []).map((s) => {
    const intel = byName.get((s.name || '').toLowerCase());
    return {
      name: s.name,
      role: s.role,
      required: s.required,
      auth_method: intel?.found ? intel.auth_method : 'unknown',
      integration_complexity: intel?.found ? intel.integration_complexity : 'unknown',
      security_risk: intel?.found ? intel.security_risk : 'unknown',
      documentation_url: intel?.found ? intel.documentation_url : null,
      intelligence_available: !!intel?.found,
    };
  });
}

function businessRules(bp) {
  return {
    rules: (bp.business_rules || []).map((r) => ({
      description: r.description,
      condition: r.condition ? `${r.condition.field} ${r.condition.operator} ${(r.condition.value || []).join(', ')}` : null,
      result: r.result ? `${r.result.action}: ${r.result.value}` : null,
    })),
    exceptions: (bp.exception_rules || []).map((e) => ({ scenario: e.scenario, behavior: e.behavior })),
  };
}

function riskAreas(bp, toolSummary, recommendation, comparison) {
  const risks = [];
  const add = (area, severity, detail) => risks.push({ area, severity, detail });

  if (toolSummary.max_security_risk === 'high') {
    add('Sensitive data handling', 'high', 'One or more connected systems handle financial/PII data — scope credentials tightly and review data flows.');
  }
  if (toolSummary.unresolved_tools.length) {
    add('Unverified integrations', 'medium', `No integration profile on file for: ${toolSummary.unresolved_tools.join(', ')}. Confirm API availability and auth before building.`);
  }
  const blocking = (bp.unknown_requirements || []).filter((u) => u?.blocks_generation);
  if (blocking.length) {
    add('Incomplete requirements', 'high', `${blocking.length} requirement(s) still block generation — resolve before implementation.`);
  }
  if (comparison?.volume_assumed) {
    add('Unconfirmed volume', 'medium', 'Monthly volume is assumed. It materially affects platform fit and cost — confirm a real figure.');
  }
  if (bp.human_approval?.required === true && !(bp.human_approval.approval_points?.length)) {
    add('Undefined approval points', 'medium', 'Human approval is required but the specific approval points are not defined.');
  }
  if (!(bp.exception_rules?.length) && (bp.process_steps?.length || 0) >= 4) {
    add('No exception handling', 'low', 'No exception/error rules are defined for a multi-step workflow — add retry/failure handling.');
  }
  if (toolSummary.max_integration_complexity === 'high') {
    add('High integration complexity', 'medium', 'At least one system is complex to integrate — budget extra implementation time.');
  }
  if (risks.length === 0) add('No major risks identified', 'low', 'No significant risk areas surfaced from the current Blueprint.');
  return risks;
}

function recommendedArchitecture(rec) {
  return {
    platform: rec.recommended.platform,
    name: rec.recommended.name,
    suitability: rec.recommended.suitability,
    reason: rec.recommended.reason,
    why_fits: rec.recommended.why_fits,
    risks: rec.recommended.risks,
    cost_notes: rec.recommended.cost_notes,
    confidence: rec.confidence,
    alternatives: rec.alternatives.map((a) => ({ name: a.name, reason: a.reason, why_weaker: a.why_weaker.slice(0, 2) })),
  };
}

function costComparisonSection(comparison) {
  return {
    monthly_volume: comparison.monthly_volume,
    volume_assumed: comparison.volume_assumed,
    platforms: comparison.platforms.map((p) => ({
      name: p.platform_name,
      known_monthly_cost: p.known_monthly_cost,
      estimated_total: p.estimated_total,
      currency: p.currency,
      confidence: p.confidence,
      platform_cost: p.cost_groups?.platform?.known ?? null,
      units: p.estimated_units,
    })),
    tradeoffs: comparison.tradeoffs,
    note: 'Costs reflect verified pricing where available; unpriced items are shown as unknown, never guessed.',
  };
}

function implementationRoadmap(bp, systems, rec) {
  const phases = [];
  const p = (title, tasks) => phases.push({ phase: phases.length + 1, title, tasks: tasks.filter(Boolean) });
  const hasAI = (bp.process_steps || []).some((s) => s.action_type === 'ai_reasoning' || s.action_type === 'generate_content');
  const approvals = bp.human_approval?.approval_points || [];

  p('Foundations & access', [
    `Set up the ${rec.recommended.name} environment.`,
    systems.length ? `Connect ${systems.length} system(s): ${systems.map((s) => s.name).join(', ')}.` : null,
    'Provision API credentials (least-privilege) and store them in the platform secret manager.',
  ]);
  p('Build the trigger', [
    `Configure the ${bp.trigger?.trigger_type || 'event'} trigger${bp.trigger?.source_system ? ` from ${bp.trigger.source_system}` : ''}.`,
  ]);
  p('Core automation steps', [
    `Implement the ${(bp.process_steps || []).length} process step(s) in sequence.`,
    'Map data between systems at each hand-off.',
  ]);
  if ((bp.business_rules?.length || 0) + (bp.exception_rules?.length || 0) > 0) {
    p('Business rules & exceptions', [
      bp.business_rules?.length ? `Encode ${bp.business_rules.length} business rule(s).` : null,
      bp.exception_rules?.length ? `Handle ${bp.exception_rules.length} exception scenario(s) with retries/fallbacks.` : 'Add retry + failure handling.',
    ]);
  }
  if (hasAI) p('AI steps', ['Select and configure the model for reasoning/generation steps.', 'Add prompt guardrails and validate outputs.']);
  if (approvals.length) p('Human approval', [`Insert approval step(s): ${approvals.join('; ')}.`, 'Define who approves and the notification channel.']);
  p('Testing & validation', ['Run with sample data.', 'Validate the workflow imports/deploys cleanly.', 'Confirm outputs against the business rules.']);
  p('Deploy & monitor', ['Go live.', 'Monitor executions, failures, and cost; iterate as volume grows.']);
  return phases;
}

function humanApprovalPoints(bp) {
  const points = bp.human_approval?.approval_points || [];
  return {
    required: bp.human_approval?.required ?? null,
    points,
    note: bp.human_approval?.required
      ? 'A human reviews part of this workflow — a real, recurring operational cost independent of platform.'
      : 'No human approval is required; the workflow can run fully automated.',
  };
}

function securityNotes(bp, systemsList, toolSummary) {
  const notes = [];
  const constraints = bp.constraints || {};
  for (const req of constraints.security_requirements || []) notes.push({ kind: 'requirement', text: req });
  for (const req of constraints.compliance_requirements || []) notes.push({ kind: 'compliance', text: req });

  const highRisk = systemsList.filter((s) => s.security_risk === 'high').map((s) => s.name);
  if (highRisk.length) notes.push({ kind: 'data', text: `High-sensitivity systems (${highRisk.join(', ')}): scope tokens to least privilege and review data residency.` });

  const authMethods = [...new Set(systemsList.map((s) => s.auth_method).filter((a) => a && a !== 'unknown'))];
  if (authMethods.length) notes.push({ kind: 'auth', text: `Authentication methods in use: ${authMethods.join(', ')}. Rotate keys/tokens periodically.` });

  notes.push({ kind: 'general', text: 'Never hardcode credentials; use the platform secret manager. Log actions but never log secrets or full payloads.' });
  return notes;
}

function nextSteps(bp, rec, comparison, toolSummary) {
  const steps = [];
  if (comparison?.volume_assumed) steps.push('Confirm your expected monthly volume — it sharpens both the platform fit and the cost estimate.');
  steps.push(`Confirm the recommended platform: ${rec.recommended.name}${rec.alternatives.length ? ` (alternative: ${rec.alternatives[0].name}).` : '.'}`);
  if (toolSummary.unresolved_tools.length) steps.push(`Verify integration details for: ${toolSummary.unresolved_tools.join(', ')}.`);
  const anyUnpriced = comparison?.platforms?.some((p) => p.estimated_total == null);
  if (anyUnpriced) steps.push('Fill in the remaining tool/platform prices to unlock a full dollar total.');
  const blocking = (bp.unknown_requirements || []).filter((u) => u?.blocks_generation);
  if (blocking.length) steps.push('Resolve the outstanding requirements that currently block generation.');
  steps.push('Generate the workflow in Vyrade and validate it against a test run.');
  return steps;
}

const lower = (s) => {
  const t = String(s || '').trim();
  return t ? t.charAt(0).toLowerCase() + t.slice(1) : t;
};

/**
 * Assemble the full customer-facing report.
 * @returns {Promise<object>}
 */
export async function generateBlueprintReport({ blueprint, blueprintId = null, blueprintVersion = null, monthlyRuns = null } = {}) {
  if (!blueprint) throw new Error('[report] blueprint is required');

  const rec = recommend({ blueprint, blueprintId, blueprintVersion, monthlyRuns });
  const [comparison, systemsList] = await Promise.all([
    buildCostComparison({ blueprint, blueprintId, blueprintVersion, monthlyRuns }),
    systemsSection(blueprint),
  ]);
  const { summary: toolSummary } = await resolveTools(systemNames(blueprint));

  return {
    blueprint_id: blueprintId,
    blueprint_version: blueprintVersion,
    title: `Automation Blueprint — ${blueprint.name || 'Untitled'}`,
    generated_at: null, // stamped by the caller
    confidence: rec.confidence,
    sections: {
      business_problem: businessProblem(blueprint),
      current_process: currentProcess(blueprint),
      automation_blueprint: automationBlueprint(blueprint),
      systems: systemsList,
      business_rules: businessRules(blueprint),
      risk_areas: riskAreas(blueprint, toolSummary, rec, comparison),
      recommended_architecture: recommendedArchitecture(rec),
      cost_comparison: costComparisonSection(comparison),
      implementation_roadmap: implementationRoadmap(blueprint, systemsList, rec),
      human_approval_points: humanApprovalPoints(blueprint),
      security_notes: securityNotes(blueprint, systemsList, toolSummary),
      next_steps: nextSteps(blueprint, rec, comparison, toolSummary),
    },
  };
}

export default { generateBlueprintReport };
