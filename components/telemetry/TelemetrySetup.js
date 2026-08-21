'use client';

import { useEffect, useState } from 'react';
import { KeyRound, Copy, Check, Trash2, Plus } from 'lucide-react';

export default function TelemetrySetup() {
  const [tokens, setTokens] = useState([]);
  const [fresh, setFresh] = useState(null); // full token shown once
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const ingestUrl = `${origin}/api/telemetry/ingest`;

  const load = () => fetch('/api/telemetry/tokens').then((r) => r.json()).then((j) => setTokens(j.tokens || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  async function create() {
    setBusy(true); setFresh(null);
    try {
      const res = await fetch('/api/telemetry/tokens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }) });
      const j = await res.json();
      if (res.ok) { setFresh(j.token); setLabel(''); load(); }
    } finally { setBusy(false); }
  }
  async function revoke(token) {
    await fetch(`/api/telemetry/tokens?token=${encodeURIComponent(token)}`, { method: 'DELETE' });
    load();
  }
  const copy = (text, key) => { navigator.clipboard?.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); };

  const example = `POST ${ingestUrl}
x-telemetry-token: <YOUR_TOKEN>
Content-Type: application/json

{
  "blueprint_id": "<vyrade blueprint id>",
  "status": "success",          // or "error" / "waiting"
  "duration_ms": 1240,
  "error": "<raw error, categorised then discarded>",
  "human_intervention": false,
  "occurred_at": "2026-02-01T10:00:00Z"
}`;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold"><span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"><KeyRound className="h-4 w-4" /></span>Ingestion tokens</h2>
        <p className="mb-3 text-xs text-muted-foreground">Create a token, then have your automation platform POST each run to the ingest URL with it. Tokens are shown once.</p>

        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col text-xs text-muted-foreground">Label (optional)
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Prod n8n" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm transition-colors focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </label>
          <button onClick={create} disabled={busy} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60"><Plus className="h-4 w-4" />New token</button>
        </div>

        {fresh && (
          <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-xs">
            <div className="mb-1 font-medium text-emerald-700 dark:text-emerald-400">Copy this now — it won’t be shown again:</div>
            <div className="flex items-center gap-2"><code className="truncate">{fresh}</code><button onClick={() => copy(fresh, 'fresh')} className="ml-auto inline-flex items-center gap-1 rounded border border-border px-2 py-0.5">{copied === 'fresh' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}Copy</button></div>
          </div>
        )}

        {tokens.length > 0 && (
          <ul className="mt-3 space-y-1">
            {tokens.map((t) => (
              <li key={t.token_hint} className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm transition-colors hover:bg-muted/40">
                <code className="text-xs">{t.token_hint}</code>
                <span className="text-xs text-muted-foreground">{t.label || '—'}{t.revoked ? ' · revoked' : ''}{t.last_used_at ? ` · used ${new Date(t.last_used_at).toLocaleDateString()}` : ''}</span>
                {!t.revoked && <button onClick={() => revoke(t.token_hint)} className="ml-auto text-muted-foreground hover:text-red-600" title="Revoke"><Trash2 className="h-3.5 w-3.5" /></button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold">Wire it up (n8n)</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Add an <strong>HTTP Request</strong> node at the end of your workflow (and in its <strong>Error Workflow</strong>) that POSTs to the ingest URL. Set the <code>x-telemetry-token</code> header and send the run’s status. Make and Zapier use the same contract (an HTTP/webhook action).
        </p>
        <div className="relative">
          <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-[11px] leading-relaxed"><code>{example}</code></pre>
          <button onClick={() => copy(example, 'ex')} className="absolute right-2 top-2 inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-0.5 text-[11px]">{copied === 'ex' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}Copy</button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Privacy: only status, duration, a coarse error category, and an intervention flag are stored — never payloads or raw messages.</p>
      </section>
    </div>
  );
}
