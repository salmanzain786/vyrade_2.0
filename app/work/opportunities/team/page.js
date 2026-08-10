import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { getMembership } from '@/lib/services/org/membershipRepository';
import { canReviewOpportunities, ROLE_LABEL } from '@/lib/services/org/access';
import { listOrgOpportunities } from '@/lib/services/work-intelligence/patterns/opportunityRepository';
import { VyradeMark } from '@/components/VyradeLogo';
import OpportunityMap from '@/components/work-intelligence/OpportunityMap';

export const dynamic = 'force-dynamic';

// Manager opportunity review (Phase 3.3) — a manager/admin reviews the TEAM's
// suggested opportunities (not just their own) before they become Blueprints.
export default async function TeamOpportunitiesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const m = await getMembership(user.id).catch(() => null);
  if (!m || !canReviewOpportunities(m.role)) notFound();

  const opportunities = await listOrgOpportunities(m.org_id).catch(() => []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <Link href="/work/opportunities" className="flex items-center gap-2"><VyradeMark className="h-6 w-auto" /><span className="text-sm font-semibold">Vyrade</span></Link>
          <Link href="/work/opportunities" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> My opportunities</Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />Team opportunities</h1>
        <p className="mt-1 text-sm text-muted-foreground">{m.org_name} · reviewing as {ROLE_LABEL[m.role] || m.role}. Confirm or dismiss automation opportunities surfaced across your team before they become Blueprints — nothing is auto-approved.</p>
        <div className="mt-6"><OpportunityMap initialOpportunities={opportunities} showAnalyze={false} /></div>
      </main>
    </div>
  );
}
