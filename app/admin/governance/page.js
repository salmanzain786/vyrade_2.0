import { UserX, Database, ShieldAlert, History, Share2, ArrowRight } from 'lucide-react';
import { governanceRollup } from '@/lib/services/admin/adminGovernanceRepository';

// Org-level Risk & Governance rollup (Phase 8.2 / 8.3) — real data from the
// latest governance scan per Blueprint. Reuses the admin Stat/card patterns.
export const dynamic = 'force-dynamic';

const RISK_TONE = { High: 'text-red-600 dark:text-red-400', Medium: 'text-amber-600 dark:text-amber-400', Low: 'text-emerald-600 dark:text-emerald-400' };
const bandTone = (p) => (p == null ? 'text-muted-foreground' : p >= 85 ? 'text-emerald-600 dark:text-emerald-400' : p >= 70 ? 'text-blue-600 dark:text-blue-400' : p >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400');

function Stat({ label, value, sub, tone }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${tone || 'text-blue-600 dark:text-blue-400'}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

const RISK_ROWS = [
  { key: 'no_owner', label: 'Workflows without an owner', icon: UserX },
  { key: 'sensitive_data', label: 'Sensitive-data usage (PII / special category)', icon: Database },
  { key: 'missing_approvals', label: 'Missing / unspecified approvals', icon: ShieldAlert },
  { key: 'outdated_outputs', label: 'Outdated Blueprint outputs (version drift)', icon: History },
  { key: 'processors_to_review', label: 'Third-party processors to review', icon: Share2 },
];

export default async function AdminGovernancePage() {
  const g = await governanceRollup().catch(() => null);
  if (!g) return <main className="mx-auto max-w-6xl p-8"><p className="text-sm text-muted-foreground">Governance data unavailable.</p></main>;

  const td = 'px-3 py-2 text-sm';
  const th = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground';

  return (
    <main className="mx-auto max-w-6xl p-6 sm:p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Risk &amp; Governance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Org-wide rollup from the latest governance scan of each Blueprint.
          {g.unscanned > 0 && <> {g.unscanned} of {g.total_blueprints} not yet scanned.</>}
        </p>
      </header>

      <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Blueprints scanned" value={`${g.scanned}/${g.total_blueprints}`} sub="have a governance scan" />
        <Stat label="Avg readiness" value={g.avg_readiness == null ? '—' : `${g.avg_readiness}%`} tone={bandTone(g.avg_readiness)} sub="across scanned blueprints" />
        <Stat label="High-risk" value={g.risk.High} tone={RISK_TONE.High} sub="blueprints at high security risk" />
        <Stat label="Medium / Low" value={`${g.risk.Medium} / ${g.risk.Low}`} sub="risk distribution" />
      </section>

      {/* Risk & Governance module rows */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Risk items</h2>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {RISK_ROWS.map((r) => {
          const item = g.risk_items[r.key] || { count: 0, blueprints: [] };
          const Icon = r.icon;
          return (
            <div key={r.key} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />{r.label}</span>
                <span className={`text-2xl font-semibold ${item.count > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{item.count}</span>
              </div>
              {item.blueprints.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {item.blueprints.slice(0, 4).map((b) => (
                    <li key={b.id} className="truncate text-xs text-muted-foreground"><a href={`/compliance/${b.id}`} className="hover:text-foreground hover:underline">{b.name}</a></li>
                  ))}
                  {item.blueprints.length > 4 && <li className="text-xs text-muted-foreground">+{item.blueprints.length - 4} more</li>}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Worst-readiness triage list */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Lowest-readiness blueprints</h2>
      <div className="mb-8 overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse">
          <thead className="border-b bg-muted/40">
            <tr><th className={th}>Blueprint</th><th className={th}>Owner</th><th className={th}>Readiness</th><th className={th}>Risk</th><th className={th}>Findings</th></tr>
          </thead>
          <tbody>
            {g.worst.length === 0 && <tr><td className={`${td} text-muted-foreground`} colSpan={5}>No scans yet.</td></tr>}
            {g.worst.map((b) => (
              <tr key={b.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className={`${td} font-medium`}><a href={`/compliance/${b.id}`} className="hover:underline">{b.name}</a></td>
                <td className={`${td} text-muted-foreground`}>{b.owner || <span className="text-red-600 dark:text-red-400">unassigned</span>}</td>
                <td className={td}><span className={`font-medium ${bandTone(b.readiness_pct)}`}>{b.readiness_pct == null ? '—' : `${b.readiness_pct}%`}</span></td>
                <td className={td}><span className={RISK_TONE[b.risk] || ''}>{b.risk || '—'}</span></td>
                <td className={`${td} text-muted-foreground`}>{b.findings_total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Honest limitations — not faked */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-700 dark:text-amber-400">
        <div className="font-medium">Not yet available (needs models that don’t exist today):</div>
        <ul className="mt-1 list-disc pl-5">
          <li><strong>Department-level rollup</strong> — {g.unavailable.department_rollup}</li>
          <li><strong>Duplicate-platform detection</strong> — {g.unavailable.duplicate_platforms}</li>
        </ul>
      </div>
    </main>
  );
}
