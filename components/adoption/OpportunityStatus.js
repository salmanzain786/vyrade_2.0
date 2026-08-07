'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const OPTIONS = [
  ['suggested', 'Suggested'], ['discovered', 'Looked at'], ['considered', 'Considering'],
  ['in_progress', 'In progress'], ['addressed', 'Addressed'], ['dismissed', 'Not relevant'],
];
const TONE = {
  suggested: 'border-border text-muted-foreground',
  discovered: 'border-blue-500/30 text-blue-600 dark:text-blue-400',
  considered: 'border-blue-500/30 text-blue-600 dark:text-blue-400',
  in_progress: 'border-amber-500/30 text-amber-600 dark:text-amber-400',
  addressed: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
  dismissed: 'border-border text-muted-foreground line-through',
};

export default function OpportunityStatus({ areaKey, initial = 'suggested' }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function change(next) {
    const prev = status; setStatus(next); setBusy(true);
    try {
      const res = await fetch('/api/adoption/opportunities', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ areaKey, status: next }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch { setStatus(prev); } finally { setBusy(false); }
  }

  return (
    <select value={status} disabled={busy} onChange={(e) => change(e.target.value)}
      className={`rounded-full border bg-transparent px-2 py-0.5 text-[11px] font-medium ${TONE[status] || TONE.suggested}`} title="Status">
      {OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
