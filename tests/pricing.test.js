import { describe, it, expect } from 'vitest';
import {
  costForUsage,
  mergeUsage,
  usageFromCompletion,
  emptyUsage,
} from '../lib/config/pricing.js';

describe('pricing', () => {
  it('computes cost from input/output rates (gpt-4o: $2.50 / $10.00 per 1M)', () => {
    const usage = { model: 'gpt-4o', promptTokens: 1_000_000, completionTokens: 1_000_000 };
    // 2.50 + 10.00
    expect(costForUsage(usage)).toBeCloseTo(12.5, 6);
  });

  it('a small call rounds to 6 decimals', () => {
    const usage = { model: 'gpt-4o-mini', promptTokens: 1000, completionTokens: 500 };
    // 1000/1e6*0.15 + 500/1e6*0.60 = 0.00015 + 0.0003 = 0.00045
    expect(costForUsage(usage)).toBeCloseTo(0.00045, 6);
  });

  it('unknown model falls back to the default rate', () => {
    const usage = { model: 'some-unlisted-model', promptTokens: 1_000_000, completionTokens: 0 };
    expect(costForUsage(usage)).toBeGreaterThan(0);
  });

  it('mergeUsage sums token counts and keeps a model', () => {
    const a = { model: 'gpt-4o', promptTokens: 10, completionTokens: 5, totalTokens: 15 };
    const b = { model: 'gpt-4o', promptTokens: 20, completionTokens: 7, totalTokens: 27 };
    const m = mergeUsage(a, b);
    expect(m.promptTokens).toBe(30);
    expect(m.completionTokens).toBe(12);
    expect(m.totalTokens).toBe(42);
    expect(m.model).toBe('gpt-4o');
  });

  it('mergeUsage tolerates null operands', () => {
    expect(mergeUsage(null, null)).toEqual(emptyUsage());
  });

  it('usageFromCompletion normalizes the OpenAI usage shape', () => {
    const completion = { model: 'gpt-4o', usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 } };
    const u = usageFromCompletion(completion, 'gpt-4o');
    expect(u).toEqual({ model: 'gpt-4o', promptTokens: 100, completionTokens: 40, totalTokens: 140 });
  });

  it('usageFromCompletion handles a missing usage field (streaming chunks without usage)', () => {
    const u = usageFromCompletion({ model: 'gpt-4o' }, 'gpt-4o');
    expect(u.totalTokens).toBe(0);
  });
});
