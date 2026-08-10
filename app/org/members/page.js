import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { getOrgAccess } from '@/lib/services/org/orgAccess';
import { listMembers, listDepartments } from '@/lib/services/org/membershipRepository';
import { listInvitations } from '@/lib/services/org/invitationRepository';
import { canInvite, ROLE_LABEL } from '@/lib/services/org/access';
import { DEPARTMENT_LABEL } from '@/lib/services/adoption/catalog';
import { VyradeMark } from '@/components/VyradeLogo';
import InviteForm from '@/components/org/InviteForm';

export const dynamic = 'force-dynamic';

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
    <main className="mx-auto max-w-4xl px-5 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <p className="mt-1 text-sm text-muted-foreground">{access.org_name} · {members.length} member{members.length === 1 ? '' : 's'}{access.scope === 'department' ? ` · ${DEPARTMENT_LABEL[access.departmentFilter] || access.departmentFilter}` : ''}</p>

        {canInvite(access.role) && (
          <div className="mt-6 rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold">Invite a teammate</h2>
            <InviteForm departments={departments} />
          </div>
        )}

        <div className="mt-6 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40"><tr>{['Member', 'Role', 'Department'].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{h}</th>)}</tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2"><span className="font-medium">{m.name || '—'}</span><span className="block text-xs text-muted-foreground">{m.email}</span></td>
                  <td className="px-3 py-2">{ROLE_LABEL[m.role] || m.role}</td>
                  <td className="px-3 py-2 text-muted-foreground">{m.department ? (DEPARTMENT_LABEL[m.department] || m.department) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canInvite(access.role) && invites.length > 0 && (
          <>
            <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pending invitations</h2>
            <ul className="space-y-1 text-sm">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
                  <span className="font-medium">{i.email}</span>
                  <span className="text-xs text-muted-foreground">{ROLE_LABEL[i.role] || i.role}{i.department ? ` · ${DEPARTMENT_LABEL[i.department] || i.department}` : ''}</span>
                </li>
              ))}
            </ul>
          </>
        )}
    </main>
  );
}
