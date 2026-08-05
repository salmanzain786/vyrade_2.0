import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';

const upsert = vi.fn();
vi.mock('../lib/services/billing/subscriptionRepository.js', () => ({
  normalizeSubscription: (p) => ({ ls_subscription_id: p.data.id, status: p.data.attributes?.status }),
  upsertSubscription: (...a) => upsert(...a),
}));

const SECRET = 'test-webhook-secret';
process.env.LEMON_SQUEEZ_WEBHOOK_SECRET = SECRET;
const { POST } = await import('../app/api/webhooks/lemonsqueezy/route.js');

function req(body, { secret = SECRET, event = 'subscription_created' } = {}) {
  const payload = body || { meta: { event_name: event }, data: { type: 'subscriptions', id: '5', attributes: { status: 'active' } } };
  const raw = JSON.stringify(payload);
  const sig = secret ? createHmac('sha256', secret).update(raw, 'utf8').digest('hex') : 'deadbeef';
  return new Request('http://x/api/webhooks/lemonsqueezy', { method: 'POST', body: raw, headers: { 'x-signature': sig } });
}

describe('Lemon Squeezy webhook — signature gate + persistence', () => {
  beforeEach(() => upsert.mockReset());

  it('rejects a bad signature with 401 and never persists', async () => {
    const res = await POST(req(null, { secret: 'wrong-secret' }));
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('accepts a valid signature and upserts a subscription event', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0][0]).toMatchObject({ ls_subscription_id: '5' });
  });

  it('ignores non-subscription events (200, no persist)', async () => {
    const body = { meta: { event_name: 'order_created' }, data: { type: 'orders', id: '7' } };
    const res = await POST(req(body));
    expect(res.status).toBe(200);
    expect(upsert).not.toHaveBeenCalled();
  });
});
