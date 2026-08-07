'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Copy, Check } from 'lucide-react';

const ROLES = [['member', 'Member'], ['manager', 'Manager'], ['admin', 'Admin']];

export default function InviteForm({ departments = [] }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [department, setDepartment] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  async function invite(e) {
    e.preventDefault();
    setBusy(true); setError(null); setLink(null);
    try {
      const res = await fetch('/api/org/invitations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role, department: department || null }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not create invitation');
      setLink(j.accept_url); setEmail(''); router.refresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-muted-foreground">Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" className="mt-1 w-56 rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col text-xs text-muted-foreground">Role
          <select value={role} onChange={(e) => setRole(e.target.value)} className="mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm">{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label className="flex flex-col text-xs text-muted-foreground">Department
          <select value={department} onChange={(e) => setDepartment(e.target.value)} className="mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"><option value="">—</option>{departments.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select>
        </label>
        <button disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"><UserPlus className="h-4 w-4" />{busy ? 'Inviting…' : 'Invite'}</button>
      </form>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {link && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-blue-500/30 bg-blue-500/5 p-2 text-xs">
          <span className="text-muted-foreground">Invite link (share it):</span>
          <code className="truncate">{link}</code>
          <button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="ml-auto inline-flex items-center gap-1 rounded border border-border px-2 py-0.5">{copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}{copied ? 'Copied' : 'Copy'}</button>
        </div>
      )}
    </div>
  );
}
