/**
 * Recommendation Engine — platform capability profiles ("Platform Capability
 * Database", lightweight edition).
 *
 * Pure reference data: how each candidate architecture rates on the dimensions
 * the scorer weighs. Numeric attributes are 0–3 (low→high). This is deliberately
 * small and self-contained — the recommendation stage must stay lightweight
 * (no doc retrieval), per the task's "common mistakes to avoid".
 *
 * Six candidates, because "n8n" is really two very different cost/ownership
 * stories (self-hosted vs. cloud), and Python/custom is a first-class option.
 */

// skill_needed as an ordinal so we can compare against the user's skill signal.
export const SKILL_RANK = { non_technical: 0, some: 1, developer: 2 };

export const PLATFORM_CAPABILITIES = {
  n8n_selfhosted: {
    key: 'n8n_selfhosted', name: 'n8n (self-hosted)', export_platform: 'n8n', hosting: 'self',
    visual: true, self_hostable: true, managed: false, skill_needed: 'some',
    custom_logic: 2, ai_native: 1, integration_breadth: 3,
    volume_cost_efficiency: 3, maintenance_burden: 3, security_control: 3, branching_support: 3,
    best_for: 'API-heavy visual workflows that need cost control at scale',
  },
  n8n_cloud: {
    key: 'n8n_cloud', name: 'n8n Cloud', export_platform: 'n8n', hosting: 'managed',
    visual: true, self_hostable: false, managed: true, skill_needed: 'some',
    custom_logic: 2, ai_native: 1, integration_breadth: 3,
    volume_cost_efficiency: 2, maintenance_burden: 1, security_control: 1, branching_support: 3,
    best_for: 'visual workflows without hosting or maintenance overhead',
  },
  make: {
    key: 'make', name: 'Make.com', export_platform: 'make', hosting: 'managed',
    visual: true, self_hostable: false, managed: true, skill_needed: 'non_technical',
    custom_logic: 1, ai_native: 1, integration_breadth: 3,
    volume_cost_efficiency: 2, maintenance_burden: 1, security_control: 1, branching_support: 3,
    best_for: 'visual SaaS automation for non-developers',
  },
  zapier: {
    key: 'zapier', name: 'Zapier', export_platform: 'zapier', hosting: 'managed',
    visual: true, self_hostable: false, managed: true, skill_needed: 'non_technical',
    custom_logic: 1, ai_native: 1, integration_breadth: 3,
    volume_cost_efficiency: 1, maintenance_burden: 1, security_control: 1, branching_support: 1,
    best_for: 'simple, fast SaaS automations at low volume',
  },
  claude: {
    key: 'claude', name: 'Claude Code + MCP', export_platform: 'claude', hosting: 'either',
    visual: false, self_hostable: true, managed: true, skill_needed: 'developer',
    custom_logic: 3, ai_native: 3, integration_breadth: 2,
    volume_cost_efficiency: 2, maintenance_burden: 2, security_control: 2, branching_support: 3,
    best_for: 'AI-heavy or custom logic with engineering support',
  },
  python: {
    key: 'python', name: 'Python / custom', export_platform: null, hosting: 'self',
    visual: false, self_hostable: true, managed: false, skill_needed: 'developer',
    custom_logic: 3, ai_native: 2, integration_breadth: 2,
    volume_cost_efficiency: 3, maintenance_burden: 3, security_control: 3, branching_support: 3,
    best_for: 'full control, complex logic, and high volume with an engineering team',
  },
};

export const CANDIDATE_KEYS = Object.keys(PLATFORM_CAPABILITIES);

/** Map a free-text platform name (from implementation_constraints) to a base
 *  token used for required/prohibited/existing matching. */
export function normalizePlatformToken(name) {
  const s = String(name || '').toLowerCase();
  if (s.includes('n8n')) return 'n8n';
  if (s.includes('make')) return 'make';
  if (s.includes('zapier') || s.includes('zap')) return 'zapier';
  if (s.includes('claude') || s.includes('mcp')) return 'claude';
  if (s.includes('python') || s.includes('custom') || s.includes('code')) return 'python';
  return null;
}

/** The base token a candidate belongs to (both n8n variants → 'n8n'). */
export function baseToken(candidateKey) {
  if (candidateKey.startsWith('n8n')) return 'n8n';
  return candidateKey;
}

export default { PLATFORM_CAPABILITIES, CANDIDATE_KEYS, SKILL_RANK, normalizePlatformToken, baseToken };
