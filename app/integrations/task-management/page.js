import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Home, Plug, ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { getActiveConnection, toPublic } from '@/lib/services/work-intelligence/connectionRepository';
import { isPlatformConfigured } from '@/lib/config/workIntelligence';
import { VyradeMark } from '@/components/VyradeLogo';
import ConnectionSetup from '@/components/work-intelligence/ConnectionSetup';

export const dynamic = 'force-dynamic';

const PILOT = 'clickup';

export default async function TaskManagementPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const connection = toPublic(await getActiveConnection(user.id, PILOT).catch(() => null));
  const configured = isPlatformConfigured(PILOT);
  const connected = searchParams?.connected;
  const error = searchParams?.error;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2"><VyradeMark className="h-6 w-auto" /><span className="text-sm font-semibold">Vyrade</span></Link>
          <Link href="/" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Home className="h-3.5 w-3.5" /> Workspace</Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Task Management Integrations</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Connect the tools where work is already managed. Vyrade analyses <strong>authorised</strong> tasks, projects and recurring work patterns to identify automation opportunities — it never reads your workspace without explicit scope, and it isn’t employee surveillance.
        </p>

        {connected && <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Connected to {connected}. Configure scope &amp; governance below before any analysis runs.</div>}
        {error && <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-400"><AlertTriangle className="h-4 w-4" /> Connection error: {error}</div>}

        {!connection ? (
          <section className="mt-6 rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400"><Plug className="h-5 w-5" /></span>
              <div>
                <div className="font-medium">ClickUp <span className="text-xs font-normal text-muted-foreground">(pilot platform)</span></div>
                <div className="text-xs text-muted-foreground">Real task, subtask, checklist, comment and status-history retrieval.</div>
              </div>
            </div>
            <div className="mt-4">
              {configured ? (
                <a href={`/api/integrations/${PILOT}/connect`} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"><Plug className="h-4 w-4" /> Connect ClickUp</a>
              ) : (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">ClickUp OAuth isn’t configured on this server yet. Set <code>CLICKUP_CLIENT_ID</code> and <code>CLICKUP_CLIENT_SECRET</code> to enable connection.</p>
              )}
            </div>
            <p className="mt-4 flex items-start gap-2 text-[11px] text-muted-foreground"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" /> After connecting you choose exactly which projects and fields Vyrade may read, whether it can write back, how long task content is retained, and who can see identified opportunities. Nothing is analysed until you set scope.</p>
          </section>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-sm">
              <span className="text-blue-700 dark:text-blue-400">Tasks synced? Explore them for automation.</span>
              <Link href="/work/tasks" className="font-medium text-blue-600 hover:underline dark:text-blue-400">Browse your tasks →</Link>
            </div>
            <ConnectionSetup platform={PILOT} connection={connection} />
          </>
        )}
      </main>
    </div>
  );
}
