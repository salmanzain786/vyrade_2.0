import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { getOrgAccess } from '@/lib/services/org/orgAccess';
import { orgOpportunityMap } from '@/lib/services/org/orgRepository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function OrgOpportunitiesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const access = await getOrgAccess(user.id);
  if (!access) redirect('/org/create');
  if (access.scope === 'none') redirect('/org');

  const { by_department, total_instances } = await orgOpportunityMap(access.org_id, access.departmentFilter);

  return (
    <div className="w-full px-4 py-6 md:px-6 lg:px-8">
      <Link href="/org" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to overview
      </Link>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-blue-600/10 via-card to-card p-6 md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400"><Sparkles className="h-6 w-6" /></span>
          <div>
            <Badge variant="outline" className="mb-2 gap-1.5 border-blue-500/30 bg-blue-500/5 text-blue-600 dark:text-blue-400">Opportunities</Badge>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Organisation opportunity map</h1>
            <p className="mt-1 text-sm text-muted-foreground">Personal maps rolled up and de-duplicated across the team · {total_instances} total across members.</p>
          </div>
        </div>
      </div>

      {by_department.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
          <span className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400"><Sparkles className="h-6 w-6" /></span>
          <p className="text-sm font-medium">No opportunities yet</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">Members build their maps by completing their profile — they’ll roll up here automatically.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {by_department.map((d) => (
            <Card key={d.key}>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"><Sparkles className="h-4 w-4" /></span>
                  <CardTitle className="text-base">{d.label}</CardTitle>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{d.distinct_areas} areas</Badge>
                  <Badge variant="secondary" className="text-[10px]">{d.instances} across members</Badge>
                  <Badge variant="success" className="text-[10px]">{d.addressed} addressed</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-xl border border-border">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border bg-muted/40"><tr>{['Opportunity', 'People', 'In progress', 'Addressed', 'Est. saving'].map((h) => <th key={h} className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{h}</th>)}</tr></thead>
                      <tbody>
                        {d.areas.map((a) => (
                          <tr key={a.area_key} className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30">
                            <td className="px-4 py-2.5 font-medium">{a.label}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{a.people}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{a.in_progress}</td>
                            <td className="px-4 py-2.5 font-medium text-emerald-600 dark:text-emerald-400">{a.addressed}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">~{a.est_hours_month}h/mo <span className="text-[10px]">(est)</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
