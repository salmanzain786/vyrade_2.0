import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Building2, MapPin, MapPinOff, Hammer, DollarSign, ShieldCheck, Users, Sparkles, ArrowRight, Home } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { getOrgAccess } from '@/lib/services/org/orgAccess';
import { execReport } from '@/lib/services/org/orgRepository';
import { DEPARTMENT_LABEL } from '@/lib/services/adoption/catalog';
import { VyradeMark } from '@/components/VyradeLogo';
import { formatMoney } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const bandTone = (p) => (p >= 60 ? 'text-emerald-600 dark:text-emerald-400' : p >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400');

function Q({ icon: Icon, q, children }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />{q}</div>
      {children}
    </div>
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
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          You’re a member of <span className="font-medium text-foreground">{access.org_name}</span>. The organisation dashboard is available to managers and admins.
          <div className="mt-3"><Link href="/dashboard" className="text-blue-600 hover:underline dark:text-blue-400">Go to your personal dashboard →</Link></div>
        </div>
      </Shell>
    );
  }

  const r = await execReport(access.org_id, access.departmentFilter);
  const scopeNote = access.scope === 'department' ? `${DEPARTMENT_LABEL[access.departmentFilter] || access.departmentFilter} department` : 'Whole organisation';

  return (
    <Shell orgName={access.org_name} scopeNote={scopeNote}>
      {/* 2.6 — the 5 executive questions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Q icon={MapPin} q="Where are we using AI">
          {r.using_ai.length === 0 ? <p className="text-sm text-muted-foreground">No active departments yet.</p> : (
            <ul className="space-y-1 text-sm">{r.using_ai.slice(0, 6).map((d) => <li key={d.label} className="flex justify-between"><span>{d.label}</span><span className={bandTone(d.score)}>{d.score}</span></li>)}</ul>
          )}
        </Q>
        <Q icon={MapPinOff} q="Where aren't we">
          {r.not_using_ai.length === 0 ? <p className="text-sm text-muted-foreground">Every department has started.</p> : (
            <ul className="space-y-1 text-sm text-muted-foreground">{r.not_using_ai.slice(0, 6).map((d) => <li key={d.label}>{d.label} · {d.members} member{d.members === 1 ? '' : 's'}</li>)}</ul>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">{r.untapped_opportunities} untapped opportunities across personal maps.</p>
        </Q>
        <Q icon={Hammer} q="What's being built">
          <div className="text-2xl font-bold">{r.building.total}<span className="ml-1 text-sm font-normal text-muted-foreground">blueprints</span></div>
          <div className="mt-1 text-xs text-muted-foreground">{r.building.requirements_complete} complete · {r.building.collecting_requirements} in progress · {r.building.implementations} built</div>
        </Q>
        <Q icon={DollarSign} q="What's it costing">
          <div className="text-2xl font-bold">{formatMoney(r.cost.total_cost) ?? '$0.00'}</div>
          <div className="mt-1 text-xs text-muted-foreground">across {r.cost.conversations} conversation{r.cost.conversations === 1 ? '' : 's'}</div>
        </Q>
        <Q icon={ShieldCheck} q="Is it controlled">
          <ul className="space-y-1 text-sm">
            <li className="flex justify-between"><span className="text-muted-foreground">Scanned blueprints</span><span>{r.governance.scanned}</span></li>
            <li className="flex justify-between"><span className="text-muted-foreground">Without an owner</span><span className={r.governance.no_owner ? 'text-red-600 dark:text-red-400' : ''}>{r.governance.no_owner}</span></li>
            <li className="flex justify-between"><span className="text-muted-foreground">Missing approvals</span><span className={r.governance.missing_approvals ? 'text-red-600 dark:text-red-400' : ''}>{r.governance.missing_approvals}</span></li>
            <li className="flex justify-between"><span className="text-muted-foreground">Sensitive-data usage</span><span className={r.governance.sensitive_data ? 'text-amber-600 dark:text-amber-400' : ''}>{r.governance.sensitive_data}</span></li>
          </ul>
        </Q>
        <Q icon={Users} q="Team">
          <div className="text-2xl font-bold">{r.member_count}<span className="ml-1 text-sm font-normal text-muted-foreground">member{r.member_count === 1 ? '' : 's'}</span></div>
          <Link href="/org/members" className="mt-1 inline-block text-xs text-blue-600 hover:underline dark:text-blue-400">Manage members →</Link>
        </Q>
      </div>

      {/* 2.3 — department comparison */}
      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Department comparison</h2>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40"><tr>{['Department', 'Members', 'Adoption', 'Started', 'Complete', 'Built'].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{h}</th>)}</tr></thead>
          <tbody>
            {r.departments.length === 0 && <tr><td className="px-3 py-2 text-muted-foreground" colSpan={6}>No members yet.</td></tr>}
            {r.departments.map((d) => (
              <tr key={d.key} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2 font-medium">{d.label}</td>
                <td className="px-3 py-2 text-muted-foreground">{d.members}</td>
                <td className="px-3 py-2"><span className={`font-medium ${bandTone(d.adoption_pct)}`}>{d.adoption_pct}</span></td>
                <td className="px-3 py-2 text-muted-foreground">{d.blueprints_started}</td>
                <td className="px-3 py-2 text-muted-foreground">{d.blueprints_completed}</td>
                <td className="px-3 py-2 text-muted-foreground">{d.implementations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 2.5 — platform usage */}
      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Platform usage</h2>
      {r.platforms.length === 0 ? <p className="text-sm text-muted-foreground">No workflows built yet.</p> : (
        <div className="flex flex-wrap gap-3">
          {r.platforms.map((p) => (
            <div key={p.platform} className="rounded-lg border border-border bg-card px-4 py-3"><div className="text-lg font-bold">{p.count}</div><div className="text-xs uppercase text-muted-foreground">{p.platform}</div></div>
          ))}
        </div>
      )}

      <div className="mt-8 flex gap-3">
        <Link href="/org/opportunities" className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent">Organisation opportunity map <ArrowRight className="h-4 w-4" /></Link>
        <Link href="/org/members" className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent">Members & invitations <ArrowRight className="h-4 w-4" /></Link>
      </div>
    </Shell>
  );
}

function Shell({ orgName, scopeNote, children }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2"><VyradeMark className="h-6 w-auto" /><span className="text-sm font-semibold">Vyrade</span></Link>
          <Link href="/" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Home className="h-3.5 w-3.5" /> Workspace</Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><Building2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />{orgName}</h1>
        {scopeNote && <p className="mt-1 text-sm text-muted-foreground">Executive overview · {scopeNote}</p>}
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}
