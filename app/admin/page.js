import { LayoutGrid, AlertTriangle, DollarSign, Activity, ArrowRight } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { listBlueprints } from '@/lib/services/admin/adminBlueprintsRepository';
import { failureSummary, importVerdicts } from '@/lib/services/admin/adminFailuresRepository';
import { costSummary } from '@/lib/services/admin/adminCostRepository';
import { formatMoney } from '@/lib/utils';

// Admin overview (milestone 3.3 landing) — live at-a-glance stats + view cards.
export const dynamic = 'force-dynamic';

const VIEWS = [
  { href: '/admin/blueprints', title: 'Blueprints', desc: 'All blueprints: status, readiness, version, activity.', icon: LayoutGrid },
  { href: '/admin/failures', title: 'Failures & import checks', desc: 'Import failures, failing nodes, repairs.', icon: AlertTriangle },
  { href: '/admin/cost', title: 'Cost & usage', desc: 'Per-user token spend, trend, rate-limit blocks.', icon: DollarSign },
  { href: '/admin/insights', title: 'Operational insights', desc: 'Top failing nodes, doc gaps, outcomes.', icon: Activity },
];

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-blue-600 dark:text-blue-400">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default async function AdminHome() {
  const [user, bp, fail, verdicts, cost] = await Promise.all([
    getCurrentUser(),
    listBlueprints({ pageSize: 1 }).catch(() => ({ total: 0 })),
    failureSummary({ days: 30 }).catch(() => ({ import_failed: 0, generation_failed: 0 })),
    importVerdicts().catch(() => ({ failed: 0 })),
    costSummary({ days: 30 }).catch(() => ({ total_cost: 0, users: 0 })),
  ]);

  return (
    <main className="mx-auto max-w-6xl p-6 sm:p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Operational visibility across all users · signed in as <span className="text-foreground">{user?.email}</span>
        </p>
      </header>

      {/* Live stat tiles */}
      <section className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Blueprints" value={bp.total} sub="across all users" />
        <Stat label="Import failures" value={fail.import_failed} sub="last 30 days" />
        <Stat label="Failed verdicts" value={verdicts.failed} sub="stored workflows" />
        <Stat label="Spend (30d)" value={formatMoney(cost.total_cost) ?? '$0.00'} sub={`${cost.users} active user${cost.users === 1 ? '' : 's'}`} />
      </section>

      {/* View cards */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Explore</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          return (
            <a key={v.href} href={v.href}
               className="group flex items-start gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-blue-500/40 hover:bg-accent/40">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 font-medium">
                  {v.title}
                  <ArrowRight className="h-4 w-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{v.desc}</div>
              </div>
            </a>
          );
        })}
      </div>
    </main>
  );
}
