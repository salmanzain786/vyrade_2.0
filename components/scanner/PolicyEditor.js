'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SlidersHorizontal, Save, ChevronDown, ChevronRight } from 'lucide-react';

// Affirmative constraint rows (checked = the constraint is ON). Some map to an
// inverted allow_* flag so the stored policy stays permissive-by-default.
const Toggle = ({ label, hint, checked, onChange }) => (
  <label className="flex items-start gap-2.5 py-1.5">
    <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-600" />
    <span>
      <span className="text-sm">{label}</span>
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </span>
  </label>
);
const NumField = ({ label, value, onChange, placeholder }) => (
  <label className="flex items-center justify-between gap-2 py-1.5 text-sm">
    <span>{label}</span>
    <input type="number" min="0" value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className="w-24 rounded border border-border bg-background px-2 py-1 text-sm" />
  </label>
);
const ListField = ({ label, value, onChange, placeholder }) => (
  <label className="block py-1.5 text-sm">
    <span>{label}</span>
    <input type="text" value={(value || []).join(', ')} placeholder={placeholder} onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
      className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm" />
  </label>
);

export default function PolicyEditor({ blueprintId }) {
  const router = useRouter();
  const [policy, setPolicy] = useState(null);
  const [defined, setDefined] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    fetch(`/api/scanner/policy?blueprintId=${encodeURIComponent(blueprintId)}`)
      .then((r) => r.json())
      .then((j) => { setPolicy(j.policy); setDefined(!!j.defined); })
      .catch(() => setMsg('Could not load policy'));
  }, [blueprintId]);

  const set = (path, val) => setPolicy((p) => {
    const next = structuredClone(p);
    let o = next; const keys = path.split('.');
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = val;
    return next;
  });

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/scanner/policy', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blueprintId, policy }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Save failed (${res.status})`);
      const j = await res.json();
      setPolicy(j.policy); setDefined(true); setMsg('Saved');
      router.refresh(); // re-run the scan against the new policy
    } catch (e) { setMsg(e.message); } finally { setSaving(false); }
  }

  if (!policy) return null;

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-5">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-sm font-semibold">
        <span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-blue-600 dark:text-blue-400" />Approved policy {defined ? '' : <span className="ml-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">not defined</span>}</span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {open && (
        <div className="mt-4">
          <label className="mb-3 flex items-center gap-2.5 rounded-lg border border-blue-500/30 bg-blue-500/5 p-2.5">
            <input type="checkbox" checked={!!policy.enabled} onChange={(e) => set('enabled', e.target.checked)} className="h-4 w-4 accent-blue-600" />
            <span className="text-sm font-medium">Enforce this policy — compare every scan against it</span>
          </label>

          <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
            <div>
              <h3 className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Data handling</h3>
              <Toggle label="Forbid external AI models" hint="No hosted third-party LLMs (OpenAI, Anthropic, …)" checked={!policy.data_handling.allow_external_ai_models} onChange={(v) => set('data_handling.allow_external_ai_models', !v)} />
              <Toggle label="Forbid customer data to third parties" checked={!policy.data_handling.allow_customer_data_to_third_party} onChange={(v) => set('data_handling.allow_customer_data_to_third_party', !v)} />

              <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform</h3>
              <Toggle label="Require self-hosted only" hint="No dependence on hosted SaaS services" checked={policy.platform_policy.hosting === 'self_hosted'} onChange={(v) => set('platform_policy.hosting', v ? 'self_hosted' : 'any')} />
              <ListField label="Forbidden platforms" value={policy.platform_policy.forbidden_platforms} onChange={(v) => set('platform_policy.forbidden_platforms', v)} placeholder="e.g. slack, telegram" />
              <ListField label="Required platforms" value={policy.platform_policy.required_platforms} onChange={(v) => set('platform_policy.required_platforms', v)} placeholder="e.g. salesforce" />
            </div>
            <div>
              <h3 className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Credentials & errors</h3>
              <Toggle label="Require org-owned credentials" checked={policy.credential_policy.require_org_owned} onChange={(v) => set('credential_policy.require_org_owned', v)} />
              <Toggle label="Require error-handling branch" checked={policy.error_handling.require_error_branch} onChange={(v) => set('error_handling.require_error_branch', v)} />
              <NumField label="Max retries" value={policy.error_handling.max_retries} onChange={(v) => set('error_handling.max_retries', v)} placeholder="none" />

              <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Approvals, alerting & logging</h3>
              <Toggle label="Require human approval" checked={policy.approvals.require_human_approval} onChange={(v) => set('approvals.require_human_approval', v)} />
              <ListField label="Approval required before" value={policy.approvals.approval_actions} onChange={(v) => set('approvals.approval_actions', v)} placeholder="e.g. refunds, external comms" />
              <Toggle label="Require incident alerting" checked={policy.alerting.require_incident_alert} onChange={(v) => set('alerting.require_incident_alert', v)} />
              <Toggle label="Forbid sensitive data in logs" checked={policy.logging.forbid_sensitive_logging} onChange={(v) => set('logging.forbid_sensitive_logging', v)} />
              <NumField label="Max log retention (days)" value={policy.logging.max_log_retention_days} onChange={(v) => set('logging.max_log_retention_days', v)} placeholder="none" />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60">
              <Save className="h-3.5 w-3.5" />{saving ? 'Saving…' : 'Save policy & re-scan'}
            </button>
            {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
