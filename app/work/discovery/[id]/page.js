import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { getOwnedSession } from '@/lib/services/work-intelligence/discovery/discoveryRepository';
import { VyradeMark } from '@/components/VyradeLogo';
import DiscoveryFlow from '@/components/work-intelligence/DiscoveryFlow';

export const dynamic = 'force-dynamic';

export default async function DiscoveryPage({ params }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const session = await getOwnedSession(params.id, user.id);
  if (!session) notFound();

  const ctx = session.context || {};
  const signals = ctx.signals || [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
          <Link href="/work/tasks" className="flex items-center gap-2"><VyradeMark className="h-6 w-auto" /><span className="text-sm font-semibold">Vyrade</span></Link>
          <Link href="/work/tasks" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Tasks</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Explore Automation With Vyrade</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{session.task_name || 'Task'}</h1>
        {ctx.project && <p className="mt-1 text-sm text-muted-foreground">{ctx.project}</p>}

        {signals.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {signals.map((s) => <span key={s.key} className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/5 px-2 py-0.5 text-[11px] text-blue-600 dark:text-blue-400"><Sparkles className="h-3 w-3" />{s.label}</span>)}
          </div>
        )}

        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          A few focused questions turn this task into a precise Blueprint — instead of sending the raw task to an AI. Answer what you can; anything left blank is explicitly marked for clarification.
        </div>

        <div className="mt-6"><DiscoveryFlow sessionId={session.id} initial={session} /></div>
      </main>
    </div>
  );
}
