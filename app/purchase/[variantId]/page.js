import { redirect } from 'next/navigation';
import { CheckCircle2, ShieldCheck, Sparkles, Lock, RefreshCw, Zap, Check, ArrowLeft } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { isLemonConfigured } from '@/lib/config/lemonsqueezy';
import { getVariant } from '@/lib/services/billing/lemonSqueezyClient';
import { getSubscriptionByUser } from '@/lib/services/billing/subscriptionRepository';
import PurchaseActions from '@/components/billing/PurchaseActions';
import { VyradeLogo } from '@/components/VyradeLogo';

// Subscription / checkout confirmation page. The [variantId] route param is a
// Lemon Squeezy VARIANT id. Self-gates auth (/purchase is public in middleware)
// so signed-out visitors go to REGISTRATION with a return path.
export const dynamic = 'force-dynamic';

const fmtDate = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '—');

const TRUST = [
  { icon: Lock, label: 'Secure checkout' },
  { icon: RefreshCw, label: 'Cancel anytime' },
  { icon: Zap, label: 'Instant access' },
];

export default async function PurchasePage({ params, searchParams }) {
  const variantId = params.variantId;

  const user = await getCurrentUser();
  if (!user) redirect(`/register?next=${encodeURIComponent(`/purchase/${variantId}`)}`);

  if (!isLemonConfigured()) {
    return <Shell><Card><div className="p-8 text-center text-muted-foreground">Billing isn’t configured yet.</div></Card></Shell>;
  }

  let product = null;
  let loadError = null;
  try {
    product = await getVariant(variantId);
  } catch (err) {
    loadError = err.message;
  }

  const sub = await getSubscriptionByUser(user.id).catch(() => null);
  const hasSubscription = !!(sub && sub.is_active);
  const justPaid = searchParams?.success === '1';

  if (loadError) {
    return (
      <Shell>
        <Card>
          <div className="p-8 text-center">
            <h1 className="text-lg font-semibold">Plan unavailable</h1>
            <p className="mt-1 text-sm text-muted-foreground">Couldn’t load this plan ({loadError}).</p>
          </div>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      {justPaid && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 shadow-sm dark:text-emerald-400">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span><strong>Payment received.</strong> Your subscription is activating — this can take a few seconds.</span>
        </div>
      )}

      <Card>
        {/* Gradient accent bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-500" />

        <div className="p-8">
          {/* Brand row */}
          <div className="mb-6 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400">
            <Sparkles className="h-4 w-4" /> Vyrade Subscription
          </div>

          {/* Plan header */}
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
              {product.thumb
                ? <img src={product.thumb} alt="" className="h-full w-full object-cover" />
                : <Sparkles className="h-6 w-6" />}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold leading-tight tracking-tight">{product.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {product.variant_name}
                </span>
                {product.interval && (
                  <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                    billed {product.interval}ly
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Price */}
          {product.price_formatted && (
            <div className="mt-6 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tracking-tight text-foreground">{product.price_formatted}</span>
              {product.interval && <span className="text-sm text-muted-foreground">/ {product.interval}</span>}
            </div>
          )}

          {/* Description */}
          {product.description && (
            <div
              className="prose prose-sm mt-4 max-w-none text-muted-foreground dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: product.description }}
            />
          )}

          {/* Trust row */}
          <div className="mt-6 grid grid-cols-3 gap-2">
            {TRUST.map((t) => {
              const Icon = t.icon;
              return (
                <div key={t.label} className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-background/50 py-3 text-center">
                  <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-[11px] font-medium text-muted-foreground">{t.label}</span>
                </div>
              );
            })}
          </div>

          <div className="my-6 h-px bg-border" />

          {/* Action / status */}
          {hasSubscription ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
              <div className="mb-3 flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="h-5 w-5" />
                <span className="font-semibold">You’re already subscribed</span>
              </div>
              <dl className="mb-4 space-y-2 text-sm">
                <Row label="Plan" value={sub.variant_name || sub.product_name || '—'} />
                <Row label="Status" value={<StatusPill status={sub.status} />} raw />
                <Row label="Renews" value={fmtDate(sub.renews_at)} />
                {sub.ends_at && <Row label="Ends" value={fmtDate(sub.ends_at)} />}
              </dl>
              <PurchaseActions variantId={variantId} hasSubscription manageUrl={sub.update_url || sub.customer_portal_url} />
            </div>
          ) : (
            <div className="space-y-3">
              <ul className="space-y-2 text-sm">
                {['Full access to every feature', 'Priority workflow generation', 'Cancel or change plan anytime'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-muted-foreground">
                    <Check className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" /> {f}
                  </li>
                ))}
              </ul>
              <PurchaseActions variantId={variantId} hasSubscription={false} />
              <p className="text-center text-xs text-muted-foreground">
                Signed in as {user.email} · secure checkout via Lemon Squeezy
              </p>
            </div>
          )}
        </div>
      </Card>

      <a href="/" className="mt-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to app
      </a>
    </Shell>
  );
}

/* ── presentational bits ── */

function Shell({ children }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-blue-50/60 to-background px-4 py-10 dark:from-blue-950/20 dark:to-background">
      {/* soft ambient glow */}
      <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="relative w-full max-w-lg">
        <div className="mb-6 flex justify-center">
          <VyradeLogo className="h-7 w-auto" />
        </div>
        {children}
      </div>
    </main>
  );
}

function Card({ children }) {
  return <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg shadow-blue-950/5">{children}</div>;
}

function Row({ label, value, raw }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={raw ? '' : 'font-medium capitalize'}>{value}</dd>
    </div>
  );
}

function StatusPill({ status }) {
  const s = String(status || '').toLowerCase();
  const tone = s === 'active' || s === 'on_trial'
    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400'
    : s === 'cancelled' || s === 'paused' || s === 'past_due'
      ? 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400'
      : 'bg-muted text-muted-foreground border-border';
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${tone}`}>{s.replace('_', ' ') || '—'}</span>;
}
