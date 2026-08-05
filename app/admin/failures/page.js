import { getFailuresView } from '@/lib/services/admin/adminFailuresRepository';

// Failures & import checks (milestone 3.4). Server-rendered under the admin gate.
export const dynamic = 'force-dynamic';

const RANGES = [7, 30, 90];

function fmtDate(d) {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}
function qs(p) {
  const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v)).toString();
  return s ? `?${s}` : '';
}
const sevClass = (s) => (s === 'error' ? 'text-red-600' : s === 'warning' ? 'text-amber-600' : 'text-muted-foreground');

function Tile({ label, value, hint, tone }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone || ''}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default async function FailuresAdminPage({ searchParams }) {
  const days = RANGES.includes(Number(searchParams?.days)) ? Number(searchParams.days) : 30;
  const page = Number(searchParams?.page || 1);
  const { verdicts, summary, topFailingNodes, repairs, recent } = await getFailuresView({ days, page });

  const th = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground';
  const td = 'px-3 py-2 text-sm';
  const maxNode = Math.max(1, ...topFailingNodes.map((n) => n.failures));

  return (
    <main className="mx-auto max-w-6xl p-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Failures &amp; import checks</h1>
        <form method="get" className="flex items-end gap-2">
          <label className="text-xs text-muted-foreground">Range
            <select name="days" defaultValue={String(days)} className="ml-2 rounded-md border bg-background px-2 py-1 text-sm">
              {RANGES.map((d) => <option key={d} value={d}>{d}d</option>)}
            </select>
          </label>
          <button className="rounded-md border px-3 py-1 text-sm hover:bg-accent">Apply</button>
          <a href={`/api/admin/failures/export${qs({ days })}`} className="rounded-md border px-3 py-1 text-sm hover:bg-accent">CSV ⤓</a>
        </form>
      </div>

      {/* Summary tiles */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Generated" value={summary.generated} hint={`last ${days}d`} />
        <Tile label="Generation failed" value={summary.generation_failed} tone={summary.generation_failed ? 'text-red-600' : ''} />
        <Tile label="Import failed" value={summary.import_failed}
              hint={summary.import_failure_rate == null ? '' : `${summary.import_failure_rate}% of generated`}
              tone={summary.import_failed ? 'text-red-600' : ''} />
        <Tile label="Repairs" value={repairs.repairs} hint={repairs.avg_attempts != null ? `avg ${repairs.avg_attempts} attempts` : ''} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {/* Import verdicts */}
        <div className="rounded-lg border p-4">
          <h2 className="mb-3 font-medium">Import verdicts (all workflows)</h2>
          <div className="grid grid-cols-4 gap-2 text-center text-sm">
            <div><div className="text-lg font-semibold text-emerald-600">{verdicts.verified}</div>verified</div>
            <div><div className="text-lg font-semibold text-muted-foreground">{verdicts.skipped}</div>skipped</div>
            <div><div className="text-lg font-semibold text-red-600">{verdicts.failed}</div>failed</div>
            <div><div className="text-lg font-semibold text-muted-foreground">{verdicts.unknown}</div>unknown</div>
          </div>
        </div>

        {/* Top failing nodes */}
        <div className="rounded-lg border p-4">
          <h2 className="mb-3 font-medium">Top failing nodes ({days}d)</h2>
          {topFailingNodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No import failures in this window.</p>
          ) : (
            <ul className="space-y-1.5">
              {topFailingNodes.map((n) => (
                <li key={n.node_type} className="flex items-center gap-2 text-sm">
                  <span className="w-40 truncate font-mono text-xs">{n.node_type}</span>
                  <span className="h-2 rounded bg-red-500/40" style={{ width: `${(n.failures / maxNode) * 100}%`, minWidth: 4 }} />
                  <span className="text-muted-foreground">{n.failures}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recent failures table */}
      <h2 className="mb-2 font-medium">Recent failures ({days}d)</h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className={th}>When</th><th className={th}>Type</th><th className={th}>Blueprint</th>
              <th className={th}>User</th><th className={th}>Node</th><th className={th}>Category</th>
            </tr>
          </thead>
          <tbody>
            {recent.rows.length === 0 && (
              <tr><td className={`${td} text-muted-foreground`} colSpan={6}>No failures in this window.</td></tr>
            )}
            {recent.rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className={`${td} whitespace-nowrap text-muted-foreground`}>{fmtDate(r.created_at)}</td>
                <td className={`${td} ${sevClass(r.severity)}`}>{r.type === 'generation_failed' ? 'generation' : 'import'}</td>
                <td className={`${td} font-medium`}>{r.blueprint_name}</td>
                <td className={`${td} text-muted-foreground`}>{r.user_email}</td>
                <td className={`${td} font-mono text-xs`}>{r.node_type || '—'}</td>
                <td className={td}>{r.error_category || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>Page {recent.page} of {recent.pages} · {recent.total} failures</span>
        <div className="flex gap-2">
          {recent.page > 1 && <a className="rounded-md border px-3 py-1 hover:bg-accent" href={`/admin/failures${qs({ days, page: recent.page - 1 })}`}>‹ Prev</a>}
          {recent.page < recent.pages && <a className="rounded-md border px-3 py-1 hover:bg-accent" href={`/admin/failures${qs({ days, page: recent.page + 1 })}`}>Next ›</a>}
        </div>
      </div>
    </main>
  );
}
