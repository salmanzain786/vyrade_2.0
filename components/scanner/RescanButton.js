'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

export default function RescanButton({ blueprintId }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function rescan() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/scanner/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blueprintId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Scan failed (${res.status})`);
      }
      router.refresh(); // re-render the server component with the new persisted scan
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
      <button
        onClick={rescan}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
        {busy ? 'Scanning…' : 'Re-scan now'}
      </button>
    </div>
  );
}
