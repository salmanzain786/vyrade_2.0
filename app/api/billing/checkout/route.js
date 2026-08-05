import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { isLemonConfigured } from '@/lib/config/lemonsqueezy';
import { createCheckout } from '@/lib/services/billing/lemonSqueezyClient';

export const dynamic = 'force-dynamic';

// Create a Lemon Squeezy checkout for a VARIANT and return its hosted URL. The
// user id is stamped into the checkout's custom data so the webhook can link the
// resulting subscription back to this account.
export const POST = withAuth(async (user, request) => {
  if (!isLemonConfigured()) {
    return NextResponse.json({ error: 'Billing is not configured.' }, { status: 503 });
  }
  const { variantId } = await request.json().catch(() => ({}));
  if (!variantId) return NextResponse.json({ error: 'variantId is required' }, { status: 400 });

  const origin = process.env.APP_URL || new URL(request.url).origin;
  const url = await createCheckout({
    variantId,
    email: user.email,
    userId: user.id,
    redirectUrl: `${origin}/purchase/${variantId}?success=1`,
  }).catch((err) => { throw err; });

  if (!url) return NextResponse.json({ error: 'Could not create checkout.' }, { status: 502 });
  return NextResponse.json({ url });
});
