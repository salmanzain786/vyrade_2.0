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
    <main className="mx-auto max-w-lg px-5 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Join organisation</h1>
        <div className="mt-6"><AcceptInvite /></div>
    </main>
  );
}
