import { describe, it, expect, afterEach } from 'vitest';
import { isStrictRecommendationEnforced } from '../lib/services/recommendation/enforcement.js';

const orig = { flag: process.env.STRICT_RECOMMENDATION_BEFORE_EXPORT, node: process.env.NODE_ENV };
afterEach(() => {
  process.env.STRICT_RECOMMENDATION_BEFORE_EXPORT = orig.flag;
  process.env.NODE_ENV = orig.node;
});
const set = (flag, node) => {
  if (flag === undefined) delete process.env.STRICT_RECOMMENDATION_BEFORE_EXPORT;
  else process.env.STRICT_RECOMMENDATION_BEFORE_EXPORT = flag;
  process.env.NODE_ENV = node;
};

describe('isStrictRecommendationEnforced — production-grade default', () => {
  it('is STRICT by default in production', () => {
    set(undefined, 'production');
    expect(isStrictRecommendationEnforced()).toBe(true);
  });

  it('is lenient by default outside production (dev/test)', () => {
    set(undefined, 'development');
    expect(isStrictRecommendationEnforced()).toBe(false);
  });

  it('the env flag overrides in both directions', () => {
    set('true', 'development');
    expect(isStrictRecommendationEnforced()).toBe(true);   // force strict in dev
    set('false', 'production');
    expect(isStrictRecommendationEnforced()).toBe(false);  // force lenient in prod
  });
});
