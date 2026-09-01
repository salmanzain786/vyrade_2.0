import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Sparkles, Target, Gauge, ListChecks, TrendingUp, GraduationCap, ArrowRight, ArrowUpRight, CheckCircle2, Check, Activity, Clock, Zap, BarChart3, PieChart, Layers, GaugeCircle } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { getAdoptionDashboard } from '@/lib/services/adoption/adoptionRepository';
import { userExecutionSummary, measuredHoursSavedForUser } from '@/lib/services/telemetry/telemetryRepository';
import { STAGE_ORDER, STAGE_LABEL, stageIndex } from '@/lib/services/adoption/stages';
import { DEPARTMENT_LABEL } from '@/lib/services/adoption/catalog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import OpportunityStatus from '@/components/adoption/OpportunityStatus';
import { ScoreGauge, ScoreDriversRadar, ScoreDriversArea, DistributionDonut, SuccessRadial } from '@/components/adoption/charts/DashboardCharts';

export const dynamic = 'force-dynamic';

const bandTone = (band) => ({
  exploring: 'text-slate-500', aware: 'text-blue-600 dark:text-blue-400', building: 'text-amber-600 dark:text-amber-400',
  adopting: 'text-emerald-600 dark:text-emerald-400', leading: 'text-emerald-600 dark:text-emerald-400',
}[band] || 'text-blue-600 dark:text-blue-400');

const STATUS_LABEL = { suggested: 'Suggested', discovered: 'Looked at', considered: 'Considering', in_progress: 'In progress', addressed: 'Addressed', dismissed: 'Not relevant' };

/* Premium metric tile ── icon chip + value + label */
function StatTile({ icon: Icon, value, unit, label, tone = 'default' }) {
  const toneMap = { default: 'text-foreground', blue: 'text-blue-600 dark:text-blue-400', emerald: 'text-emerald-600 dark:text-emerald-400', amber: 'text-amber-600 dark:text-amber-400', violet: 'text-violet-600 dark:text-violet-400' };
  const chipMap = {
    default: 'bg-muted text-muted-foreground', blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  };
  return (
    <Card className="group relative overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="flex items-start gap-3 p-4">
        {Icon && <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${chipMap[tone]}`}><Icon className="h-4 w-4" /></span>}
        <div className="min-w-0">
          <div className={`text-2xl font-bold leading-none tracking-tight ${toneMap[tone]}`}>{value}{unit && <span className="ml-0.5 text-sm font-normal text-muted-foreground">{unit}</span>}</div>
          <div className="mt-1.5 text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHead({ icon: Icon, title, description, action }) {
  return (
    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
      <div className="flex items-start gap-3">
        {Icon && <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400"><Icon className="h-5 w-5" /></span>}
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription className="mt-1 text-xs leading-relaxed">{description}</CardDescription>}
        </div>
      </div>
      {action}
    </CardHeader>
  );
}

/* Premium empty state ── centered icon chip + copy + optional CTA */
function EmptyState({ icon: Icon, title, description, cta }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
      {Icon && <span className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400"><Icon className="h-6 w-6" /></span>}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>}
      {cta && (
        <Link href={cta.href} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700">
          {cta.label} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const d = await getAdoptionDashboard(user.id);
  const [tele, measuredHours] = await Promise.all([
    userExecutionSummary(user.id, { days: 30 }).catch(() => ({ has_data: false })),
    measuredHoursSavedForUser(user.id, { days: 30 }).catch(() => ({ has_measured: false })),
  ]);
  const s = d.score;
  const furthest = d.stages.furthest ? stageIndex(d.stages.furthest) : -1;

  // Derived distributions for the donut charts (real data, computed from opportunities).
  const statusDist = Object.entries(
    d.opportunities.reduce((acc, o) => { const k = STATUS_LABEL[o.status] || 'Suggested'; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
  ).map(([name, value]) => ({ name, value }));
  const complexityDist = Object.entries(
    d.opportunities.reduce((acc, o) => { const k = (o.complexity || 'unknown').replace('_', '-'); acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
  ).map(([name, value]) => ({ name, value }));
  const addressedCount = d.opportunities.filter((o) => o.blueprint_id || o.status === 'addressed').length;
  const maxOppHours = Math.max(1, ...d.opportunities.map((o) => o.est_hours_month || 0));

  return (
    <div className="w-full px-4 py-6 md:px-6 lg:px-8">
      {/* ── Hero header ── */}
      <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0">
            <Badge variant="outline" className="mb-3 gap-1.5 border-blue-500/30 bg-blue-500/5 text-blue-600 dark:text-blue-400">
              <Sparkles className="h-3 w-3" /> AI Adoption
            </Badge>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Your AI Adaptability</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {d.profile?.role ? `${d.profile.role}${d.profile.department ? ` · ${DEPARTMENT_LABEL[d.profile.department] || d.profile.department}` : ''}` : 'A personalised view of your automation adoption.'}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {[
                { icon: TrendingUp, text: furthest >= 0 ? `Stage · ${STAGE_LABEL[d.stages.furthest]}` : 'Not started' },
                { icon: CheckCircle2, text: `${addressedCount}/${d.opportunities.length} addressed` },
                { icon: Clock, text: `~${d.coverage.estimated_remaining_month}h/mo potential` },
              ].map((p, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                  <p.icon className="h-3.5 w-3.5 text-blue-500" />{p.text}
                </span>
              ))}
            </div>
          </div>
          <div className="shrink-0">
            <ScoreGauge score={s.score} label={s.band_label} />
          </div>
        </div>

        {!d.profile?.completed && (
          <div className="relative mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
            <span className="text-sm text-blue-700 dark:text-blue-300">Complete your profile to personalise your opportunity map and recommendations.</span>
            <Link href="/dashboard/profile" className="shrink-0 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700">Complete profile</Link>
          </div>
        )}
      </div>

      {/* ── KPI row ── */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: Gauge, value: s.score, unit: '/100', label: 'Adoption score', tone: 'blue', badge: s.band_label },
          { icon: CheckCircle2, value: addressedCount, suffix: ` / ${d.opportunities.length}`, label: 'opportunities addressed', tone: 'emerald' },
          { icon: TrendingUp, value: `~${d.coverage.estimated_remaining_month}`, unit: 'h/mo', label: 'remaining potential', tone: 'amber' },
          tele.has_data
            ? { icon: BarChart3, value: tele.total, label: `runs · last ${tele.window_days}d`, tone: 'violet' }
            : { icon: Clock, value: `~${d.coverage.estimated_hours_saved_month}`, unit: 'h/mo', label: 'estimated hours saved', tone: 'violet' },
        ].map((k, i) => {
          const chip = { blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' }[k.tone];
          const val = { blue: 'text-blue-600 dark:text-blue-400', emerald: 'text-emerald-600 dark:text-emerald-400', amber: 'text-amber-600 dark:text-amber-400', violet: 'text-violet-600 dark:text-violet-400' }[k.tone];
          const badgeCls = { blue: 'border-blue-500/30 text-blue-600 dark:text-blue-400', emerald: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400', amber: 'border-amber-500/30 text-amber-600 dark:text-amber-400', violet: 'border-violet-500/30 text-violet-600 dark:text-violet-400' }[k.tone];
          return (
            <div key={i} className="rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className={`grid h-11 w-11 place-items-center rounded-xl ${chip}`}><k.icon className="h-5 w-5" /></span>
                {k.badge && <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${badgeCls}`}>{k.badge}</span>}
              </div>
              <div className="mt-4 flex items-baseline gap-0.5">
                <span className={`text-3xl font-bold leading-none tracking-tight ${val}`}>{k.value}</span>
                {k.suffix && <span className="text-lg font-semibold text-muted-foreground">{k.suffix}</span>}
                {k.unit && <span className="ml-0.5 text-sm font-normal text-muted-foreground">{k.unit}</span>}
              </div>
              <div className="mt-1.5 text-xs text-muted-foreground">{k.label}</div>
            </div>
          );
        })}
      </div>

      {/* ── What drives your score + score signals breakdown (50/50) ── */}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionHead icon={Sparkles} title="What drives your score" description="Relative strength across the signals that make up your adoption score." />
          <CardContent>
            <ScoreDriversRadar data={s.breakdown} />
            <p className="mt-3 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">{s.caveat}</p>
          </CardContent>
        </Card>

        <Card>
          <SectionHead icon={BarChart3} title="Score signals breakdown" description="Relative strength of each contributing signal (0–100%)." />
          <CardContent><ScoreDriversArea data={s.breakdown} /></CardContent>
        </Card>
      </div>

      {/* ── Opportunity status + complexity mix (50/50) ── */}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionHead icon={PieChart} title="Opportunity status" description="How your personalised opportunities are distributed." />
          <CardContent>
            {statusDist.length ? <DistributionDonut data={statusDist} centerValue={d.opportunities.length} centerLabel="total" />
              : <p className="text-sm text-muted-foreground">Complete your profile to generate opportunities.</p>}
          </CardContent>
        </Card>

        <Card>
          <SectionHead icon={Layers} title="Complexity mix" description="Opportunities by implementation complexity." />
          <CardContent>
            {complexityDist.length ? <DistributionDonut data={complexityDist} centerValue={complexityDist.reduce((a, c) => a + c.value, 0)} centerLabel="areas" />
              : <p className="text-sm text-muted-foreground">No data yet.</p>}
          </CardContent>
        </Card>
      </div>

      {/* ── Coverage stat tiles ── */}
      <Card className="mt-6">
        <SectionHead icon={Target} title="Workflow coverage & potential" description="Estimated impact across your personalised automation areas." action={<Badge variant="warning" className="text-[10px]">Estimated</Badge>} />
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: CheckCircle2, value: `${addressedCount}`, suffix: ` / ${d.opportunities.length}`, unit: '', label: 'opportunities addressed', tone: 'blue', progress: d.opportunities.length ? Math.round((addressedCount / d.opportunities.length) * 100) : 0 },
              { icon: TrendingUp, value: `~${d.coverage.estimated_remaining_month}`, unit: 'h/mo', label: 'remaining potential', tone: 'violet' },
              { icon: Clock, value: `~${d.coverage.estimated_hours_saved_month}`, unit: 'h/mo', label: 'from addressed areas', tone: 'amber' },
              measuredHours.has_measured
                ? { icon: Zap, value: `~${measuredHours.hours_month}`, unit: 'h/mo', label: 'measured hours saved', tone: 'emerald' }
                : { icon: Zap, value: '—', unit: '', label: 'measured — connect telemetry', tone: 'default' },
            ].map((m, i) => {
              const chip = { default: 'bg-muted text-muted-foreground', blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' }[m.tone];
              const val = { default: 'text-foreground', blue: 'text-blue-600 dark:text-blue-400', violet: 'text-violet-600 dark:text-violet-400', emerald: 'text-emerald-600 dark:text-emerald-400', amber: 'text-amber-600 dark:text-amber-400' }[m.tone];
              const bar = { default: 'bg-muted-foreground/30', blue: 'bg-blue-500', violet: 'bg-violet-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500' }[m.tone];
              return (
                <div key={i} className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between">
                    <span className={`grid h-9 w-9 place-items-center rounded-lg ${chip}`}><m.icon className="h-4 w-4" /></span>
                  </div>
                  <div className="mt-4 flex items-baseline gap-0.5">
                    <span className={`text-3xl font-bold leading-none tracking-tight ${val}`}>{m.value}</span>
                    {m.suffix && <span className="text-lg font-semibold text-muted-foreground">{m.suffix}</span>}
                    {m.unit && <span className="ml-0.5 text-sm font-normal text-muted-foreground">{m.unit}</span>}
                  </div>
                  <div className="mt-1.5 text-xs text-muted-foreground">{m.label}</div>
                  {m.progress != null ? (
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${bar}`} style={{ width: `${m.progress}%` }} />
                    </div>
                  ) : (
                    <span className={`mt-3 h-1 w-10 rounded-full ${bar} opacity-60`} />
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Estimated — based on curated benchmarks, not measured execution. {measuredHours.has_measured
              ? <>A <span className="font-medium text-emerald-700 dark:text-emerald-400">measured</span> hours-saved figure (rate × real run volume) is shown for {measuredHours.blueprints} automation{measuredHours.blueprints === 1 ? '' : 's'}.</>
              : tele.has_data
                ? <>Run data is measured below, but hours-saved stays self-reported until you set “minutes saved / run” on a Blueprint’s report.</>
                : <>Connect <Link href="/dashboard/telemetry" className="font-medium underline">execution telemetry</Link> and set a per-run rate to replace these with measured figures.</>}</span>
          </p>
        </CardContent>
      </Card>

      {/* ── Measured execution activity ── */}
      {tele.has_data && (
        <Card className="mt-6">
          <SectionHead icon={Activity} title="Measured execution activity" description="Real execution data from your connected platform." action={<Badge variant="success" className="text-[10px]">Measured</Badge>} />
          <CardContent>
            <div className="grid items-center gap-6 sm:grid-cols-[140px_1fr]">
              <div className="flex flex-col items-center">
                <SuccessRadial rate={tele.success_rate} />
                <span className="mt-1 text-xs text-muted-foreground">success rate</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatTile icon={BarChart3} value={tele.total} label={`runs · last ${tele.window_days}d`} tone="blue" />
                <StatTile icon={TrendingUp} value={`~${tele.measured_monthly_runs}`} label="runs / month (measured)" />
                <StatTile icon={Activity} value={`${tele.intervention_rate ?? 0}%`} label="needed a human" tone="amber" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Stage progression ── */}
      <Card className="mt-6">
        <SectionHead icon={TrendingUp} title="Your progression" description="The last three stages (Implemented → Active → Measured) advance only when you confirm a workflow is deployed and report outcomes — real confirmations, not inference." />
        <CardContent>
          <div className="flex flex-wrap gap-y-6 pt-2">
            {STAGE_ORDER.map((stage, i) => {
              const reached = furthest >= i;
              const current = furthest === i;
              return (
                <div key={stage} className="relative flex min-w-[88px] flex-1 flex-col items-center">
                  {i > 0 && <span className={`absolute right-1/2 top-[15px] h-0.5 w-full ${furthest >= i ? 'bg-blue-500' : 'bg-border'}`} />}
                  <span className={`relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 text-[11px] font-semibold transition-colors ${reached ? 'border-blue-500 bg-blue-500 text-white' : 'border-border bg-card text-muted-foreground'} ${current ? 'ring-4 ring-blue-500/20' : ''}`}>
                    {reached ? <Check className="h-4 w-4" /> : i + 1}
                  </span>
                  <span className={`mt-2.5 max-w-[92px] text-center text-[11px] leading-tight ${reached ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{STAGE_LABEL[stage]}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Next actions ── */}
      {d.next_actions.length > 0 && (
        <Card className="mt-6">
          <SectionHead icon={ListChecks} title="Recommended next actions" description="The highest-leverage things to do next, tailored to where you are." />
          <CardContent>
            {d.next_actions.length === 1 ? (
              <EmptyState icon={ListChecks} title={d.next_actions[0].label} description={d.next_actions[0].detail} cta={{ href: d.next_actions[0].href, label: 'Get started' }} />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {d.next_actions.map((a, i) => (
                  <li key={a.key}>
                    <Link href={a.href} className="group relative flex h-full items-start gap-3 overflow-hidden rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-blue-500/40 hover:shadow-md">
                      <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-blue-600 to-violet-500 opacity-0 transition-opacity group-hover:opacity-100" />
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-sm font-bold text-blue-600 dark:text-blue-400">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-semibold">{a.label}<ArrowUpRight className="h-3.5 w-3.5 text-blue-500 opacity-0 transition-opacity group-hover:opacity-100" /></span>
                        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{a.detail}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Opportunity map ── */}
      <Card className="mt-6" id="opportunities">
        <SectionHead icon={Sparkles} title="Your opportunity map" description="Personalised automation areas ranked by estimated monthly time saved." action={d.opportunities.length > 0 ? <Badge variant="outline" className="text-[10px]">{d.opportunities.length} areas</Badge> : null} />
        <CardContent>
          {d.opportunities.length === 0 ? (
            <EmptyState icon={Sparkles} title="No opportunities yet" description="Complete your profile — role, department and industry — to generate your personalised opportunity map." cta={{ href: '/dashboard/profile', label: 'Complete profile' }} />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Opportunity</th>
                      <th className="min-w-[220px] px-4 py-3 font-medium">Est. monthly saving</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.opportunities.map((o) => {
                      const hours = o.est_hours_month || 0;
                      const pct = maxOppHours ? Math.round((hours / maxOppHours) * 100) : 0;
                      const addressed = !!o.blueprint_id || o.status === 'addressed';
                      const type = (o.complexity || '').replace('_', '-');
                      const typeCls = { 'low-code': 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400', 'no-code': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', api: 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400' }[type] || 'border-border text-muted-foreground';
                      return (
                        <tr key={o.area_key} className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1.5 font-medium">{o.label}{addressed && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${addressed ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} /></div>
                              <span className="shrink-0 tabular-nums text-muted-foreground">~{hours}h/mo</span>
                            </div>
                          </td>
                          <td className="px-4 py-3"><span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${typeCls}`}>{type || '—'}</span></td>
                          <td className="px-4 py-3"><OpportunityStatus areaKey={o.area_key} initial={o.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Skills & readiness ── */}
      <Card className="mt-6">
        <SectionHead icon={GraduationCap} title="Skills & readiness" description="How ready your current skill level is for the automations we recommend." />
        <CardContent>
          {d.skills.engaged_complexity.length > 0 ? (
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/20 p-5 sm:flex-row sm:items-center">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400"><GaugeCircle className="h-5 w-5" /></span>
              <div className="flex-1">
                <p className="text-sm leading-relaxed">{d.skills.readiness_note}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">Engaged complexity:</span>
                  {d.skills.engaged_complexity.map((c) => <Badge key={c} variant="secondary" className="text-[10px]">{(c || '').replace('_', '-')}</Badge>)}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState icon={GraduationCap} title="Tell us your skill level" description={d.skills.readiness_note || 'Add your technical skill level to tailor recommendations to what you can build today.'} cta={{ href: '/dashboard/profile', label: 'Update profile' }} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
