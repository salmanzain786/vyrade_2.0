'use client';

import { useState } from 'react';
import { RefreshCw, ExternalLink, Link2 } from 'lucide-react';

// Blueprint ↔ task write-back (Phase 4.2/4.3), on the Blueprint report.
export default function WriteBackPanel({ blueprintId, link }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const taskUrl = link?.task_url || null;

  async function sync() {
    setBusy(true); setResult(null);
    try {
      const res = await fetch(`/api/blueprints/${blueprintId}/sync-progress`, { method: 'POST' });
      const j = await res.json();
      setResult({ ok: res.ok, ...j });
    } catch (e) { setResult({ ok: false, error: e.message }); } finally { setBusy(false); }
  }

  return (
    <div className="mb-8 rounded-lg border border-border bg-card p-4 print:hidden">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Link2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />Originating task</span>
        {taskUrl && <a href={taskUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">Open task <ExternalLink className="h-3.5 w-3.5" /></a>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">This Blueprint originated from a {link?.platform || 'task-platform'} task. Progress syncs automatically as it advances (after generation, scanning, deployment); use this to sync on demand.</p>

      <div className="mt-3 flex items-center gap-3">
        <button onClick={sync} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border border-blue-600/40 bg-blue-600/10 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-600/20 disabled:opacity-60 dark:text-blue-400">
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />{busy ? 'Syncing…' : 'Sync progress to task'}
        </button>
        {link?.last_stage && <span className="text-[11px] text-muted-foreground">Last synced: {link.last_stage.replace(/_/g, ' ')}</span>}
      </div>

      {result && (
        <div className={`mt-3 rounded-md border p-2.5 text-xs ${result.ok ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400' : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400'}`}>
          {result.reason === 'write_back_disabled'
            ? <>Write-back is disabled for this connection. Enable it in <a href="/integrations/task-management" className="underline">connection settings</a> (it’s a separate permission from read).</>
            : result.ok
              ? (result.wrote ? `Posted “${result.stage?.label}” to the task.` : `Already up to date (${result.stage?.label}).`)
              : (result.error || `Could not sync (${result.reason}).`)}
        </div>
      )}
    </div>
  );
}
