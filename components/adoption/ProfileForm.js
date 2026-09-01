'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const DEPARTMENTS = [
  ['marketing', 'Marketing'], ['sales', 'Sales'], ['finance', 'Finance'], ['support', 'Customer Support'],
  ['operations', 'Operations'], ['hr', 'People / HR'], ['it', 'IT'], ['product', 'Product'], ['general', 'Other / Cross-functional'],
];
const SIZES = [['solo', 'Just me'], ['small', '2–50'], ['mid', '51–500'], ['large', '501–5,000'], ['enterprise', '5,000+']];
const SKILLS = [['no_code', 'No-code (I use visual tools)'], ['low_code', 'Low-code (some formulas/logic)'], ['technical', 'Technical (APIs, scripting)'], ['developer', 'Developer']];

const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="text-sm font-medium">{label}</span>
    {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    <div className="mt-1">{children}</div>
  </label>
);
const input = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm transition-colors focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

// shadcn Select styled to match the text inputs above.
const SelectBox = ({ value, onChange, options, placeholder = 'Select…' }) => (
  <Select value={value || undefined} onValueChange={onChange}>
    <SelectTrigger className="h-auto rounded-lg py-2 shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-0"><SelectValue placeholder={placeholder} /></SelectTrigger>
    <SelectContent>
      {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
    </SelectContent>
  </Select>
);

export default function ProfileForm({ compact = false }) {
  const router = useRouter();
  const [p, setP] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    fetch('/api/profile').then((r) => r.json()).then((j) => setP(j.profile || {})).catch(() => setP({}));
  }, []);

  const set = (k, v) => setP((prev) => ({ ...prev, [k]: v }));
  const setList = (k, v) => set(k, v.split(',').map((s) => s.trim()).filter(Boolean));
  const listVal = (k) => (Array.isArray(p?.[k]) ? p[k].join(', ') : '');

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (!res.ok) throw new Error('Save failed');
      const j = await res.json();
      setP(j.profile); setMsg('Saved');
      router.push('/dashboard'); router.refresh();
    } catch (e) { setMsg(e.message); } finally { setSaving(false); }
  }

  if (!p) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Role" hint="e.g. Marketing Manager"><input className={input} value={p.role || ''} onChange={(e) => set('role', e.target.value)} placeholder="Marketing Manager" /></Field>
        <Field label="Department"><SelectBox value={p.department} onChange={(v) => set('department', v)} options={DEPARTMENTS} /></Field>
        <Field label="Industry" hint="e.g. SaaS, e-commerce, agency"><input className={input} value={p.industry || ''} onChange={(e) => set('industry', e.target.value)} placeholder="SaaS" /></Field>
        <Field label="Company size"><SelectBox value={p.company_size} onChange={(v) => set('company_size', v)} options={SIZES} /></Field>
      </div>

      {!compact && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Job title"><input className={input} value={p.job_title || ''} onChange={(e) => set('job_title', e.target.value)} /></Field>
          <Field label="Technical skill level"><SelectBox value={p.technical_skill} onChange={(v) => set('technical_skill', v)} options={SKILLS} /></Field>
          <Field label="Main responsibilities" hint="comma-separated"><input className={input} value={listVal('responsibilities')} onChange={(e) => setList('responsibilities', e.target.value)} placeholder="reporting, campaigns, lead gen" /></Field>
          <Field label="Current AI tools" hint="comma-separated"><input className={input} value={listVal('current_ai_tools')} onChange={(e) => setList('current_ai_tools', e.target.value)} placeholder="ChatGPT, Copilot" /></Field>
          <Field label="Automation platforms" hint="comma-separated"><input className={input} value={listVal('automation_platforms')} onChange={(e) => setList('automation_platforms', e.target.value)} placeholder="Zapier, Make" /></Field>
          <Field label="Main bottlenecks" hint="comma-separated"><input className={input} value={listVal('bottlenecks')} onChange={(e) => setList('bottlenecks', e.target.value)} placeholder="manual data entry, reporting" /></Field>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60">
          <Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save profile'}
        </button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
      <p className="text-[11px] text-muted-foreground">The minimum — role, department, industry — personalises your opportunity map. The rest sharpens recommendations and your skills view.</p>
    </div>
  );
}
