import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { VyradeMark } from '@/components/VyradeLogo';
import ProfileForm from '@/components/adoption/ProfileForm';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">Tell us about your role so we can map the automation opportunities that matter to you.</p>
      <div className="mt-6"><ProfileForm /></div>
    </main>
  );
}
