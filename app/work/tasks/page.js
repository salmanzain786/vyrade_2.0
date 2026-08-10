import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Home, ListTodo, RefreshCw, Repeat } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { listIngestedTasks } from '@/lib/services/work-intelligence/ingestedTaskRepository';
import { VyradeMark } from '@/components/VyradeLogo';
import ExploreButton from '@/components/work-intelligence/ExploreButton';

export const dynamic = 'force-dynamic';

export default async function WorkTasksPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const tasks = await listIngestedTasks(user.id, { limit: 100 }).catch(() => []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2"><VyradeMark className="h-6 w-auto" /><span className="text-sm font-semibold">Vyrade</span></Link>
          <div className="flex items-center gap-3 text-xs">
            <Link href="/work/opportunities" className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-accent">Opportunity Map</Link>
            <Link href="/integrations/task-management" className="text-muted-foreground hover:text-foreground">Connections</Link>
            <Link href="/" className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><Home className="h-3.5 w-3.5" /> Workspace</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><ListTodo className="h-6 w-6 text-blue-600 dark:text-blue-400" />Your tasks</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pick a task to explore for automation. Vyrade asks focused questions and drafts a structured Blueprint — it doesn’t treat the task text as the whole spec.</p>

        {tasks.length === 0 ? (
          <div className="mt-6 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            No tasks ingested yet. <Link href="/integrations/task-management" className="text-blue-600 hover:underline dark:text-blue-400">Connect a task platform</Link> and run a sync, then your tasks appear here.
            <div className="mt-2 flex items-center gap-1.5 text-xs"><RefreshCw className="h-3.5 w-3.5" /> Use “Sync now” on the connection screen.</div>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40"><tr>{['Task', 'Project', 'Status', ''].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{h}</th>)}</tr></thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2"><span className="font-medium">{t.name || '(untitled)'}</span>{t.recurrence ? <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-blue-600/10 px-1.5 py-0.5 text-[10px] text-blue-600 dark:text-blue-400"><Repeat className="h-3 w-3" />recurring</span> : null}<span className="block text-[11px] text-muted-foreground">{t.subtask_count} subtasks · {t.platform}</span></td>
                    <td className="px-3 py-2 text-muted-foreground">{t.project || t.list_name || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{t.status || '—'}</td>
                    <td className="px-3 py-2 text-right"><ExploreButton ingestedTaskId={t.id} small /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
