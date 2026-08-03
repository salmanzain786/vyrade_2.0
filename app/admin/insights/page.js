import { getInsightsSummary } from '@/lib/services/insights/operationalInsightsRepository';
import { formatMoney } from '@/lib/utils';

// Operational insights (milestone 3.6). Surfaces the learning-loop aggregators
// (docGaps / topFailingNodes / import outcomes / repairs / usage) that until now
// only fed generation silently — as an actual admin view.
export const dynamic = 'force-dynamic';

const RANGES = [7, 30, 90];
const short = (t) => String(t || '').replace(/^n8n-nodes-base\./, '').replace(/^@n8n\/n8n-nodes-langchain\./, 'langchain.');
const compactTokens = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(n || 0));

function Card({ title, children }) {
  return <div className="rounded-lg border p-4"><h2 className="mb-3 font-medium">{title}</h2>{children}</div>;
}
function Stat({ label, value, tone }) {
  return <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className={`font-semibold ${tone || ''}`}>{value}</span></div>;
}

export default async function InsightsAdminPage({ searchParams }) {
  const days = RANGES.includes(Number(searchParams?.days)) ? Number(searchParams.days) : 30;
  const s = await getInsightsSummary({ days });
  const maxNode = Math.max(1, ...s.top_failing_nodes.map((n) => n.failures));
  const maxGap = Math.max(1, ...s.doc_gaps.map((g) => g.gaps));

  return (
    <main className="mx-auto max-w-6xl p-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <a href="/admin" className="text-xs text-muted-foreground hover:underline">← Admin</a>
          <h1 className="text-2xl font-semibold">Operational insights</h1>
        </div>
        <form method="get" className="flex items-end gap-2">
          <label className="text-xs text-muted-foreground">Range
            <select name="days" defaultValue={String(days)} className="ml-2 rounded-md border bg-background px-2 py-1 text-sm">
              {RANGES.map((d) => <option key={d} value={d}>{d}d</option>)}
            </select>
          </label>
          <button className="rounded-md border px-3 py-1 text-sm hover:bg-accent">Apply</button>
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Top failing nodes (${days}d)`}>
          {s.top_failing_nodes.length === 0 ? <p className="text-sm text-muted-foreground">No import failures in this window.</p> : (
            <ul className="space-y-1.5">
              {s.top_failing_nodes.map((n) => (
                <li key={n.node_type} className="flex items-center gap-2 text-sm">
                  <span className="w-44 truncate font-mono text-xs">{short(n.node_type)}</span>
                  <span className="h-2 rounded bg-red-500/40" style={{ width: `${(n.failures / maxNode) * 100}%`, minWidth: 4 }} />
                  <span className="text-muted-foreground">{n.failures}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Doc gaps — tools lacking docs (${days}d)`}>
          {s.doc_gaps.length === 0 ? <p className="text-sm text-muted-foreground">No doc gaps recorded. (Emitted when a build references a system with no tool docs.)</p> : (
            <ul className="space-y-1.5">
              {s.doc_gaps.map((g) => (
                <li key={g.tool} className="flex items-center gap-2 text-sm">
                  <span className="w-44 truncate">{g.tool}</span>
                  <span className="h-2 rounded bg-amber-500/40" style={{ width: `${(g.gaps / maxGap) * 100}%`, minWidth: 4 }} />
                  <span className="text-muted-foreground">{g.gaps}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Import outcomes">
          <div className="space-y-2">
            <Stat label="Generated" value={s.import.generated} />
            <Stat label="Import failed" value={s.import.import_failed} tone={s.import.import_failed ? 'text-red-600' : ''} />
            <Stat label="Import skipped" value={s.import.import_skipped} />
            <Stat label="Failure rate" value={s.import.failure_rate == null ? '—' : `${Math.round(s.import.failure_rate * 100)}%`} />
          </div>
        </Card>

        <Card title="Repairs & usage">
          <div className="space-y-2">
            <Stat label="Repairs" value={s.repairs.repairs} />
            <Stat label="Avg repair attempts" value={s.repairs.avg_attempts ?? '—'} />
            <Stat label="Total tokens" value={compactTokens(s.usage.total_tokens)} />
            <Stat label="Total cost" value={formatMoney(s.usage.total_cost_usd) ?? '$0.00'} />
          </div>
        </Card>
      </div>

      <Card title="Event counts">
        <div className="flex flex-wrap gap-2">
          {s.event_counts.length === 0 && <span className="text-sm text-muted-foreground">No events in this window.</span>}
          {s.event_counts.map((e) => (
            <span key={e.event_type} className="rounded-full border px-3 py-1 text-xs"><span className="font-mono">{e.event_type}</span> · {e.count}</span>
          ))}
        </div>
      </Card>
    </main>
  );
}
