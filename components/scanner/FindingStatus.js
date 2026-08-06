'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'accepted_risk', label: 'Accepted risk' },
];
const TONE = {
  open: 'border-border text-muted-foreground',
  in_progress: 'border-blue-500/30 text-blue-600 dark:text-blue-400',
  resolved: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
  accepted_risk: 'border-amber-500/30 text-amber-600 dark:text-amber-400',
};

// Per-finding resolution control (Phase 7.2).
export default function FindingStatus({ blueprintId, type, node = null, initial = 'open' }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function change(next) {
    const prev = status;
    setStatus(next); setBusy(true);
    try {
      const res = await fetch('/api/scanner/resolution', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blueprintId, type, node, status: next }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch { setStatus(prev); } finally { setBusy(false); }
  }

  return (
    <select
      value={status}
      disabled={busy}
      onChange={(e) => change(e.target.value)}
      className={`rounded-full border bg-transparent px-2 py-0.5 text-[11px] font-medium ${TONE[status] || TONE.open}`}
      title="Resolution status"
    >
      {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
