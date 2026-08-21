'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const OPTIONS = [
  ['suggested', 'Suggested'], ['discovered', 'Looked at'], ['considered', 'Considering'],
  ['in_progress', 'In progress'], ['addressed', 'Addressed'], ['dismissed', 'Not relevant'],
];
// Tone applied to the trigger so the current status reads at a glance.
const TONE = {
  suggested: 'border-border text-muted-foreground',
  discovered: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  considered: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  in_progress: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  addressed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
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
    <Select value={status} onValueChange={change} disabled={busy}>
      <SelectTrigger
        className={`h-7 w-[130px] rounded-full px-3 text-[11px] font-medium shadow-none ${TONE[status] || TONE.suggested}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map(([v, l]) => <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
