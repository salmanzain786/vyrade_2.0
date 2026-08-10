import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Home, Radar, ListTodo } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { listOpportunities } from '@/lib/services/work-intelligence/patterns/opportunityRepository';
import { listProjects } from '@/lib/services/work-intelligence/ingestedTaskRepository';
import { getActiveConnection } from '@/lib/services/work-intelligence/connectionRepository';
import { VyradeMark } from '@/components/VyradeLogo';
import OpportunityMap from '@/components/work-intelligence/OpportunityMap';

export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const conn = await getActiveConnection(user.id, 'clickup').catch(() => null);
  const [opportunities, projects] = await Promise.all([
    listOpportunities(user.id).catch(() => []),
    listProjects(user.id, { connectionId: conn?.id }).catch(() => []),
  ]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2"><VyradeMark className="h-6 w-auto" /><span className="text-sm font-semibold">Vyrade</span></Link>
          <div className="flex items-center gap-3 text-xs">
            <Link href="/work/tasks" className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><ListTodo className="h-3.5 w-3.5" /> Tasks</Link>
            <Link href="/" className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><Home className="h-3.5 w-3.5" /> Workspace</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><Radar className="h-6 w-6 text-blue-600 dark:text-blue-400" />Automation Opportunity Map</h1>
        <p className="mt-1 text-sm text-muted-foreground">Vyrade analyses authorised work patterns to surface processes that may benefit from automation — recurring reporting, repeated checklists, approval bottlenecks. These are suggestions to confirm, not automatic automations.</p>
        <div className="mt-6"><OpportunityMap initialOpportunities={opportunities} projects={projects} /></div>
      </main>
    </div>
  );
}
