import { describe, it, expect } from 'vitest';
import {
  CAPABILITY_KEYS, MATRIX_PLATFORMS, SUPPORT,
  getCapability, getPlatformProfile, platformsSupporting, capabilityComparison, capabilityHighlights,
} from '../lib/services/recommendation/platformCapabilityMatrix.js';

describe('capability matrix — data integrity', () => {
  it('every platform has a record for every capability, with valid fields', () => {
    for (const p of MATRIX_PLATFORMS) {
      for (const c of CAPABILITY_KEYS) {
        const rec = getCapability(p, c);
        expect(['full', 'partial', 'none']).toContain(rec.native_support);
        expect(['low', 'medium', 'high']).toContain(rec.complexity);
        expect(typeof rec.requires_workaround).toBe('boolean');
        expect(typeof rec.requires_api).toBe('boolean');
        expect(typeof rec.requires_mcp).toBe('boolean');
      }
    }
  });

  it('every platform has a profile with cost model, best-fit and limitations', () => {
    for (const p of MATRIX_PLATFORMS) {
      const prof = getPlatformProfile(p);
      expect(prof.cost_model).toBeTruthy();
      expect(prof.best_fit_use_cases.length).toBeGreaterThan(0);
      expect(prof.limitations.length).toBeGreaterThan(0);
      expect(prof.reliability_notes).toBeTruthy();
    }
  });
});

describe('capability facts match the doc examples', () => {
  it('Zapier: good for simple SaaS, weak/workaround for complex branching + costly at volume', () => {
    expect(getCapability('zapier', 'complex_branching').native_support).toBe(SUPPORT.PARTIAL);
    expect(getCapability('zapier', 'complex_branching').requires_workaround).toBe(true);
    expect(getCapability('zapier', 'high_volume').native_support).not.toBe(SUPPORT.FULL);
    expect(getPlatformProfile('zapier').best_fit_use_cases.join(' ')).toMatch(/simple|SaaS/i);
  });

  it('n8n: good for complex workflows / API flexibility, needs technical ownership', () => {
    expect(getCapability('n8n', 'complex_branching').native_support).toBe(SUPPORT.FULL);
    expect(getCapability('n8n', 'api_integration').native_support).toBe(SUPPORT.FULL);
    expect(getCapability('n8n', 'self_hosting').native_support).toBe(SUPPORT.FULL);
    expect(getPlatformProfile('n8n').limitations.join(' ')).toMatch(/technical ownership/i);
  });

  it('Claude + MCP: agentic/AI + MCP native, less deterministic than visual', () => {
    expect(getCapability('claude', 'ai_reasoning').native_support).toBe(SUPPORT.FULL);
    expect(getCapability('claude', 'mcp_connectors').native_support).toBe(SUPPORT.FULL);
    expect(getCapability('claude', 'mcp_connectors').requires_mcp).toBe(true);
    expect(getCapability('claude', 'visual_building').native_support).toBe(SUPPORT.NONE);
    expect(getPlatformProfile('claude').reliability_notes).toMatch(/less deterministic/i);
  });
});

describe('query helpers', () => {
  it('platformsSupporting finds platforms at/above a level', () => {
    const fullAi = platformsSupporting('ai_reasoning', { min: 'full' });
    expect(fullAi).toContain('claude');
    expect(fullAi).not.toContain('zapier');

    const anyMcp = platformsSupporting('mcp_connectors', { min: 'partial' });
    expect(anyMcp).toContain('claude');
    expect(anyMcp).not.toContain('make');
  });

  it('capabilityComparison returns one row per platform', () => {
    const rows = capabilityComparison('complex_branching');
    expect(rows.map((r) => r.platform).sort()).toEqual([...MATRIX_PLATFORMS].sort());
  });

  it('capabilityHighlights cites concrete facts for the active signals', () => {
    const notes = capabilityHighlights('zapier', { has_complex_branching: true, volume_tier: 'high' });
    const joined = notes.join(' ');
    expect(joined).toMatch(/branching/i);
    expect(joined).toMatch(/workaround/i);
    expect(joined).toMatch(/high execution-volume/i);
  });
});
