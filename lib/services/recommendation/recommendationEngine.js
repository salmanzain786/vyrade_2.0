/**
 * Architecture Recommendation Engine (Task 3) — the deterministic core.
 *
 * Given an Automation Blueprint, score every candidate architecture with RULES
 * (not an LLM opinion), rank them, and explain the choice: why the winner fits,
 * why the others are weaker, the risks, cost notes, and a confidence level.
 *
 * Rules-first by design (per the task): the output is reproducible and
 * auditable. An optional LLM polish layer can be added later on TOP of this —
 * it must never replace the deterministic scoring.
 */
import {
  PLATFORM_CAPABILITIES, CANDIDATE_KEYS, baseToken,
} from './platformCapabilities.js';
import { extractSignals } from './blueprintSignals.js';
import { capabilityHighlights, getPlatformProfile } from './platformCapabilityMatrix.js';
import { PLATFORM_TRADEOFFS } from '../cost/platformTradeoffs.js';

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

// The deterministic engine's version. BUMP THIS (rules-v1 → rules-v2 …)
// whenever platform scoring changes materially, so old persisted runs stay
// attributable to the rules that produced them and GET never serves an
// old-rules result under a new-rules label.
// Enforced by tests/recommendationEngineVersion.test.js — a scoring change
// there fails until this version and the pinned fingerprint are both updated.
export const ENGINE_VERSION = 'rules-v1';

function suitabilityLabel(score) {
  if (score >= 75) return 'excellent';
  if (score >= 60) return 'strong';
  if (score >= 45) return 'moderate';
  if (score >= 25) return 'weak';
  return 'poor';
}

/** Score one candidate against the signals. Returns score + reasoning bits. */
export function scoreCandidate(cap, sig) {
  const positives = [], negatives = [], risks = [];
  const base = baseToken(cap.key);

  // ── Hard constraints ──
  if (sig.prohibited_platforms.includes(base)) {
    return { score: 0, positives, negatives: ['The user explicitly prohibited this platform.'], risks, prohibited: true, required: false };
  }
  const isRequired = sig.required_platforms.includes(base);
  const isExisting = sig.existing_platforms.includes(base);

  let score = 50;

  // ── Technical-skill fit ──
  const skill = sig.technical_skill;
  if (skill === 'non_technical') {
    if (cap.skill_needed === 'non_technical') { score += 15; positives.push('No coding required — fits a non-technical team.'); }
    else if (cap.skill_needed === 'some') { score -= 6; negatives.push('Needs some technical comfort to build and maintain.'); }
    else { score -= 25; negatives.push('Requires developer skills the team may not have.'); risks.push('Skill gap: relies on engineering the team lacks.'); }
  } else if (skill === 'developer') {
    if (!cap.visual) { score += 8; positives.push('A developer team can use code for maximum flexibility.'); }
  } else if (skill === 'some') {
    if (cap.skill_needed === 'developer') { score -= 10; negatives.push("May exceed the team's current technical comfort."); }
    else if (cap.skill_needed === 'non_technical') { score += 6; positives.push('Approachable for a mixed-skill team.'); }
  }

  // ── Volume ──
  if (sig.volume_tier === 'high') {
    score += (cap.volume_cost_efficiency - 1) * 8;
    if (cap.volume_cost_efficiency >= 3) positives.push('Fixed-cost model scales well at high volume.');
    if (cap.volume_cost_efficiency <= 1) { negatives.push('Metered billing can get expensive at high volume.'); risks.push('Platform cost may rise steeply with volume.'); }
  } else if (sig.volume_tier === 'low') {
    if (cap.self_hostable && cap.maintenance_burden >= 3 && sig.hosting_preference !== 'self_hosted') {
      score -= 6; negatives.push('Self-hosting/engineering is likely overkill for low volume.');
    }
    if (cap.managed && cap.skill_needed === 'non_technical') { score += 5; positives.push('Quick to stand up for a low-volume workflow.'); }
  }

  // ── Branching / custom logic ──
  if (sig.has_complex_branching) {
    score += (cap.branching_support - 1) * 5;
    score += (cap.custom_logic - 1) * 5;
    if (cap.branching_support <= 1) { negatives.push('Limited branching/paths for complex conditional logic.'); risks.push('Complex logic may be awkward to express.'); }
    if (cap.custom_logic >= 3) positives.push('Handles custom / complex business logic well.');
  }

  // ── AI requirement ──
  if (sig.ai_required) {
    score += (cap.ai_native - 1) * 7;
    if (cap.ai_native >= 3) positives.push('AI-native — strong fit for reasoning / generation steps.');
    else if (cap.ai_native <= 1) negatives.push('AI steps rely on add-on nodes rather than native support.');
  }

  // ── Hosting preference ──
  if (sig.hosting_preference === 'self_hosted') {
    if (cap.self_hostable) { score += 12; positives.push('Supports self-hosting, as the user requires.'); }
    else { score -= 22; negatives.push('Cannot be self-hosted, which the user requires.'); risks.push('Conflicts with the stated self-hosting requirement.'); }
  } else if (sig.hosting_preference === 'managed') {
    if (cap.managed) { score += 8; positives.push('Fully managed — no infrastructure to run.'); }
    else { score -= 10; negatives.push('Needs infrastructure the user prefers to avoid.'); }
  }

  // ── Security / compliance ──
  if (sig.security_sensitive) {
    score += (cap.security_control - 1) * 5;
    if (cap.security_control >= 3) positives.push('Full control over data residency and security.');
    else negatives.push('Less control over data residency (SaaS-hosted).');
  }

  // ── Always-on minor factors ──
  score += (cap.integration_breadth - 2) * 3;   // breadth helps a little
  score -= cap.maintenance_burden * 3;           // ongoing burden hurts a little
  if (cap.maintenance_burden >= 3) risks.push('Higher ongoing maintenance / ownership burden.');

  // ── Existing / required boosts ──
  if (isExisting) { score += 8; positives.push('Already in use at the company.'); }
  if (isRequired) { score += 45; positives.push('The user requires this platform.'); }

  return { score: clamp(score), positives, negatives, risks, prohibited: false, required: isRequired };
}

function costNotes(cap, sig) {
  if (cap.key === 'python') {
    return 'No platform fee — cost is infrastructure + engineering time to build and maintain it.';
  }
  if (cap.key === 'n8n_selfhosted') {
    return 'Low metered cost (unmetered executions), offset by hosting + maintenance you own.';
  }
  if (cap.key === 'n8n_cloud') {
    return 'Managed, billed per execution; no hosting burden.';
  }
  const t = PLATFORM_TRADEOFFS[cap.export_platform];
  let note = t?.summary || '';
  if (cap.key === 'zapier' && sig.volume_tier === 'high') {
    note += ' At this volume, task-based billing likely dominates the cost.';
  }
  return note;
}

function formatOption(o, sig, role) {
  const cap = PLATFORM_CAPABILITIES[o.platform];
  const reason =
    role === 'rejected'
      ? (o.negatives[0] || `Lower overall fit for this Blueprint.`)
      : (o.positives.slice(0, 2).join(' ') || `Best for ${cap.best_for}.`);
  const base = baseToken(o.platform);
  return {
    platform: o.platform,
    name: o.name,
    export_platform: o.export_platform,
    score: o.score,
    suitability: suitabilityLabel(o.score),
    best_for: cap.best_for,
    reason,
    why_fits: o.positives,
    why_weaker: o.negatives,     // for alternatives / rejected
    risks: o.risks,
    cost_notes: costNotes(cap, sig),
    // Concrete facts from the Platform Capability Database (Task B).
    capability_notes: capabilityHighlights(base, sig),
    limitations: getPlatformProfile(base)?.limitations || [],
  };
}

function deriveConfidence(sig, scored) {
  const LEVELS = ['unknown', 'low', 'medium', 'high'];
  let rank = 3; // high
  if (sig.volume_assumed) rank = Math.min(rank, 2);
  if (sig.technical_skill === 'unknown') rank = Math.min(rank, 2);
  if (sig.blocking_unknowns > 0) rank = Math.min(rank, 1);
  const gap = (scored[0]?.score ?? 0) - (scored[1]?.score ?? 0);
  if (gap < 8) rank = Math.min(rank, 1);        // near-tie → low confidence
  if (scored[0]?.required) rank = 3;            // a hard requirement is unambiguous
  return LEVELS[rank];
}

/**
 * Produce the ranked recommendation for a Blueprint.
 * @returns {object} { recommended, alternatives[], rejected[], signals, confidence, ... }
 */
export function recommend({ blueprint, monthlyRuns = null, blueprintId = null, blueprintVersion = null } = {}) {
  const sig = extractSignals(blueprint, { monthlyRuns });

  // Score all candidates, then collapse the two n8n variants to the better fit
  // so the result reads as five distinct architectures (not n8n twice).
  const all = CANDIDATE_KEYS.map((k) => {
    const cap = PLATFORM_CAPABILITIES[k];
    return { platform: k, name: cap.name, export_platform: cap.export_platform, ...scoreCandidate(cap, sig) };
  });
  const byToken = new Map();
  for (const s of all) {
    const t = baseToken(s.platform);
    if (!byToken.has(t) || s.score > byToken.get(t).score) byToken.set(t, s);
  }
  const scored = [...byToken.values()].sort(
    (a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0) || b.score - a.score
  );

  const recommended = scored[0];
  let alternatives = scored.slice(1).filter((s) => !s.prohibited && s.score > 25).slice(0, 3);
  if (alternatives.length === 0 && scored.length > 1) alternatives = [scored[1]]; // DoD: ≥1 alternative
  const altSet = new Set(alternatives);
  const rejected = scored.slice(1).filter((s) => !altSet.has(s));

  return {
    blueprint_id: blueprintId,
    blueprint_version: blueprintVersion,
    recommended: formatOption(recommended, sig, 'recommended'),
    alternatives: alternatives.map((o) => formatOption(o, sig, 'alternative')),
    rejected: rejected.map((o) => formatOption(o, sig, 'rejected')),
    signals: sig,
    confidence: deriveConfidence(sig, scored),
    engine: ENGINE_VERSION,
    generated_at: null, // stamped by the caller/route (no implicit clock here)
  };
}

export default { recommend, scoreCandidate };
