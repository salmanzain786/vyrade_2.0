import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Users, UserPlus, Mail } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { getOrgAccess } from '@/lib/services/org/orgAccess';
import { listMembers, listDepartments } from '@/lib/services/org/membershipRepository';
import { listInvitations } from '@/lib/services/org/invitationRepository';
import { canInvite, ROLE_LABEL } from '@/lib/services/org/access';
import { DEPARTMENT_LABEL } from '@/lib/services/adoption/catalog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import InviteForm from '@/components/org/InviteForm';

export const dynamic = 'force-dynamic';

const initials = (name, email) => {
  const src = (name || email || '?').trim();
  const parts = src.split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : src.slice(0, 2)).toUpperCase();
};

export default async function MembersPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const access = await getOrgAccess(user.id);
  if (!access) redirect('/org/create');
  if (access.scope === 'none') redirect('/org');

  const [members, departments, invites] = await Promise.all([
    listMembers(access.org_id, { department: access.departmentFilter }),
    listDepartments(access.org_id),
    canInvite(access.role) ? listInvitations(access.org_id) : Promise.resolve([]),
  ]);

  return (
    <div className="w-full px-4 py-6 md:px-6 lg:px-8">
      <Link href="/org" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to overview
      </Link>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-blue-600/10 via-card to-card p-6 md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400"><Users className="h-6 w-6" /></span>
          <div>
            <Badge variant="outline" className="mb-2 gap-1.5 border-blue-500/30 bg-blue-500/5 text-blue-600 dark:text-blue-400">Team</Badge>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Members</h1>
            <p className="mt-1 text-sm text-muted-foreground">{access.org_name} · {members.length} member{members.length === 1 ? '' : 's'}{access.scope === 'department' ? ` · ${DEPARTMENT_LABEL[access.departmentFilter] || access.departmentFilter}` : ''}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Members table */}
        <Card className="order-2 lg:order-1">
          <CardHeader className="flex flex-row items-center gap-2.5 space-y-0">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"><Users className="h-4 w-4" /></span>
            <CardTitle className="text-base">All members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/40"><tr>{['Member', 'Role', 'Department'].map((h) => <th key={h} className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{h}</th>)}</tr></thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.user_id} className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-500/10 text-[11px] font-semibold text-blue-600 dark:text-blue-400">{initials(m.name, m.email)}</span>
                            <div className="min-w-0"><span className="font-medium">{m.name || '—'}</span><span className="block truncate text-xs text-muted-foreground">{m.email}</span></div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5"><Badge variant="secondary" className="text-[10px]">{ROLE_LABEL[m.role] || m.role}</Badge></td>
                        <td className="px-4 py-2.5 text-muted-foreground">{m.department ? (DEPARTMENT_LABEL[m.department] || m.department) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Invite + pending */}
        <div className="order-1 space-y-5 lg:order-2">
          {canInvite(access.role) && (
            <Card>
              <CardHeader className="flex flex-row items-start gap-2.5 space-y-0">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"><UserPlus className="h-4 w-4" /></span>
                <div>
                  <CardTitle className="text-base">Invite a teammate</CardTitle>
                  <CardDescription className="mt-1 text-xs">They’ll get an email to join {access.org_name}.</CardDescription>
                </div>
              </CardHeader>
              <CardContent><InviteForm departments={departments} /></CardContent>
            </Card>
          )}

          {canInvite(access.role) && invites.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center gap-2.5 space-y-0">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400"><Mail className="h-4 w-4" /></span>
                <CardTitle className="text-base">Pending invitations</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {invites.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                      <span className="min-w-0"><span className="block truncate text-sm font-medium">{i.email}</span><span className="text-xs text-muted-foreground">{ROLE_LABEL[i.role] || i.role}{i.department ? ` · ${DEPARTMENT_LABEL[i.department] || i.department}` : ''}</span></span>
                      <Badge variant="warning" className="shrink-0 text-[10px]">Pending</Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
