import { getCostView } from '@/lib/services/admin/adminCostRepository';
import { formatMoney } from '@/lib/utils';

// Cost & usage (milestone 3.5). Server-rendered under the admin gate.
export const dynamic = 'force-dynamic';

const RANGES = [7, 30, 90];
const compactTokens = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(n));

function fmtDate(d) {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().slice(0, 10);
}
function qs(p) {
  const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v)).toString();
  return s ? `?${s}` : '';
}
function Tile({ label, value, hint }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default async function CostAdminPage({ searchParams }) {
  const days = RANGES.includes(Number(searchParams?.days)) ? Number(searchParams.days) : 30;
  const page = Number(searchParams?.page || 1);
  const { summary, trend, perUser, auth } = await getCostView({ days, page });

  const th = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground';
  const td = 'px-3 py-2 text-sm';
  const maxDay = Math.max(0.0001, ...trend.map((t) => t.cost));

  return (
    <main className="mx-auto max-w-6xl p-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Cost &amp; usage</h1>
        <form method="get" className="flex items-end gap-2">
          <label className="text-xs text-muted-foreground">Range
            <select name="days" defaultValue={String(days)} className="ml-2 rounded-md border bg-background px-2 py-1 text-sm">
              {RANGES.map((d) => <option key={d} value={d}>{d}d</option>)}
            </select>
          </label>
          <button className="rounded-md border px-3 py-1 text-sm hover:bg-accent">Apply</button>
          <a href={`/api/admin/cost/export${qs({ days })}`} className="rounded-md border px-3 py-1 text-sm hover:bg-accent">CSV ⤓</a>
        </form>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Total spend" value={formatMoney(summary.total_cost) ?? '$0.00'} hint={`last ${days}d`} />
        <Tile label="Tokens" value={compactTokens(summary.total_tokens)} />
        <Tile label="Active users" value={summary.users} />
        <Tile label="Avg / user" value={formatMoney(summary.mean_cost) ?? '$0.00'} />
      </div>

      {/* Trend */}
      <div className="mb-6 rounded-lg border p-4">
        <h2 className="mb-3 font-medium">Daily spend ({days}d)</h2>
        {trend.length === 0 ? (
          <p className="text-sm text-muted-foreground">No spend in this window.</p>
        ) : (
          <div className="flex h-24 items-end gap-1">
            {trend.map((t) => (
              <div key={fmtDate(t.day)} className="flex-1 rounded-t bg-primary/50" title={`${fmtDate(t.day)}: ${formatMoney(t.cost)}`}
                   style={{ height: `${Math.max(2, (t.cost / maxDay) * 100)}%` }} />
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Per-user spend */}
        <div className="lg:col-span-2">
          <h2 className="mb-2 font-medium">Per-user spend</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse">
              <thead className="border-b bg-muted/40">
                <tr><th className={th}>User</th><th className={th}>Tokens</th><th className={th}>Cost</th><th className={th}>Convos</th><th className={th}>Last</th></tr>
              </thead>
              <tbody>
                {perUser.rows.length === 0 && <tr><td className={`${td} text-muted-foreground`} colSpan={5}>No usage in this window.</td></tr>}
                {perUser.rows.map((u) => (
                  <tr key={u.user_id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className={`${td} font-medium`}>{u.email}{u.spike && <span className="ml-2 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-600">spike</span>}</td>
                    <td className={td}>{compactTokens(u.tokens)}</td>
                    <td className={`${td} font-medium`}>{formatMoney(u.cost) ?? '$0.00'}</td>
                    <td className={td}>{u.convos}</td>
                    <td className={`${td} text-muted-foreground`}>{fmtDate(u.last_activity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {perUser.page} of {perUser.pages} · {perUser.total} users</span>
            <div className="flex gap-2">
              {perUser.page > 1 && <a className="rounded-md border px-3 py-1 hover:bg-accent" href={`/admin/cost${qs({ days, page: perUser.page - 1 })}`}>‹ Prev</a>}
              {perUser.page < perUser.pages && <a className="rounded-md border px-3 py-1 hover:bg-accent" href={`/admin/cost${qs({ days, page: perUser.page + 1 })}`}>Next ›</a>}
            </div>
          </div>
        </div>

        {/* Auth / rate-limit */}
        <div>
          <h2 className="mb-2 font-medium">Auth &amp; rate limits ({days}d)</h2>
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Rate-limit blocks</span><span className={`font-semibold ${auth.blocked ? 'text-red-600' : ''}`}>{auth.blocked}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Failed logins</span><span className="font-semibold">{auth.failed_logins}</span></div>
            {auth.top_blocked.length > 0 && (
              <div className="border-t pt-3">
                <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Top blocked</div>
                <ul className="space-y-1 text-sm">
                  {auth.top_blocked.map((b) => (
                    <li key={b.who} className="flex justify-between"><span className="truncate">{b.who}</span><span className="text-muted-foreground">{b.count}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {auth.blocked === 0 && <p className="text-xs text-muted-foreground">No rate-limit blocks — nobody's been throttled.</p>}
          </div>
        </div>
      </div>
    </main>
  );
}
