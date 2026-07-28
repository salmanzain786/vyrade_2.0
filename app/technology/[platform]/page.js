import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getTechnologyOverview, getTopWorkflows,
  isKnownEncyclopediaPlatform, platformLabel,
} from '@/lib/services/workflow-encyclopedia/encyclopediaRepository.js';
import { getPlatformPositioning } from '@/lib/services/workflow-encyclopedia/platformPositioning.js';
import { PlatformChip } from '@/components/PlatformIcons';
import WorkflowCard from '@/components/encyclopedia/WorkflowCard';
import { VyradeMark } from '@/components/VyradeLogo';
import { Check, X, ArrowRight, Sparkles, Scale, Zap, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const label = platformLabel(params.platform);
  const pos = getPlatformPositioning(params.platform);
  return {
    title: `${label} Automation — Patterns, Costs, When It Fits | Vyrade`,
    description: pos?.tagline
      ? `${label}: ${pos.tagline} Explore top workflow patterns, use cases, tradeoffs and when ${label} is the right choice — indexed by Vyrade.`
      : `${label} workflow patterns, use cases and tradeoffs, indexed by Vyrade.`,
  };
}

function BuildCTA({ small }) {
  return (
    <Link href="/" className={cn('inline-flex items-center gap-1.5 rounded-lg bg-primary font-medium text-primary-foreground',
      small ? 'px-3 py-1.5 text-xs' : 'px-5 py-2.5 text-sm')}>
      <Sparkles className={small ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> Design your automation
    </Link>
  );
}

function H2({ children }) {
  return <h2 className="mb-4 text-lg font-bold text-foreground sm:text-xl">{children}</h2>;
}

export default async function TechnologyPage({ params, searchParams }) {
  const platform = params.platform;
  if (!isKnownEncyclopediaPlatform(platform)) notFound();

  const pos = getPlatformPositioning(platform);
  if (!pos) notFound();

  const overview = await getTechnologyOverview(platform);
  const hasWorkflows = overview.total_indexed > 0;
  const activeCategory = searchParams?.category || null;
  const workflows = activeCategory
    ? await getTopWorkflows(platform, { category: activeCategory, limit: 24 })
    : overview.top_workflows;
  const label = overview.platform_label;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2"><VyradeMark className="h-6 w-auto" /><span className="text-sm font-semibold">Vyrade</span></Link>
          <BuildCTA small />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5">
        {/* Hero */}
        <section className="border-b border-border py-12">
          <div className="flex items-start gap-4">
            <PlatformChip platform={platform} className="mt-1 h-12 w-12" />
            <div>
              <h1 className="text-3xl font-bold text-foreground sm:text-4xl">{label} automation</h1>
              {pos.tagline && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{pos.tagline}</p>}
              <div className="mt-5"><BuildCTA /></div>
            </div>
          </div>
        </section>

        {/* Vyrade Intelligence Snapshot */}
        <section className="border-b border-border py-10">
          <H2>Vyrade Intelligence Snapshot</H2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Indexed workflows', hasWorkflows ? overview.total_indexed.toLocaleString() : '—'],
              ['Ready-made patterns', hasWorkflows ? overview.ready_count.toLocaleString() : '—'],
              ['Categories', hasWorkflows ? overview.categories.length : '—'],
              ['Strong capabilities', pos.strong_capabilities.length],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-border bg-card p-4">
                <div className="text-2xl font-bold text-foreground">{v}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</div>
              </div>
            ))}
          </div>
          {pos.tradeoff?.summary && (
            <p className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
              <Scale className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" /> {pos.tradeoff.summary}
            </p>
          )}
          {!hasWorkflows && <p className="mt-2 text-[12px] text-amber-500">Workflow indexing for {label} is in progress.</p>}
        </section>

        {/* When it fits / doesn't fit */}
        <section className="border-b border-border py-10">
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <H2>When {label} fits</H2>
              <ul className="space-y-2">
                {pos.fits.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13.5px] text-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" /> {f}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <H2>When it doesn&apos;t fit</H2>
              <ul className="space-y-2">
                {pos.does_not_fit.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13.5px] text-foreground">
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-red-500" /> {d}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Platform tradeoffs */}
        {pos.tradeoff && (
          <section className="border-b border-border py-10">
            <H2>Platform tradeoffs</H2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-green-500"><Zap className="h-3.5 w-3.5" /> Strength</p>
                <p className="text-[13px] text-foreground">{pos.tradeoff.strength}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-amber-500"><ShieldCheck className="h-3.5 w-3.5" /> Your responsibility</p>
                <p className="text-[13px] text-foreground">{pos.tradeoff.responsibility}</p>
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {pos.cost_model && (
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Cost model</p>
                  <p className="text-[13px] text-foreground">{pos.cost_model}</p>
                </div>
              )}
              {pos.tradeoff.cost_drivers?.length > 0 && (
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Cost drivers</p>
                  <p className="text-[13px] text-foreground">{pos.tradeoff.cost_drivers.join(' · ')}</p>
                </div>
              )}
            </div>
            {pos.reliability && <p className="mt-3 text-[12.5px] text-muted-foreground"><span className="font-medium">Reliability:</span> {pos.reliability}</p>}
          </section>
        )}

        {/* Capabilities */}
        <section className="border-b border-border py-10">
          <H2>Capabilities at a glance</H2>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-green-500">Native support</p>
              <div className="flex flex-wrap gap-1.5">
                {pos.strong_capabilities.map((c) => <span key={c} className="rounded-md bg-green-500/10 px-2 py-1 text-[11px] text-green-500">{c}</span>)}
              </div>
            </div>
            {pos.weak_capabilities.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-amber-500">Limited / needs a workaround</p>
                <div className="flex flex-wrap gap-1.5">
                  {pos.weak_capabilities.map((c) => <span key={c} className="rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-500">{c}</span>)}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Use cases */}
        {pos.use_cases.length > 0 && (
          <section className="border-b border-border py-10">
            <H2>Common use cases</H2>
            <div className="flex flex-wrap gap-2">
              {pos.use_cases.map((u) => <span key={u} className="rounded-full border border-border px-3 py-1.5 text-[12.5px] text-foreground">{u}</span>)}
            </div>
          </section>
        )}

        {/* Top workflow architectures + categories (data-driven) */}
        {hasWorkflows && (
          <section className="border-b border-border py-10">
            <H2>Top {label} workflow architectures</H2>
            <div className="mb-4 flex flex-wrap gap-2">
              <Link href={`/technology/${platform}`} className={cn('rounded-full border px-3 py-1.5 text-xs font-medium', !activeCategory ? 'border-blue-500/50 bg-blue-500/10 text-blue-500' : 'border-border text-muted-foreground hover:bg-accent')}>All</Link>
              {overview.categories.map((c) => (
                <Link key={c.category} href={`/technology/${platform}?category=${encodeURIComponent(c.category)}`}
                  className={cn('rounded-full border px-3 py-1.5 text-xs font-medium', activeCategory === c.category ? 'border-blue-500/50 bg-blue-500/10 text-blue-500' : 'border-border text-muted-foreground hover:bg-accent')}>
                  {c.label} <span className="opacity-60">{c.count}</span>
                </Link>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {workflows.map((wf) => <WorkflowCard key={wf.source_id} wf={wf} />)}
            </div>
          </section>
        )}

        {/* Final CTA */}
        <section className="py-14 text-center">
          <h2 className="text-2xl font-bold text-foreground">Not sure {label} is the right choice?</h2>
          <p className="mx-auto mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
            Describe your outcome. Vyrade drafts the Automation Blueprint, recommends the best architecture across n8n, Make, Zapier and Claude Code, and compares the real cost — then builds it.
          </p>
          <div className="mt-5 flex justify-center"><BuildCTA /></div>
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-[11px] text-muted-foreground">
        Vyrade · You know the goal. We know the workflow.
      </footer>
    </div>
  );
}
