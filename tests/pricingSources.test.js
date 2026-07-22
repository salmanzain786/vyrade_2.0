import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SOURCE_TYPES, MAX_CONFIDENCE_BY_SOURCE, isOfficialSource,
  confidenceForSourceType, noSourceResult, resolvePricingFromSource,
} from '../lib/services/cost/pricingSources.js';

const row = (over = {}) => ({
  id: 'src_1', provider: 'zapier', component_type: 'platform_task_usage',
  source_type: 'official_pricing_page', pricing_url: 'https://zapier.com/pricing',
  confidence: 'high', parsed_json: { price: 0.02, currency: 'USD' },
  last_checked_at: '2026-01-01 00:00:00', ...over,
});

describe('confidence governance — only official sources reach high', () => {
  it('official pricing/help pages may be high', () => {
    expect(confidenceForSourceType(SOURCE_TYPES.OFFICIAL_PRICING_PAGE, 'high')).toBe('high');
    expect(confidenceForSourceType(SOURCE_TYPES.OFFICIAL_HELP_DOC, 'high')).toBe('high');
  });

  it('non-official sources are CAPPED even when they claim high', () => {
    expect(confidenceForSourceType(SOURCE_TYPES.API_DOCS, 'high')).toBe('medium');
    expect(confidenceForSourceType(SOURCE_TYPES.MANUAL_ENTRY, 'high')).toBe('medium');
    expect(confidenceForSourceType(SOURCE_TYPES.USER_PROVIDED, 'high')).toBe('low');
    expect(confidenceForSourceType(SOURCE_TYPES.INFERRED, 'high')).toBe('low');
    expect(confidenceForSourceType(SOURCE_TYPES.UNKNOWN, 'high')).toBe('unknown');
  });

  it('a claim lower than the cap is respected (never inflated)', () => {
    expect(confidenceForSourceType(SOURCE_TYPES.OFFICIAL_PRICING_PAGE, 'low')).toBe('low');
  });

  it('isOfficialSource marks exactly the two official types', () => {
    expect(isOfficialSource('official_pricing_page')).toBe(true);
    expect(isOfficialSource('official_help_doc')).toBe(true);
    expect(isOfficialSource('manual_entry')).toBe(false);
    expect(isOfficialSource('inferred')).toBe(false);
  });

  it('the cap table never lets a non-official source reach high', () => {
    for (const [type, cap] of Object.entries(MAX_CONFIDENCE_BY_SOURCE)) {
      if (!isOfficialSource(type)) expect(cap).not.toBe('high');
    }
  });
});

describe('resolvePricingFromSource — honest over hallucinated', () => {
  it('no source → { price:null, confidence:"unknown" } with the exact reason', () => {
    const r = resolvePricingFromSource(null, { component: 'openai/llm_tokens' });
    expect(r).toMatchObject({ price: null, confidence: 'unknown' });
    expect(r.reason).toMatch(/No official pricing source found for this component/);
    expect(r.reason).toContain('openai/llm_tokens');
  });

  it('a source with no parsed price yet → unknown (not a guess)', () => {
    const r = resolvePricingFromSource(row({ parsed_json: null }));
    expect(r.price).toBeNull();
    expect(r.confidence).toBe('unknown');
    expect(r.reason).toMatch(/no parsed price/i);
    expect(r.source.official).toBe(true);
  });

  it('official source with a parsed price → the price at governed confidence', () => {
    const r = resolvePricingFromSource(row());
    expect(r.price).toBe(0.02);
    expect(r.currency).toBe('USD');
    expect(r.confidence).toBe('high');
    expect(r.source.pricing_url).toBe('https://zapier.com/pricing');
  });

  it('an INFERRED source that claims high is clamped to low', () => {
    const r = resolvePricingFromSource(row({ source_type: 'inferred', confidence: 'high' }));
    expect(r.price).toBe(0.02);         // the number is used…
    expect(r.confidence).toBe('low');   // …but never at high confidence
  });

  it('parses a JSON string parsed_json column (mysql2 variance)', () => {
    const r = resolvePricingFromSource(row({ parsed_json: JSON.stringify({ price: 19.99, currency: 'USD' }) }));
    expect(r.price).toBe(19.99);
  });

  it('noSourceResult is stable and null-priced', () => {
    expect(noSourceResult()).toMatchObject({ price: null, confidence: 'unknown' });
  });
});

// ── Repository (mocked pool) ────────────────────────────────────────────────
const query = vi.fn();
vi.mock('../lib/config/db.js', () => ({ pool: { query: (...a) => query(...a) } }));

const repo = await import('../lib/services/cost/pricingSourceRepository.js');

describe('pricingSourceRepository (mocked pool)', () => {
  beforeEach(() => query.mockReset());

  it('resolvePricing returns the governed price when a source exists', async () => {
    query.mockResolvedValueOnce([[row()]]);
    const r = await repo.resolvePricing('zapier', 'platform_task_usage');
    expect(r.price).toBe(0.02);
    expect(r.confidence).toBe('high');
    // Queried the right component.
    expect(query.mock.calls[0][1]).toEqual(['zapier', 'platform_task_usage']);
  });

  it('resolvePricing returns the honest unknown when NO source exists', async () => {
    query.mockResolvedValueOnce([[]]); // no rows
    const r = await repo.resolvePricing('n8n', 'platform_execution_usage');
    expect(r).toMatchObject({ price: null, confidence: 'unknown' });
    expect(r.reason).toMatch(/No official pricing source found/);
  });

  it('upsert rejects an invalid source_type (bad provenance never stored)', async () => {
    await expect(repo.upsertPricingSource({
      provider: 'make', componentType: 'platform_operation_usage', sourceType: 'wikipedia',
    })).rejects.toThrow(/invalid source_type/);
    expect(query).not.toHaveBeenCalled();
  });

  it('upsert stringifies parsed_json and inserts with the right provenance', async () => {
    query.mockResolvedValueOnce([{}]);
    await repo.upsertPricingSource({
      provider: 'make', componentType: 'platform_operation_usage',
      sourceType: SOURCE_TYPES.OFFICIAL_PRICING_PAGE, pricingUrl: 'https://make.com/pricing',
      confidence: 'high', parsedJson: { price: 0.01, currency: 'USD' },
    });
    const [sqlText, params] = query.mock.calls[0];
    expect(sqlText).toMatch(/INSERT INTO pricing_sources/);
    expect(sqlText).toMatch(/ON DUPLICATE KEY UPDATE/);
    // parsed_json is serialised, not passed as a live object.
    expect(params).toContain(JSON.stringify({ price: 0.01, currency: 'USD' }));
    expect(params).toContain('official_pricing_page');
  });
});
