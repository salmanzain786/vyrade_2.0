'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Cog, Loader2, CheckCircle2, ArrowRight, AlertCircle } from 'lucide-react';

// Report-page action for building the workflow from a Blueprint (Phase-2 UX gap
// fix — the report was read-only with no hint where generation happens).
export default function GenerateWorkflowPanel({ blueprintId, version, sessionId, status, readinessScore, hasWorkflow, isCurrent }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(hasWorkflow);
  const complete = status === 'requirements_complete';
  const chatHref = sessionId ? `/chat/${sessionId}` : null;

  async function generate() {
    if (!window.confirm('Generate the n8n workflow from this Blueprint? This runs Vyrade’s generator (a billed AI step).')) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/blueprints/${blueprintId}/generate-workflow`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Generation failed (${res.status})`);
      setDone(true);
      router.refresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="mb-8 rounded-lg border border-border bg-card p-4 print:hidden">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Cog className="h-4 w-4 text-blue-600 dark:text-blue-400" />Workflow</div>

      {done ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Workflow generated.</span>
          {chatHref && <a href={chatHref} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent">Open in workspace to view / download <ArrowRight className="h-4 w-4" /></a>}
        </div>
      ) : complete ? (
        <div className="mt-3">
          <p className="text-sm text-muted-foreground">This Blueprint is ready. Generate the automation workflow from it.</p>
          {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="mt-3 flex items-center gap-3">
            <button onClick={generate} disabled={busy || !isCurrent} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cog className="h-4 w-4" />}{busy ? 'Generating…' : 'Generate workflow'}
            </button>
            {!isCurrent && <span className="text-[11px] text-amber-700 dark:text-amber-400">This isn’t the current version — open the workspace to generate from the latest.</span>}
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            This Blueprint needs more detail before a workflow can be generated{typeof readinessScore === 'number' ? ` (readiness ${readinessScore}%)` : ''}. Answer the remaining questions in the workspace to complete it.
          </p>
          {chatHref && <a href={chatHref} className="mt-3 inline-flex items-center gap-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Continue in workspace <ArrowRight className="h-4 w-4" /></a>}
        </div>
      )}
    </div>
  );
}
