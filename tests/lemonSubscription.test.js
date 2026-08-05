import { describe, it, expect } from 'vitest';
import { normalizeSubscription, isActiveStatus } from '../lib/services/billing/subscriptionRepository.js';
import { safeNext } from '../lib/utils.js';

const payload = (over = {}) => ({
  meta: { event_name: 'subscription_created', custom_data: { user_id: 'u1' } },
  data: {
    type: 'subscriptions', id: '999',
    attributes: {
      customer_id: 11, order_id: 22, product_id: '242386', variant_id: '555',
      product_name: 'Vyrade Pro', variant_name: 'Monthly', status: 'active',
      card_brand: 'visa', card_last_four: '4242',
      trial_ends_at: null, renews_at: '2026-09-01T00:00:00.000000Z', ends_at: null,
      created_at: '2026-08-01T00:00:00.000000Z',
      urls: { customer_portal: 'https://x/portal', customer_portal_update_subscription: 'https://x/update' },
      ...over,
    },
  },
});

describe('normalizeSubscription — webhook → row', () => {
  it('maps ids, status, dates, urls and links the user', () => {
    const s = normalizeSubscription(payload());
    expect(s).toMatchObject({
      ls_subscription_id: '999', user_id: 'u1', ls_customer_id: '11', ls_order_id: '22',
      ls_product_id: '242386', ls_variant_id: '555', product_name: 'Vyrade Pro',
      variant_name: 'Monthly', status: 'active', card_last_four: '4242',
      customer_portal_url: 'https://x/portal', update_url: 'https://x/update',
    });
    expect(s.renews_at instanceof Date).toBe(true);
    expect(s.current_period_end.toISOString().startsWith('2026-09-01')).toBe(true);
    expect(typeof s.raw_json).toBe('string'); // full payload retained
  });

  it('user_id is null when custom_data is absent (still upsertable)', () => {
    const p = payload();
    delete p.meta.custom_data;
    expect(normalizeSubscription(p).user_id).toBeNull();
  });
});

describe('isActiveStatus — "has a subscription"', () => {
  it('active / on_trial / past_due / paused / cancelled count as having a sub', () => {
    for (const s of ['active', 'on_trial', 'past_due', 'paused', 'cancelled']) expect(isActiveStatus(s)).toBe(true);
  });
  it('expired / unpaid / unknown do not', () => {
    for (const s of ['expired', 'unpaid', '', null]) expect(isActiveStatus(s)).toBe(false);
  });
});

describe('safeNext — no open redirects', () => {
  it('allows internal absolute paths', () => {
    expect(safeNext('/purchase/242386')).toBe('/purchase/242386');
    expect(safeNext('/purchase/242386', '')).toBe('/purchase/242386');
  });
  it('rejects protocol-relative, absolute, and non-path values', () => {
    for (const bad of ['//evil.com', 'https://evil.com', 'http://x', 'javascript:alert(1)', 'foo', '', null, undefined, '/\\evil']) {
      expect(safeNext(bad)).toBe('/');
    }
  });
});
