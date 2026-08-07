'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket, Power, PowerOff, LineChart, CheckCircle2 } from 'lucide-react';

const PLATFORMS = [['n8n', 'n8n'], ['make', 'Make'], ['zapier', 'Zapier'], ['claude', 'Claude Code'], ['custom', 'Custom / other']];
const input = 'rounded-md border border-border bg-background px-2 py-1.5 text-sm';

export default function ImplementationPanel({ blueprintId }) {
  const router = useRouter();
  const [impl, setImpl] = useState(undefined); // undefined=loading, null=none
  const [platform, setPlatform] = useState('n8n');
  const [deployedAt, setDeployedAt] = useState('');
  const [owner, setOwner] = useState('');
  const [usage, setUsage] = useState('');
  const [saved, setSaved] = useState('');
  const [perRun, setPerRun] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/blueprints/${blueprintId}/implementation`).then((r) => r.json()).then((j) => {
      setImpl(j.implementation || null);
      if (j.implementation) {
        setPlatform(j.implementation.platform || 'n8n');
        setOwner(j.implementation.owner || '');
        setUsage(j.implementation.usage_volume ?? '');
        setSaved(j.implementation.time_saved_hours ?? '');
        setPerRun(j.implementation.minutes_saved_per_run ?? '');
        setNotes(j.implementation.outcome_notes || '');
      }
    }).catch(() => setImpl(null));
  }, [blueprintId]);

  async function call(method, body) {
    setBusy(true);
    try {
      const res = await fetch(`/api/blueprints/${blueprintId}/implementation`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const j = await res.json();
      setImpl(j.implementation);
      router.refresh();
    } finally { setBusy(false); }
  }

  if (impl === undefined) return null;

  return (
    <section className="mb-8 rounded-lg border border-border bg-card p-4 print:hidden">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Rocket className="h-4 w-4 text-blue-600 dark:text-blue-400" />Implementation tracking</h2>

      {!impl?.implemented ? (
        /* 3.1 — confirm implemented */
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs text-muted-foreground">Platform
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={`mt-1 ${input}`}>{PLATFORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          <label className="flex flex-col text-xs text-muted-foreground">Deployed on
            <input type="date" value={deployedAt} onChange={(e) => setDeployedAt(e.target.value)} className={`mt-1 ${input}`} />
          </label>
          <label className="flex flex-col text-xs text-muted-foreground">Owner
            <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="name / email" className={`mt-1 ${input}`} />
          </label>
          <button disabled={busy} onClick={() => call('POST', { platform, deployed_at: deployedAt || null, owner: owner || null })} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            <CheckCircle2 className="h-4 w-4" /> Confirm implemented
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* status row */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Implemented</span>
            <span className="text-muted-foreground">{impl.platform || '—'}{impl.deployed_at ? ` · ${new Date(impl.deployed_at).toLocaleDateString()}` : ''}{impl.owner ? ` · ${impl.owner}` : ''}</span>
            {/* 3.2 active toggle */}
            <button disabled={busy} onClick={() => call('PATCH', { active: !impl.active })} className={`ml-auto inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium ${impl.active ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'border-border text-muted-foreground'}`}>
              {impl.active ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}{impl.active ? 'Active' : 'Inactive'}
            </button>
          </div>

          {/* 3.3 outcome report */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><LineChart className="h-3.5 w-3.5" /> Outcomes {impl.measured && <span className="rounded bg-blue-600/10 px-1.5 py-0.5 text-[10px] text-blue-600 dark:text-blue-400">Measured</span>}</div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col text-xs text-muted-foreground">Runs / month<input type="number" min="0" value={usage} onChange={(e) => setUsage(e.target.value)} className={`mt-1 w-28 ${input}`} /></label>
              <label className="flex flex-col text-xs text-muted-foreground">Hours saved / month<input type="number" min="0" value={saved} onChange={(e) => setSaved(e.target.value)} className={`mt-1 w-32 ${input}`} /></label>
              <label className="flex flex-col text-xs text-muted-foreground" title="With telemetry connected, this rate × measured run volume gives a real hours-saved figure.">Minutes saved / run<input type="number" min="0" value={perRun} onChange={(e) => setPerRun(e.target.value)} className={`mt-1 w-32 ${input}`} /></label>
              <label className="flex flex-1 flex-col text-xs text-muted-foreground">Notes<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="what's working / not" className={`mt-1 ${input}`} /></label>
              <button disabled={busy} onClick={() => call('PUT', { usage_volume: usage === '' ? null : Number(usage), time_saved_hours: saved === '' ? null : Number(saved), minutes_saved_per_run: perRun === '' ? null : Number(perRun), notes: notes || null })} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent">Save outcomes</button>
            </div>
            <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-400">Runs/hours are self-reported. Set <strong>minutes saved / run</strong> and connect telemetry to get a <em>measured</em> hours-saved figure (rate × real run volume).</p>
          </div>
        </div>
      )}
    </section>
  );
}
