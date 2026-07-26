/**
 * Cost Intelligence — vendor-neutral platform tradeoffs.
 *
 * A cost comparison must never reduce to "n8n is cheapest". The lowest metered
 * platform fee often carries the highest ownership cost (hosting, maintenance,
 * engineering), and vice-versa. These profiles let the UI present each option
 * as a *tradeoff* — platform cost vs. total automation cost — keeping Vyrade
 * neutral instead of picking a winner.
 *
 * Pure data (importable by the UI). `cost_drivers` are the non-obvious things
 * that move the TOTAL cost beyond the platform's metered bill.
 */
export const PLATFORM_TRADEOFFS = {
  n8n: {
    strength: 'Lowest metered platform cost, especially self-hosted (unmetered executions).',
    responsibility: 'You own hosting, upgrades, monitoring, and maintenance/debugging time.',
    cost_drivers: ['server / hosting', 'maintenance & debugging time', 'upgrade & uptime ownership'],
    summary: 'n8n has lower metered platform cost, but higher hosting and maintenance responsibility.',
  },
  make: {
    strength: 'Visual builder with fully managed hosting; good balance for mid-volume.',
    responsibility: 'Operations are billed per module per run, so cost scales with workflow complexity.',
    cost_drivers: ['operations per run (module count)', 'plan tier at higher volume'],
    summary: 'Make offers visual flexibility, but operations can scale with module count.',
  },
  zapier: {
    strength: 'Simplest to build and operate; fully managed, minimal engineering.',
    responsibility: 'Each successful action is a task, so task volume can push plan requirements up quickly.',
    cost_drivers: ['tasks per run (action count)', 'plan tier at higher volume', 'Premium apps'],
    summary: 'Zapier has simpler operations, but task volume may increase plan requirements.',
  },
  claude: {
    strength: 'Very low platform fee; maximum flexibility as real code + MCP connectors.',
    responsibility: 'Requires engineering effort, security guardrails, and ongoing maintenance.',
    cost_drivers: ['LLM token usage', 'connected API costs', 'engineering & security guardrails'],
    summary: 'Claude/MCP cost depends on LLM usage, connected APIs, and engineering guardrails.',
  },
};

export function tradeoffFor(platform) {
  return PLATFORM_TRADEOFFS[platform] || null;
}

export default { PLATFORM_TRADEOFFS, tradeoffFor };
