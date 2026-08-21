'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
    <Select value={status} onValueChange={change} disabled={busy}>
      <SelectTrigger className={`h-7 w-[130px] rounded-full px-3 text-xs font-medium shadow-none ${TONE[status] || TONE.open}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
