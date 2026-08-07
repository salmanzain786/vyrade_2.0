'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2 } from 'lucide-react';

export default function CreateOrgForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function create(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/org', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not create organisation');
      router.push('/org'); router.refresh();
    } catch (e) { setError(e.message); setBusy(false); }
  }

  return (
    <form onSubmit={create} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium">Organisation name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc." className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
      </label>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button disabled={busy || !name.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
        <Building2 className="h-4 w-4" />{busy ? 'Creating…' : 'Create organisation'}
      </button>
      <p className="text-[11px] text-muted-foreground">You’ll be the owner. Departments are set up automatically; invite your team next.</p>
    </form>
  );
}
