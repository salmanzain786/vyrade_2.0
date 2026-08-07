import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { VyradeMark } from '@/components/VyradeLogo';
import AcceptInvite from '@/components/org/AcceptInvite';

export const dynamic = 'force-dynamic';

export default async function JoinOrgPage({ searchParams }) {
  const user = await getCurrentUser();
  const token = searchParams?.token || '';
  if (!user) redirect(`/login?next=${encodeURIComponent(`/org/join?token=${token}`)}`);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-5 py-3"><Link href="/"><VyradeMark className="h-6 w-auto" /></Link><span className="text-sm font-semibold">Vyrade</span></div>
      </header>
      <main className="mx-auto max-w-lg px-5 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Join organisation</h1>
        <div className="mt-6"><AcceptInvite /></div>
      </main>
    </div>
  );
}
