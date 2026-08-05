import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { LS_WEBHOOK_SECRET } from '@/lib/config/lemonsqueezy';
import { normalizeSubscription, upsertSubscription } from '@/lib/services/billing/subscriptionRepository';

// Lemon Squeezy webhook. Saves subscription lifecycle data (status, renews_at /
// period end, ends_at, portal urls, full payload) so the app knows each user's
// subscription state. PUBLIC route — authenticity comes from the HMAC signature,
// NOT a session, so we verify the signature before trusting anything.
export const dynamic = 'force-dynamic';

const SUBSCRIPTION_EVENTS = new Set([
  'subscription_created', 'subscription_updated', 'subscription_cancelled',
  'subscription_resumed', 'subscription_expired', 'subscription_paused',
  'subscription_unpaused', 'subscription_payment_success', 'subscription_payment_failed',
]);

function verifySignature(rawBody, signature) {
  if (!LS_WEBHOOK_SECRET || !signature) return false;
  const digest = createHmac('sha256', LS_WEBHOOK_SECRET).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(digest, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request) {
  // Raw body is required for the signature — read it before parsing.
  const raw = await request.text();
  const signature = request.headers.get('x-signature');

  if (!verifySignature(raw, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }

  const event = payload?.meta?.event_name;
  if (SUBSCRIPTION_EVENTS.has(event) && payload?.data?.type === 'subscriptions') {
    try {
      await upsertSubscription(normalizeSubscription(payload));
    } catch (err) {
      // Return 500 so Lemon Squeezy retries rather than silently dropping it.
      console.error('[lemonsqueezy webhook] upsert failed:', err.message);
      return NextResponse.json({ error: 'Persist failed' }, { status: 500 });
    }
  }
  // 200 for handled + ignored events alike, so LS marks delivery successful.
  return NextResponse.json({ received: true, event });
}
