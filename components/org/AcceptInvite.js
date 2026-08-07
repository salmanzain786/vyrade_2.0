'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AcceptInvite() {
  const router = useRouter();
  const token = useSearchParams().get('token') || '';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function accept() {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/org/invitations/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not accept invitation');
      setDone(true);
      router.push('/org'); router.refresh();
    } catch (e) { setError(e.message); setBusy(false); }
  }

  if (!token) return <p className="text-sm text-red-600 dark:text-red-400">This invite link is missing its token.</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">You’ve been invited to join an organisation on Vyrade.</p>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button onClick={accept} disabled={busy || done} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
        {busy ? 'Joining…' : done ? 'Joined!' : 'Accept invitation'}
      </button>
    </div>
  );
}
