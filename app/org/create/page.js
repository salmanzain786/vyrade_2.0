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
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-5 py-3"><Link href="/"><VyradeMark className="h-6 w-auto" /></Link><span className="text-sm font-semibold">Vyrade</span></div>
      </header>
      <main className="mx-auto max-w-lg px-5 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Create your organisation</h1>
        <p className="mt-1 text-sm text-muted-foreground">Roll up your team’s automation adoption into a shared executive view.</p>
        <div className="mt-6"><CreateOrgForm /></div>
      </main>
    </div>
  );
}
