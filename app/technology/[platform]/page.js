import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getTechnologyOverview, getTopWorkflows, getCategoryCounts,
  isKnownEncyclopediaPlatform, platformLabel,
} from '@/lib/services/workflow-encyclopedia/encyclopediaRepository.js';
import { PlatformChip } from '@/components/PlatformIcons';
import WorkflowCard from '@/components/encyclopedia/WorkflowCard';
import { VyradeMark } from '@/components/VyradeLogo';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const label = platformLabel(params.platform);
  return {
    title: `${label} Workflow Patterns & Examples — Vyrade`,
    description: `Browse indexed ${label} workflows, top ready-made automation patterns, and categories, curated by Vyrade.`,
  };
}

export default async function TechnologyPage({ params, searchParams }) {
  const platform = params.platform;
  if (!isKnownEncyclopediaPlatform(platform)) notFound();

  const overview = await getTechnologyOverview(platform);
  if (!overview.total_indexed) notFound();

  const activeCategory = searchParams?.category || null;
  const [categories, workflows] = await Promise.all([
    activeCategory ? Promise.resolve(overview.categories) : Promise.resolve(overview.categories),
    activeCategory ? getTopWorkflows(platform, { category: activeCategory, limit: 24 }) : Promise.resolve(overview.top_workflows),
  ]);

  return (
    <div className="min-h-screen bg-background">
      {/* Public header */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2">
            <VyradeMark className="h-6 w-auto" />
            <span className="text-sm font-semibold">Vyrade</span>
          </Link>
          <Link href="/" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
            Build your automation
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10">
        {/* Hero */}
        <div className="mb-8 flex items-center gap-4">
          <PlatformChip platform={platform} className="h-12 w-12" />
          <div>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{overview.platform_label} workflow patterns</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {overview.ready_count.toLocaleString()} ready-made patterns · {overview.total_indexed.toLocaleString()} indexed workflows
            </p>
          </div>
        </div>

        {/* Categories */}
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Categories</h2>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/technology/${platform}`}
              className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                !activeCategory ? 'border-blue-500/50 bg-blue-500/10 text-blue-500' : 'border-border text-muted-foreground hover:bg-accent')}
            >
              All
            </Link>
            {categories.map((c) => (
              <Link
                key={c.category}
                href={`/technology/${platform}?category=${encodeURIComponent(c.category)}`}
                className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  activeCategory === c.category ? 'border-blue-500/50 bg-blue-500/10 text-blue-500' : 'border-border text-muted-foreground hover:bg-accent')}
              >
                {c.label} <span className="opacity-60">{c.count}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Workflows */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {activeCategory ? `Top ${categories.find((c) => c.category === activeCategory)?.label || activeCategory} workflows` : 'Top ready-made workflows'}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {workflows.map((wf) => <WorkflowCard key={wf.source_id} wf={wf} />)}
          </div>
        </section>
      </main>
    </div>
  );
}
