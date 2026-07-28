/**
 * Platform positioning for the public /technology/[platform] landing pages.
 *
 * Composes the commercial/SEO narrative — when a platform fits, when it doesn't,
 * its tradeoffs and use cases — entirely from Vyrade's own intelligence layers:
 *   • Platform Capability Matrix (Task B): best-fit use cases, limitations,
 *     cost model, reliability, and per-capability support.
 *   • Platform Tradeoffs (cost engine): vendor-neutral strength vs. ownership.
 * Pure data — no DB. The encyclopedia counts are layered on at the page.
 */
import {
  PLATFORM_PROFILES, getPlatformCapabilities, CAPABILITIES, SUPPORT,
} from '../recommendation/platformCapabilityMatrix.js';
import { PLATFORM_TRADEOFFS } from '../cost/platformTradeoffs.js';

const TAGLINES = {
  n8n: 'Open-source, API-first workflow automation you can self-host or run in the cloud.',
  make: 'Visual, scenario-based SaaS automation for non-developers.',
  zapier: 'The fastest way to connect apps for simple, reliable automations.',
  claude: 'Agentic, code-based automation with Claude Code + MCP for maximum flexibility.',
};

export function getPlatformPositioning(platform) {
  const profile = PLATFORM_PROFILES[platform];
  const tradeoff = PLATFORM_TRADEOFFS[platform];
  if (!profile && !tradeoff) return null;

  const caps = getPlatformCapabilities(platform) || {};
  const strong = [];
  const weak = [];
  for (const [key, rec] of Object.entries(caps)) {
    const label = CAPABILITIES[key];
    if (rec.native_support === SUPPORT.FULL) strong.push(label);
    else if (rec.native_support === SUPPORT.NONE || (rec.native_support === SUPPORT.PARTIAL && rec.requires_workaround)) weak.push(label);
  }

  return {
    tagline: TAGLINES[platform] || null,
    fits: profile?.best_fit_use_cases || [],
    does_not_fit: profile?.limitations || [],
    cost_model: profile?.cost_model || null,
    reliability: profile?.reliability_notes || null,
    tradeoff: tradeoff ? {
      summary: tradeoff.summary,
      strength: tradeoff.strength,
      responsibility: tradeoff.responsibility,
      cost_drivers: tradeoff.cost_drivers || [],
    } : null,
    strong_capabilities: strong.slice(0, 8),
    weak_capabilities: weak.slice(0, 6),
    use_cases: profile?.best_fit_use_cases || [],
  };
}

export default { getPlatformPositioning };
