import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Building2, MapPin, MapPinOff, Hammer, DollarSign, ShieldCheck, Users, ArrowRight, Lightbulb, Server, Gauge } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { getOrgAccess } from '@/lib/services/org/orgAccess';
import { execReport } from '@/lib/services/org/orgRepository';
import { DEPARTMENT_LABEL } from '@/lib/services/adoption/catalog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const bandTone = (p) => (p >= 60 ? 'text-emerald-600 dark:text-emerald-400' : p >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400');

const PLATFORM_BARS = [
  { dot: 'bg-blue-500', bar: 'bg-blue-500' },
  { dot: 'bg-emerald-500', bar: 'bg-emerald-500' },
  { dot: 'bg-amber-500', bar: 'bg-amber-500' },
  { dot: 'bg-violet-500', bar: 'bg-violet-500' },
  { dot: 'bg-rose-500', bar: 'bg-rose-500' },
];

function KpiCard({ icon: Icon, value, label, tone = 'blue' }) {
  const chip = { blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' }[tone];
  const val = { blue: 'text-blue-600 dark:text-blue-400', emerald: 'text-emerald-600 dark:text-emerald-400', amber: 'text-amber-600 dark:text-amber-400', violet: 'text-violet-600 dark:text-violet-400' }[tone];
  const glow = { blue: 'bg-blue-500/20', emerald: 'bg-emerald-500/20', amber: 'bg-amber-500/20', violet: 'bg-violet-500/20' }[tone];
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <div className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full blur-2xl transition-opacity ${glow} opacity-60 group-hover:opacity-100`} />
      <span className={`relative grid h-11 w-11 place-items-center rounded-xl ${chip}`}><Icon className="h-5 w-5" /></span>
      <div className={`relative mt-4 text-3xl font-bold leading-none tracking-tight ${val}`}>{value}</div>
      <div className="relative mt-1.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Q({ icon: Icon, q, children }) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-center gap-2.5 space-y-0 pb-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"><Icon className="h-4 w-4" /></span>
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{q}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ChartCard({ icon: Icon, title, action, children, className }) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"><Icon className="h-4 w-4" /></span>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function OrgDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const access = await getOrgAccess(user.id);
  if (!access) redirect('/org/create');

  if (access.scope === 'none') {
    return (
      <Shell orgName={access.org_name}>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            You’re a member of <span className="font-medium text-foreground">{access.org_name}</span>. The organisation dashboard is available to managers and admins.
            <div className="mt-3"><Link href="/dashboard" className="font-medium text-blue-600 hover:underline dark:text-blue-400">Go to your personal dashboard →</Link></div>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const r = await execReport(access.org_id, access.departmentFilter);
  const scopeNote = access.scope === 'department' ? `${DEPARTMENT_LABEL[access.departmentFilter] || access.departmentFilter} department` : 'Whole organisation';
  const totalWorkflows = r.platforms.reduce((a, p) => a + (p.count || 0), 0);
  const totalMembers = r.departments.reduce((a, d) => a + (d.members || 0), 0);
  const orgAdoption = totalMembers ? Math.round(r.departments.reduce((a, d) => a + (d.adoption_pct || 0) * (d.members || 0), 0) / totalMembers) : 0;

  return (
    <Shell orgName={access.org_name} scopeNote={scopeNote} score={orgAdoption}>
      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Users} value={r.member_count} label={`member${r.member_count === 1 ? '' : 's'}`} tone="blue" />
        <KpiCard icon={Hammer} value={r.building.total} label="blueprints in progress" tone="violet" />
        <KpiCard icon={DollarSign} value={formatMoney(r.cost.total_cost) ?? '$0.00'} label={`across ${r.cost.conversations} conversation${r.cost.conversations === 1 ? '' : 's'}`} tone="emerald" />
        <KpiCard icon={Lightbulb} value={r.untapped_opportunities} label="untapped opportunities" tone="amber" />
      </div>

      {/* Platform usage + governance */}
      <div className="mt-6 grid items-stretch gap-5 lg:grid-cols-2">
        <ChartCard icon={Server} title="Platform usage" action={<Badge variant="outline" className="text-[10px]">{totalWorkflows} total</Badge>}>
          {r.platforms.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No workflows built yet.</p>
          ) : (
            <ul className="space-y-4">
              {r.platforms.map((p, i) => {
                const pct = totalWorkflows ? Math.round((p.count / totalWorkflows) * 100) : 0;
                const c = PLATFORM_BARS[i % PLATFORM_BARS.length];
                return (
                  <li key={p.platform} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 font-medium"><span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />{p.platform}</span>
                      <span className="text-muted-foreground"><span className="font-semibold text-foreground">{p.count}</span> · {pct}%</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${c.bar}`} style={{ width: `${pct}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          )}
        </ChartCard>

        <ChartCard icon={ShieldCheck} title="Is it controlled">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Scanned blueprints', value: r.governance.scanned, status: 'neutral' },
              { label: 'Without an owner', value: r.governance.no_owner, status: r.governance.no_owner ? 'bad' : 'good' },
              { label: 'Missing approvals', value: r.governance.missing_approvals, status: r.governance.missing_approvals ? 'bad' : 'good' },
              { label: 'Sensitive-data usage', value: r.governance.sensitive_data, status: r.governance.sensitive_data ? 'warn' : 'good' },
            ].map((g) => {
              const tone = { neutral: 'text-foreground', good: 'text-emerald-600 dark:text-emerald-400', warn: 'text-amber-600 dark:text-amber-400', bad: 'text-red-600 dark:text-red-400' }[g.status];
              const dot = { neutral: 'bg-muted-foreground/40', good: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-red-500' }[g.status];
              const tag = { neutral: 'scanned', good: 'clear', warn: 'review', bad: 'action' }[g.status];
              return (
                <div key={g.label} className="rounded-xl border border-border bg-gradient-to-b from-card to-muted/20 p-4">
                  <div className="flex items-center justify-between">
                    <span className={`text-2xl font-bold tracking-tight ${tone}`}>{g.value}</span>
                    <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"><span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{tag}</span>
                  </div>
                  <div className="mt-1.5 text-xs text-muted-foreground">{g.label}</div>
                </div>
              );
            })}
          </div>
        </ChartCard>
      </div>

      {/* Where using / where not */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Q icon={MapPin} q="Where are we using AI">
          {r.using_ai.length === 0 ? <p className="text-sm text-muted-foreground">No active departments yet.</p> : (
            <ul className="space-y-2 text-sm">{r.using_ai.slice(0, 6).map((d) => (
              <li key={d.label} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-muted-foreground">{d.label}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className={`block h-full rounded-full ${d.score >= 60 ? 'bg-emerald-500' : d.score >= 40 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, d.score)}%` }} /></span>
                <span className={`w-8 shrink-0 text-right font-semibold tabular-nums ${bandTone(d.score)}`}>{d.score}</span>
              </li>
            ))}</ul>
          )}
        </Q>
        <Q icon={MapPinOff} q="Where aren't we">
          {r.not_using_ai.length === 0 ? <p className="text-sm text-muted-foreground">Every department has started.</p> : (
            <ul className="flex flex-wrap gap-1.5">{r.not_using_ai.slice(0, 10).map((d) => <Badge key={d.label} variant="outline" className="text-[11px]">{d.label} · {d.members}</Badge>)}</ul>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">{r.untapped_opportunities} untapped opportunities across personal maps.</p>
        </Q>
      </div>

      {/* Department comparison */}
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center gap-2.5 space-y-0">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"><Building2 className="h-4 w-4" /></span>
          <CardTitle className="text-base">Department comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40"><tr>{['Department', 'Members', 'Adoption', 'Started', 'Complete', 'Built'].map((h) => <th key={h} className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{h}</th>)}</tr></thead>
                <tbody>
                  {r.departments.length === 0 && <tr><td className="px-4 py-3 text-muted-foreground" colSpan={6}>No members yet.</td></tr>}
                  {r.departments.map((d) => (
                    <tr key={d.key} className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">{d.label}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{d.members}</td>
                      <td className="px-4 py-2.5"><span className={`font-semibold ${bandTone(d.adoption_pct)}`}>{d.adoption_pct}</span></td>
                      <td className="px-4 py-2.5 text-muted-foreground">{d.blueprints_started}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{d.blueprints_completed}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{d.implementations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/org/opportunities" className="group inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:border-blue-500/40 hover:bg-blue-500/5">Organisation opportunity map <ArrowRight className="h-4 w-4 text-blue-600 transition-transform group-hover:translate-x-0.5 dark:text-blue-400" /></Link>
        <Link href="/org/members" className="group inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:border-blue-500/40 hover:bg-blue-500/5">Members & invitations <ArrowRight className="h-4 w-4 text-blue-600 transition-transform group-hover:translate-x-0.5 dark:text-blue-400" /></Link>
      </div>
    </Shell>
  );
}

function Shell({ orgName, scopeNote, score, children }) {
  return (
    <div className="w-full px-4 py-6 md:px-6 lg:px-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-blue-600/10 via-card to-card p-6 md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400"><Building2 className="h-6 w-6" /></span>
            <div>
              <Badge variant="outline" className="mb-2 gap-1.5 border-blue-500/30 bg-blue-500/5 text-blue-600 dark:text-blue-400">Executive overview</Badge>
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{orgName}</h1>
              {scopeNote && <p className="mt-1 text-sm text-muted-foreground">{scopeNote}</p>}
            </div>
          </div>
          {score != null && (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-4 py-3 backdrop-blur">
              <div className="text-right">
                <div className={`text-3xl font-bold leading-none ${bandTone(score)}`}>{score}</div>
                <div className="mt-1 text-[11px] font-medium text-muted-foreground">org adoption</div>
              </div>
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"><Gauge className="h-5 w-5" /></span>
            </div>
          )}
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}
