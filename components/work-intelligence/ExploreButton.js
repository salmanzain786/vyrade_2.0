'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2 } from 'lucide-react';

// "Explore Automation With Vyrade" (Phase 2.1) — starts a discovery session for
// a task and navigates to the clarification flow.
export default function ExploreButton({ ingestedTaskId, small }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function explore() {
    setBusy(true);
    try {
      const res = await fetch('/api/work/discovery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ingestedTaskId }) });
      const j = await res.json();
      if (res.ok && j.session?.id) router.push(`/work/discovery/${j.session.id}`);
      else setBusy(false);
    } catch { setBusy(false); }
  }

  return (
    <button onClick={explore} disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-md bg-blue-600 font-medium text-white hover:bg-blue-700 disabled:opacity-60 ${small ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'}`}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
      {busy ? 'Starting…' : 'Explore Automation'}
    </button>
  );
}
