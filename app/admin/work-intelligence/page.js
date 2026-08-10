import { Workflow, ArrowDown } from 'lucide-react';
import { workFunnel } from '@/lib/services/work-intelligence/funnel';

// Work Intelligence funnel (Phase 5.4) — tasks analysed → opportunities →
// Blueprints → deployed → measured. Reuses the admin dashboard patterns.
export const dynamic = 'force-dynamic';

export default async function WorkIntelligenceAdminPage() {
  const f = await workFunnel().catch(() => null);
  if (!f) return <main className="mx-auto max-w-4xl p-8"><p className="text-sm text-muted-foreground">Funnel data unavailable.</p></main>;

  const top = f.stages[0]?.count || 0;

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-8">
      <header className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><Workflow className="h-6 w-6 text-blue-600 dark:text-blue-400" />Work Intelligence funnel</h1>
        <p className="mt-1 text-sm text-muted-foreground">Task-to-automation across {f.connections} connected {f.connections === 1 ? 'workspace' : 'workspaces'} — from analysed tasks through to measured outcomes.</p>
      </header>

      <div className="space-y-2">
        {f.stages.map((s, i) => {
          const widthPct = top > 0 ? Math.max(4, Math.round((s.count / top) * 100)) : 4;
          return (
            <div key={s.key}>
              {i > 0 && (
                <div className="flex items-center gap-1 py-0.5 pl-1 text-[11px] text-muted-foreground">
                  <ArrowDown className="h-3 w-3" />{s.conversion_pct != null ? `${s.conversion_pct}% of previous` : '—'}
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="h-11 overflow-hidden rounded-lg bg-blue-600/10" style={{ width: `${widthPct}%`, minWidth: '120px' }}>
                  <div className="flex h-full items-center justify-between px-3">
                    <span className="text-sm font-medium">{s.label}</span>
                  </div>
                </div>
                <span className="text-lg font-semibold tabular-nums">{s.count}</span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-[11px] text-muted-foreground">Counts reflect task-sourced automations (Blueprints originating from a task). Every stage is real (persisted state), not inferred — deploy/measured come from confirmed implementation data.</p>
    </main>
  );
}
