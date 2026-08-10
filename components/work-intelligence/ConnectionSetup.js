'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Unplug, ShieldCheck, Eye, Database, Clock, RefreshCw, UserMinus, Trash2 } from 'lucide-react';

const Toggle = ({ label, hint, checked, onChange, danger }) => (
  <label className="flex items-start gap-2.5 py-1.5">
    <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} className={`mt-0.5 h-4 w-4 ${danger ? 'accent-red-600' : 'accent-blue-600'}`} />
    <span><span className="text-sm">{label}</span>{hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}</span>
  </label>
);
const sel = 'rounded-md border border-border bg-background px-2 py-1.5 text-sm';

export default function ConnectionSetup({ platform, connection }) {
  const router = useRouter();
  const [scope, setScope] = useState(connection.scope);
  const [gov, setGov] = useState(connection.governance);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [optouts, setOptouts] = useState([]);
  const [optEmail, setOptEmail] = useState('');

  const setField = (k, v) => setScope((s) => ({ ...s, fields: { ...s.fields, [k]: v } }));
  const setRule = (k, v) => setScope((s) => ({ ...s, sensitive_rules: { ...s.sensitive_rules, [k]: v } }));
  const setList = (k, v) => setScope((s) => ({ ...s, [k]: v.split(',').map((x) => x.trim()).filter(Boolean) }));

  const loadOptouts = () => fetch(`/api/integrations/${platform}/optouts`).then((r) => r.json()).then((j) => setOptouts(j.optouts || [])).catch(() => {});
  useEffect(() => { loadOptouts(); }, []); // eslint-disable-line

  async function syncNow() {
    setSyncing(true); setSyncResult(null);
    try {
      const res = await fetch(`/api/integrations/${platform}/sync`, { method: 'POST' });
      const j = await res.json();
      setSyncResult(res.ok ? j : { error: j.error || 'Sync failed' });
      router.refresh();
    } catch (e) { setSyncResult({ error: e.message }); } finally { setSyncing(false); }
  }
  async function addOptout() {
    if (!optEmail.trim()) return;
    await fetch(`/api/integrations/${platform}/optouts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee: optEmail.trim() }) });
    setOptEmail(''); loadOptouts();
  }
  async function removeOptout(ref) {
    await fetch(`/api/integrations/${platform}/optouts?ref=${encodeURIComponent(ref)}`, { method: 'DELETE' });
    loadOptouts();
  }

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/integrations/${platform}/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, governance: gov }) });
      if (!res.ok) throw new Error('Save failed');
      setMsg('Saved'); router.refresh();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function disconnect() {
    if (!window.confirm('Disconnect and delete stored tokens? Ingested task content will be removed on its retention schedule.')) return;
    await fetch(`/api/integrations/${platform}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <div className="text-sm"><span className="font-medium text-emerald-700 dark:text-emerald-400">Connected</span> · {connection.account_name || platform}</div>
        <button onClick={disconnect} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400"><Unplug className="h-3.5 w-3.5" /> Disconnect</button>
      </div>

      {/* 1.3 Scope */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Database className="h-4 w-4 text-blue-600 dark:text-blue-400" />Read scope</h2>
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <div>
            <h3 className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fields analysed</h3>
            <Toggle label="Description" checked={scope.fields.description} onChange={(v) => setField('description', v)} />
            <Toggle label="Checklist" checked={scope.fields.checklist} onChange={(v) => setField('checklist', v)} />
            <Toggle label="Status history" checked={scope.fields.status_history} onChange={(v) => setField('status_history', v)} />
            <Toggle label="Comments" hint="may contain sensitive discussion" checked={scope.fields.comments} onChange={(v) => setField('comments', v)} />
            <Toggle label="Attachments" hint="never processed unless enabled" checked={scope.fields.attachments} onChange={(v) => setField('attachments', v)} />
            <Toggle label="Custom fields" checked={scope.fields.custom_fields} onChange={(v) => setField('custom_fields', v)} />
          </div>
          <div>
            <h3 className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Permissions & limits</h3>
            <Toggle label="Read enabled" checked={scope.read_enabled} onChange={(v) => setScope((s) => ({ ...s, read_enabled: v }))} />
            <Toggle label="Allow write-back" hint="separate consent — Vyrade can create/update tasks" danger checked={scope.write_back_enabled} onChange={(v) => setScope((s) => ({ ...s, write_back_enabled: v }))} />
            <label className="flex items-center justify-between py-1.5 text-sm">Historical range (days)
              <input type="number" min="0" value={scope.historical_range_days} onChange={(e) => setScope((s) => ({ ...s, historical_range_days: Number(e.target.value) }))} className={`w-24 ${sel}`} />
            </label>
            <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sensitive-data rules</h3>
            <Toggle label="Redact secrets" checked={scope.sensitive_rules.redact_secrets} onChange={(v) => setRule('redact_secrets', v)} />
            <Toggle label="Redact emails / PII" checked={scope.sensitive_rules.redact_emails} onChange={(v) => setRule('redact_emails', v)} />
            <Toggle label="Exclude personal projects" checked={scope.sensitive_rules.exclude_personal_projects} onChange={(v) => setRule('exclude_personal_projects', v)} />
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Included projects / lists <span className="text-[11px] text-muted-foreground">(IDs, comma-separated)</span>
            <input value={(scope.projects || []).join(', ')} onChange={(e) => setList('projects', e.target.value)} placeholder="e.g. 901100234, 901100987" className={`mt-1 w-full ${sel}`} />
          </label>
          <label className="block text-sm">Excluded projects / lists
            <input value={(scope.excluded_projects || []).join(', ')} onChange={(e) => setList('excluded_projects', e.target.value)} placeholder="IDs to always skip" className={`mt-1 w-full ${sel}`} />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Vyrade reads only the included lists (minus exclusions). Until at least one is added, nothing is read.</p>
      </section>

      {/* 1.4 Governance & consent */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />Governance &amp; consent</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col text-sm"><span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-muted-foreground" />Retention (days)</span>
            <input type="number" min="1" value={gov.retention_days} onChange={(e) => setGov((g) => ({ ...g, retention_days: Number(e.target.value) }))} className={`mt-1 ${sel}`} />
            <span className="mt-0.5 text-[11px] text-muted-foreground">Ingested task content is deleted after this window.</span>
          </label>
          <label className="flex flex-col text-sm"><span className="flex items-center gap-1.5"><Eye className="h-3.5 w-3.5 text-muted-foreground" />Who sees opportunities</span>
            <select value={gov.opportunity_visibility} onChange={(e) => setGov((g) => ({ ...g, opportunity_visibility: e.target.value }))} className={`mt-1 ${sel}`}>
              <option value="managers">Managers</option>
              <option value="admins">Admins only</option>
              <option value="employee_and_managers">Employee &amp; managers</option>
            </select>
          </label>
          <label className="flex flex-col text-sm">Employee notification
            <select value={gov.employee_notification} onChange={(e) => setGov((g) => ({ ...g, employee_notification: e.target.value }))} className={`mt-1 ${sel}`}>
              <option value="notify">Notify employees</option>
              <option value="consent_required">Require employee consent</option>
              <option value="silent">Silent (not recommended)</option>
            </select>
          </label>
          <label className="flex flex-col text-sm">Consent mode
            <select value={gov.consent_mode} onChange={(e) => setGov((g) => ({ ...g, consent_mode: e.target.value }))} className={`mt-1 ${sel}`}>
              <option value="org_authorized">Org-authorised</option>
              <option value="employee_opt_in">Employee opt-in</option>
            </select>
          </label>
        </div>
        <Toggle label="Infer individual performance" hint="OFF by design — Vyrade analyses work patterns, not who is “inefficient.”" danger checked={gov.analyze_personal_performance} onChange={(v) => setGov((g) => ({ ...g, analyze_personal_performance: v }))} />
      </section>

      {/* Employee opt-outs (1.4) */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><UserMinus className="h-4 w-4 text-blue-600 dark:text-blue-400" />Employee opt-outs</h2>
        <p className="mb-2 text-[11px] text-muted-foreground">Any task assigned to an opted-out person is excluded from analysis. Identities are stored hashed — only a hint is shown.</p>
        <div className="flex items-end gap-2">
          <input value={optEmail} onChange={(e) => setOptEmail(e.target.value)} placeholder="employee@company.com" className={`w-64 ${sel}`} />
          <button onClick={addOptout} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent">Add opt-out</button>
        </div>
        {optouts.length > 0 && (
          <ul className="mt-3 space-y-1">
            {optouts.map((o) => (
              <li key={o.employee_ref} className="flex items-center gap-3 rounded-md border border-border px-3 py-1.5 text-xs">
                <code>{o.hint}</code>
                <button onClick={() => removeOptout(o.employee_ref)} className="ml-auto text-muted-foreground hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Save + Sync */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"><Save className="h-4 w-4" />{busy ? 'Saving…' : 'Save scope & governance'}</button>
        <button onClick={syncNow} disabled={syncing} className="inline-flex items-center gap-1.5 rounded-md border border-blue-600/40 bg-blue-600/10 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-600/20 disabled:opacity-60 dark:text-blue-400"><RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />{syncing ? 'Syncing…' : 'Sync now'}</button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
      {syncResult && (
        <div className={`rounded-lg border p-3 text-xs ${syncResult.error ? 'border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400' : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'}`}>
          {syncResult.error
            ? syncResult.error
            : syncResult.note
              ? syncResult.note
              : `Synced ${syncResult.lists_synced} list(s): ${syncResult.tasks_ingested} task(s) ingested, ${syncResult.tasks_excluded_optout} excluded by opt-out. Save scope first if you changed project IDs.`}
        </div>
      )}
    </div>
  );
}
