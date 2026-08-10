import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { getOrgAccess } from '@/lib/services/org/orgAccess';
import { orgOpportunityMap } from '@/lib/services/org/orgRepository';
import { VyradeMark } from '@/components/VyradeLogo';

export const dynamic = 'force-dynamic';

export default async function OrgOpportunitiesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const access = await getOrgAccess(user.id);
  if (!access) redirect('/org/create');
  if (access.scope === 'none') redirect('/org');

  const { by_department, total_instances } = await orgOpportunityMap(access.org_id, access.departmentFilter);

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Organisation opportunity map</h1>
        <p className="mt-1 text-sm text-muted-foreground">Personal opportunity maps rolled up and de-duplicated across the team · {total_instances} total across members.</p>

        {by_department.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">No opportunities yet — members build their maps by completing their profile.</p>
        ) : by_department.map((d) => (
          <section key={d.key} className="mt-6">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />{d.label} <span className="text-xs font-normal text-muted-foreground">· {d.distinct_areas} areas · {d.instances} across members · {d.addressed} addressed</span></h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40"><tr>{['Opportunity', 'People', 'In progress', 'Addressed', 'Est. saving'].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{h}</th>)}</tr></thead>
                <tbody>
                  {d.areas.map((a) => (
                    <tr key={a.area_key} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 font-medium">{a.label}</td>
                      <td className="px-3 py-2 text-muted-foreground">{a.people}</td>
                      <td className="px-3 py-2 text-muted-foreground">{a.in_progress}</td>
                      <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400">{a.addressed}</td>
                      <td className="px-3 py-2 text-muted-foreground">~{a.est_hours_month}h/mo <span className="text-[10px]">(est)</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
    </main>
  );
}
