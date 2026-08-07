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
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
          <Link href="/dashboard" className="flex items-center gap-2"><VyradeMark className="h-6 w-auto" /><span className="text-sm font-semibold">Vyrade</span></Link>
          <Link href="/dashboard" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Dashboard</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tell us about your role so we can map the automation opportunities that matter to you.</p>
        <div className="mt-6"><ProfileForm /></div>
      </main>
    </div>
  );
}
