import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Sparkles, Target, Gauge, ListChecks, TrendingUp, GraduationCap, ArrowRight, CheckCircle2, Home } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { getAdoptionDashboard } from '@/lib/services/adoption/adoptionRepository';
import { STAGE_ORDER, STAGE_LABEL, stageIndex } from '@/lib/services/adoption/stages';
import { DEPARTMENT_LABEL } from '@/lib/services/adoption/catalog';
import { VyradeMark } from '@/components/VyradeLogo';
import OpportunityStatus from '@/components/adoption/OpportunityStatus';

export const dynamic = 'force-dynamic';

const bandTone = (band) => ({
  exploring: 'text-slate-500', aware: 'text-blue-600 dark:text-blue-400', building: 'text-amber-600 dark:text-amber-400',
  adopting: 'text-emerald-600 dark:text-emerald-400', leading: 'text-emerald-600 dark:text-emerald-400',
}[band] || 'text-blue-600 dark:text-blue-400');

function Card({ title, icon: Icon, children, id }) {
  return (
    <section id={id} className="mb-6 rounded-xl border border-border bg-card p-5">
      {title && <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">{Icon && <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />}{title}</h2>}
      {children}
    </section>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const d = await getAdoptionDashboard(user.id);
  const s = d.score;
  const furthest = d.stages.furthest ? stageIndex(d.stages.furthest) : -1;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2"><VyradeMark className="h-6 w-auto" /><span className="text-sm font-semibold">Vyrade</span></Link>
          <div className="flex items-center gap-3 text-xs">
            <Link href="/" className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><Home className="h-3.5 w-3.5" /> Workspace</Link>
            <Link href="/dashboard/profile" className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-accent">Edit profile</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Your AI Adaptability</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {d.profile?.role ? `${d.profile.role}${d.profile.department ? ` · ${DEPARTMENT_LABEL[d.profile.department] || d.profile.department}` : ''}` : 'A personalised view of your automation adoption.'}
        </p>

        {/* Onboarding nudge */}
        {!d.profile?.completed && (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
            <span className="text-sm text-blue-700 dark:text-blue-400">Complete your profile to personalise your opportunity map and recommendations.</span>
            <Link href="/dashboard/profile" className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">Complete profile</Link>
          </div>
        )}

        {/* 1.4/1.5 Score + maturity */}
        <div className="mt-6 grid gap-6 md:grid-cols-[280px_1fr]">
          <Card title="AI Adoption Score" icon={Gauge}>
            <div className="text-center">
              <div className={`text-5xl font-bold ${bandTone(s.band)}`}>{s.score}</div>
              <div className="mt-1 text-sm font-medium">{s.band_label}</div>
              <div className="mx-auto mt-2 h-2 max-w-[200px] overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${s.score >= 60 ? 'bg-emerald-500' : s.score >= 40 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${s.score}%` }} />
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{s.caveat}</p>
          </Card>

          <Card title="What drives your score" icon={Sparkles}>
            <ul className="space-y-2">
              {s.breakdown.map((b) => (
                <li key={b.key} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 text-xs text-muted-foreground">{b.label}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-blue-500" style={{ width: `${Math.round(b.value * 100)}%` }} /></span>
                  <span className="w-10 shrink-0 text-right text-[11px] text-muted-foreground">{Math.round(b.value * 100)}%</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* 1.3 Stage journey */}
        <Card title="Your progression" icon={TrendingUp}>
          <div className="flex flex-wrap gap-1.5">
            {STAGE_ORDER.map((stage, i) => {
              const reached = furthest >= i;
              return (
                <span key={stage} className={`rounded-full border px-2.5 py-1 text-[11px] ${reached ? 'border-blue-500/40 bg-blue-500/10 font-medium text-blue-700 dark:text-blue-400' : 'border-border text-muted-foreground'}`}>
                  {STAGE_LABEL[stage]}
                </span>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">The last three stages (Implemented → Active → Measured) advance only when you confirm a workflow is deployed and report outcomes on its report page — real confirmations, not inference.</p>
        </Card>

        {/* 1.6 Coverage — labelled estimated */}
        <Card title="Workflow coverage & potential" icon={Target}>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div><div className="text-2xl font-bold">{d.coverage.label}</div><div className="text-xs text-muted-foreground">opportunities addressed</div></div>
            <div><div className="text-2xl font-bold">~{d.coverage.estimated_remaining_month}h<span className="text-sm font-normal text-muted-foreground">/mo</span></div><div className="text-xs text-muted-foreground">estimated remaining potential</div></div>
            <div><div className="text-2xl font-bold">~{d.coverage.estimated_hours_saved_month}h<span className="text-sm font-normal text-muted-foreground">/mo</span></div><div className="text-xs text-muted-foreground">estimated from addressed areas</div></div>
          </div>
          <p className="mt-2 inline-block rounded bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-400">Estimated — based on curated benchmarks, not measured execution. Real figures arrive with execution telemetry (a later phase).</p>
        </Card>

        {/* 1.5 Next actions */}
        {d.next_actions.length > 0 && (
          <Card title="Recommended next actions" icon={ListChecks}>
            <ul className="space-y-2">
              {d.next_actions.map((a) => (
                <li key={a.key}>
                  <Link href={a.href} className="group flex items-center justify-between rounded-lg border border-border p-3 hover:border-blue-500/40 hover:bg-accent/40">
                    <span><span className="text-sm font-medium">{a.label}</span><span className="block text-xs text-muted-foreground">{a.detail}</span></span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-blue-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-blue-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* 1.2/1.5 Opportunity map */}
        <Card title="Your opportunity map" icon={Sparkles} id="opportunities">
          {d.opportunities.length === 0 ? (
            <p className="text-sm text-muted-foreground">Complete your profile to generate your personalised opportunity map.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-1.5 pr-4 font-medium">Opportunity</th><th className="py-1.5 pr-4 font-medium">Est. saving</th><th className="py-1.5 pr-4 font-medium">Type</th><th className="py-1.5 pr-4 font-medium">Status</th></tr></thead>
                <tbody>
                  {d.opportunities.map((o) => (
                    <tr key={o.area_key} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-4"><span className="font-medium">{o.label}</span>{o.blueprint_id && <CheckCircle2 className="ml-1.5 inline h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}</td>
                      <td className="py-2 pr-4 text-muted-foreground">~{o.est_hours_month || 0}h/mo</td>
                      <td className="py-2 pr-4 text-muted-foreground">{(o.complexity || '').replace('_', '-') || '—'}</td>
                      <td className="py-2 pr-4"><OpportunityStatus areaKey={o.area_key} initial={o.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* 1.7 Skills & readiness */}
        <Card title="Skills & readiness" icon={GraduationCap}>
          <div className="text-sm">{d.skills.readiness_note}</div>
          {d.skills.engaged_complexity.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">{d.skills.engaged_complexity.map((c) => <span key={c} className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">{(c || '').replace('_', '-')}</span>)}</div>
          )}
        </Card>
      </main>
    </div>
  );
}
