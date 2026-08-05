import { listBlueprints, BLUEPRINT_STATUSES } from '@/lib/services/admin/adminBlueprintsRepository';

// Blueprints overview (milestone 3.3). Server-rendered; search/status/page are
// driven by URL params (a plain GET form) so it works with zero client JS under
// the admin gate, and every filtered view is linkable/bookmarkable.
export const dynamic = 'force-dynamic';

const STATUS_LABEL = {
  collecting_requirements: 'Collecting',
  requirements_complete: 'Complete',
  blocked: 'Blocked',
};
const STATUS_CLASS = {
  collecting_requirements: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  requirements_complete: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  blocked: 'bg-red-500/10 text-red-600 border-red-500/20',
};

function fmtDate(d) {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}
function scoreClass(s) {
  if (s == null) return 'text-muted-foreground';
  if (s >= 80) return 'text-emerald-600';
  if (s >= 50) return 'text-amber-600';
  return 'text-red-600';
}
function qs(params) {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  const str = s.toString();
  return str ? `?${str}` : '';
}

export default async function BlueprintsAdminPage({ searchParams }) {
  const search = (searchParams?.search || '').trim();
  const status = searchParams?.status || '';
  const page = Number(searchParams?.page || 1);
  const data = await listBlueprints({ search, status, page });

  const th = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground';
  const td = 'px-3 py-2 text-sm';

  return (
    <main className="mx-auto max-w-6xl p-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Blueprints</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{data.total} total</span>
          <a href={`/api/admin/blueprints/export${qs({ search, status })}`}
             className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">CSV ⤓</a>
        </div>
      </div>

      {/* Filter form — plain GET so state lives in the URL */}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-muted-foreground">
          Search (name or user email)
          <input name="search" defaultValue={search} placeholder="e.g. payroll or a@b.com"
                 className="mt-1 w-72 rounded-md border bg-background px-3 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col text-xs text-muted-foreground">
          Status
          <select name="status" defaultValue={status}
                  className="mt-1 rounded-md border bg-background px-3 py-1.5 text-sm">
            <option value="">All</option>
            {BLUEPRINT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-md border px-4 py-1.5 text-sm font-medium hover:bg-accent">Filter</button>
        {(search || status) && (
          <a href="/admin/blueprints" className="px-2 py-1.5 text-sm text-muted-foreground hover:underline">Clear</a>
        )}
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className={th}>Name</th>
              <th className={th}>User</th>
              <th className={th}>Status</th>
              <th className={th}>Readiness</th>
              <th className={th}>Ver</th>
              <th className={th}>Last activity</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 && (
              <tr><td className={`${td} text-muted-foreground`} colSpan={6}>No blueprints match.</td></tr>
            )}
            {data.rows.map((b) => (
              <tr key={b.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className={`${td} font-medium`}>{b.name}</td>
                <td className={`${td} text-muted-foreground`}>{b.user_email}</td>
                <td className={td}>
                  <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASS[b.status] || ''}`}>
                    {STATUS_LABEL[b.status] || b.status}
                  </span>
                </td>
                <td className={td}>
                  <span className={`font-medium ${scoreClass(b.readiness_score)}`}>
                    {b.readiness_score == null ? '—' : `${b.readiness_score}%`}
                  </span>
                  {b.blocking_count > 0 && <span className="ml-2 text-xs text-muted-foreground">{b.blocking_count} blocking</span>}
                </td>
                <td className={td}>v{b.version}</td>
                <td className={`${td} text-muted-foreground`}>{fmtDate(b.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>Page {data.page} of {data.pages} · showing {data.rows.length} of {data.total}</span>
        <div className="flex gap-2">
          {data.page > 1 && (
            <a className="rounded-md border px-3 py-1 hover:bg-accent" href={`/admin/blueprints${qs({ search, status, page: data.page - 1 })}`}>‹ Prev</a>
          )}
          {data.page < data.pages && (
            <a className="rounded-md border px-3 py-1 hover:bg-accent" href={`/admin/blueprints${qs({ search, status, page: data.page + 1 })}`}>Next ›</a>
          )}
        </div>
      </div>
    </main>
  );
}
