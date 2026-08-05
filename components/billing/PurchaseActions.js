'use client';

import { useState } from 'react';
import { Loader2, ExternalLink } from 'lucide-react';

// Buy-Now (opens a Lemon Squeezy checkout) or Manage (opens the customer portal).
export default function PurchaseActions({ variantId, hasSubscription, manageUrl }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function buyNow() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not start checkout.');
      window.location.assign(data.url);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const btn = 'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60';

  if (hasSubscription) {
    return (
      <div className="space-y-2">
        {manageUrl ? (
          <a href={manageUrl} target="_blank" rel="noopener noreferrer" className={btn}>
            Manage / Update subscription <ExternalLink className="h-4 w-4" />
          </a>
        ) : (
          <p className="text-sm text-muted-foreground">Manage your subscription from your Lemon Squeezy receipt email.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button onClick={buyNow} disabled={busy} className={btn}>
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting checkout…</> : 'Buy Now'}
      </button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
