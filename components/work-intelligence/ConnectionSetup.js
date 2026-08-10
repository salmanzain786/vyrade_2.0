'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Unplug, ShieldCheck, Eye, Database, Clock } from 'lucide-react';

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

  const setField = (k, v) => setScope((s) => ({ ...s, fields: { ...s.fields, [k]: v } }));
  const setRule = (k, v) => setScope((s) => ({ ...s, sensitive_rules: { ...s.sensitive_rules, [k]: v } }));

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
        <p className="mt-2 text-[11px] text-muted-foreground">Projects/lists are selected per workspace once you pick which to include — until then, nothing is read.</p>
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

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"><Save className="h-4 w-4" />{busy ? 'Saving…' : 'Save scope & governance'}</button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}
