import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { getOrgAccess } from '@/lib/services/org/orgAccess';
import { VyradeMark } from '@/components/VyradeLogo';
import CreateOrgForm from '@/components/org/CreateOrgForm';

export const dynamic = 'force-dynamic';

export default async function CreateOrgPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (await getOrgAccess(user.id)) redirect('/org');

  return (
    <main className="mx-auto max-w-lg px-5 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Create your organisation</h1>
        <p className="mt-1 text-sm text-muted-foreground">Roll up your team’s automation adoption into a shared executive view.</p>
        <div className="mt-6"><CreateOrgForm /></div>
    </main>
  );
}
