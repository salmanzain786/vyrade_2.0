/**
 * Cost Intelligence — Task 4.6: cross-platform comparison.
 *
 * Runs the full estimate (buildCostEstimate) for every modeled platform and
 * derives honest, structural cost-saving suggestions — never dollar claims we
 * can't back, only guidance grounded in how each platform bills and what the
 * Blueprint actually does.
 *
 * NOTE ON SCOPE: the engine models n8n, Make, Zapier and Claude Code today. A
 * true "n8n Cloud vs Self-hosted" split and a Python/custom column need the
 * billing-model work still open in Tasks 4.2/4.4 — they are intentionally NOT
 * faked here.
 */
import { buildCostEstimate } from './costEstimate.js';

export const COMPARISON_PLATFORMS = ['n8n', 'make', 'zapier', 'claude'];

const RANK = { unknown: 0, low: 1, medium: 2, high: 3 };

export async function buildCostComparison({
  blueprint, blueprintId = null, blueprintVersion = null, monthlyRuns = null, resolvers = {},
}) {
  const platforms = await Promise.all(
    COMPARISON_PLATFORMS.map((platform) =>
      buildCostEstimate({ blueprint, platform, monthlyRuns, blueprintId, blueprintVersion, resolvers })
    )
  );

  return {
    blueprint_id: blueprintId,
    blueprint_version: blueprintVersion,
    monthly_volume: platforms[0]?.monthly_volume ?? null,
    volume_assumed: platforms[0]?.volume_assumed ?? false,
    platforms,
    suggestions: buildSuggestions(platforms, blueprint),
    generated_phase: 6,
  };
}

/** Structural, honest suggestions — each one is grounded in the Blueprint or in
 *  how the platforms bill, never a fabricated price comparison. */
export function buildSuggestions(platforms, blueprint) {
  const out = [];
  const by = Object.fromEntries(platforms.map((p) => [p.platform, p]));
  const steps = blueprint?.process_steps || [];
  const add = (kind, title, detail) => out.push({ kind, title, detail });

  // 1) Volume is the biggest lever — say so when it's assumed.
  if (platforms[0]?.volume_assumed) {
    add('accuracy', 'Confirm the real monthly volume',
      'Volume is assumed, so every metered number is a placeholder. Entering the actual runs/month sharpens the whole comparison.');
  }

  // 2) Self-hosting n8n trades metered executions for a fixed host.
  const runs = platforms[0]?.monthly_volume ?? 0;
  if (by.n8n) {
    add('platform', 'Consider self-hosting n8n at scale',
      `n8n Cloud bills per execution (~${(by.n8n.estimated_units?.execution ?? runs).toLocaleString()}/mo), while self-hosted n8n runs unlimited executions for a fixed hosting cost. Above a few thousand runs/month, self-hosting is usually cheaper.`);
  }

  // 3) Per-run metering differs a lot — surface the cheapest structure.
  const tasks = by.zapier?.estimated_units?.task;
  const ops = by.make?.estimated_units?.operation;
  const execs = by.n8n?.estimated_units?.execution;
  if (tasks && execs && tasks > execs) {
    add('platform', 'Multi-step workflows favour n8n / Make over Zapier',
      `Zapier bills every action as a task (~${tasks.toLocaleString()}/mo here) while n8n bills one execution per run (~${execs.toLocaleString()}/mo). For workflows with several actions, Zapier grows fastest.`);
  }
  if (tasks && ops && ops > tasks) {
    add('platform', 'Make counts the trigger as an operation',
      `Make bills ~${ops.toLocaleString()} operations/mo vs Zapier's ~${tasks.toLocaleString()} tasks, because Make also meters the trigger module. Compare against your real module counts.`);
  }

  // 4) AI steps → token cost can dominate; model choice matters.
  const aiSteps = steps.filter((s) => s.action_type === 'ai_reasoning' || s.action_type === 'generate_content').length;
  if (aiSteps > 0) {
    add('cost-driver', 'AI token cost may dominate — pick the model deliberately',
      `${aiSteps} AI step(s) run every execution. Token spend often outweighs the orchestration fee; use the cheapest model that meets the quality bar, and cache/deduplicate prompts where possible.`);
  }

  // 5) Human approval is a real recurring cost, platform-independent.
  const humanApproval = blueprint?.human_approval?.required === true
    || (blueprint?.human_approval?.approval_points?.length ?? 0) > 0
    || steps.some((s) => s.action_type === 'human_approval');
  if (humanApproval) {
    add('cost-driver', 'Human approval adds a cost no platform removes',
      'A person still reviews part of this workflow. That labour cost is the same on every platform — reducing manual approvals saves more than switching tools.');
  }

  // 6) Unknown tool prices — resolve ownership before comparing.
  const unpricedTools = new Set();
  for (const p of platforms) {
    for (const c of p.cost_components || []) {
      if (c.category === 'external_api_tool' && c.line_cost == null) unpricedTools.add(c.name);
    }
  }
  if (unpricedTools.size) {
    add('accuracy', 'Confirm which tools are already owned',
      `${unpricedTools.size} connected tool price(s) are unknown (${[...unpricedTools].slice(0, 4).join(', ')}${unpricedTools.size > 4 ? '…' : ''}). If they're on existing plans they add $0 to this automation — confirm before comparing totals.`);
  }

  // 7) Which platform currently has the strongest confidence / known total.
  const priced = platforms.filter((p) => p.estimated_total != null);
  if (priced.length) {
    const cheapest = priced.reduce((a, b) => (a.estimated_total <= b.estimated_total ? a : b));
    add('recommendation', `Lowest known core cost: ${cheapest.platform_name}`,
      `${cheapest.platform_name} has the lowest fully-priced core cost so far (~$${cheapest.estimated_total}/mo). Fill remaining unknown prices before treating any total as final.`);
  } else {
    add('accuracy', 'Seed pricing to unlock dollar totals',
      'No platform has every core line priced yet, so totals are withheld. Add verified prices (npm run seed:pricing) to compare real dollars.');
  }

  // Most actionable first (accuracy → cost-driver → platform → recommendation is fine as insertion order).
  return out;
}

/** Overall confidence label for the comparison (weakest platform, informational). */
export function comparisonConfidence(platforms) {
  if (!platforms?.length) return 'unknown';
  const min = Math.min(...platforms.map((p) => RANK[p.confidence] ?? 0));
  return Object.keys(RANK).find((k) => RANK[k] === min) || 'unknown';
}

export default { buildCostComparison, buildSuggestions, comparisonConfidence, COMPARISON_PLATFORMS };
