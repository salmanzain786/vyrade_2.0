'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Check, X, Wand2, FolderSearch, Repeat } from 'lucide-react';

const SIGNAL_LABEL = {
  repeated_name: 'Repeated task', recurring: 'Recurring', copied_across_projects: 'Copied across projects',
  consistent_checklist: 'Consistent checklist', approval_bottleneck: 'Approval bottleneck', reopened: 'Reopened/rework', handoff: 'Multi-person handoff',
};
const STATUS_TONE = {
  suggested: 'border-border text-muted-foreground', reviewing: 'border-blue-500/30 text-blue-600 dark:text-blue-400',
  accepted: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400', blueprint_created: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
  dismissed: 'border-border text-muted-foreground line-through',
};

export default function OpportunityMap({ initialOpportunities, projects }) {
  const router = useRouter();
  const [opps, setOpps] = useState(initialOpportunities || []);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [project, setProject] = useState('');

  async function analyze(mode, proj = null) {
    setBusy(true); setNote(null);
    try {
      const res = await fetch('/api/work/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, project: proj }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setNote(j.note || `Analysed ${j.analyzed} tasks — ${j.detected} opportunit${j.detected === 1 ? 'y' : 'ies'}.`);
      setOpps(j.opportunities?.length ? mergeById(j.opportunities, opps) : opps);
      router.refresh();
    } catch (e) { setNote(e.message); } finally { setBusy(false); }
  }
  async function setStatus(id, status) {
    setOpps((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    await fetch(`/api/work/opportunities/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    router.refresh();
  }
  async function toBlueprint(id) {
    setBusy(true);
    try {
      const res = await fetch(`/api/work/opportunities/${id}/blueprint`, { method: 'POST' });
      const j = await res.json();
      if (res.ok && j.discoveryId) router.push(`/work/discovery/${j.discoveryId}`);
      else { setNote(j.error); setBusy(false); }
    } catch (e) { setNote(e.message); setBusy(false); }
  }

  return (
    <div className="space-y-5">
      {/* 3.4 — the two analysis modes */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <button onClick={() => analyze('recurring')} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"><Repeat className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />Analyse recurring work</button>
        <div className="flex items-end gap-2">
          <label className="flex flex-col text-xs text-muted-foreground">Project
            <select value={project} onChange={(e) => setProject(e.target.value)} className="mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm">
              <option value="">Select…</option>
              {(projects || []).map((p) => <option key={p.project} value={p.project}>{p.project} ({p.count})</option>)}
            </select>
          </label>
          <button onClick={() => analyze('project', project)} disabled={busy || !project} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60"><FolderSearch className="h-4 w-4" />Analyse a project</button>
        </div>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>

      {opps.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No opportunities yet. Run an analysis above — Vyrade looks for recurring names, repeated checklists, copied-across-projects work, approval bottlenecks and rework.</p>
      ) : (
        <ul className="space-y-3">
          {opps.map((o) => (
            <li key={o.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{o.title}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[o.status] || ''}`}>{o.status.replace('_', ' ')}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {SIGNAL_LABEL[o.signal] || o.signal} · {o.task_count} tasks{o.project_count > 1 ? ` · ${o.project_count} projects` : ''}{o.people_count > 1 ? ` · ${o.people_count} people` : ''} · ~{o.est_hours_month}h/mo <span className="text-[10px]">(est)</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {o.status === 'reviewing' && o.discovery_id ? (
                    <a href={`/work/discovery/${o.discovery_id}`} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent">Continue discovery →</a>
                  ) : o.status === 'accepted' ? (
                    <button onClick={() => toBlueprint(o.id)} disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"><Wand2 className="h-3.5 w-3.5" />Create Blueprint</button>
                  ) : o.status === 'suggested' ? (
                    <>
                      <button onClick={() => setStatus(o.id, 'accepted')} className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 px-2.5 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"><Check className="h-3.5 w-3.5" />Confirm</button>
                      <button onClick={() => setStatus(o.id, 'dismissed')} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent"><X className="h-3.5 w-3.5" />Dismiss</button>
                    </>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">Detected opportunities are suggestions — a person confirms one before it becomes a Blueprint. Nothing is auto-approved.</p>
    </div>
  );
}

function mergeById(fresh, existing) {
  const byKey = new Map(existing.map((o) => [`${o.signal}:${o.pattern_key}`, o]));
  for (const f of fresh) { const k = `${f.signal}:${f.pattern_key}`; if (!byKey.has(k)) byKey.set(k, { ...f, id: f.id || k, status: 'suggested' }); }
  return [...byKey.values()];
}
