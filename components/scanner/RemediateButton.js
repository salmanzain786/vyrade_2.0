'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wand2 } from 'lucide-react';

// "Regenerate from Blueprint to fix findings" (Phase 7.1) → reassess (7.3).
// This triggers a real LLM regeneration, so it confirms first.
export default function RemediateButton({ blueprintId }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function remediate() {
    if (!window.confirm('Regenerate this workflow to address the scan findings? This rebuilds the workflow via Vyrade’s generator and then re-scans it.')) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch('/api/scanner/remediate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blueprintId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Remediation failed (${res.status})`);
      setResult(j);
      router.refresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={remediate}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-100 disabled:opacity-60"
      >
        <Wand2 className="h-4 w-4" />{busy ? 'Regenerating & re-scanning…' : 'Regenerate to fix findings'}
      </button>
      {error && <span className="max-w-xs text-right text-[11px] text-red-600 dark:text-red-400">{error}</span>}
      {result && (
        <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
          {result.diff?.counts?.resolved ?? 0} resolved{result.auto_resolved ? ' (auto-marked)' : ''} · readiness {result.before?.readiness_pct}% → {result.after?.readiness_pct}%
        </span>
      )}
    </div>
  );
}
