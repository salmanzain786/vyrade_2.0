import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getWorkflowDetail, platformLabel } from '@/lib/services/workflow-encyclopedia/encyclopediaRepository.js';
import { PlatformChip } from '@/components/PlatformIcons';
import WorkflowCard from '@/components/encyclopedia/WorkflowCard';
import { VyradeMark } from '@/components/VyradeLogo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const wf = await getWorkflowDetail(params.id).catch(() => null);
  if (!wf) return { title: 'Workflow — Vyrade' };
  return {
    title: `${wf.name} — ${platformLabel(wf.platform)} workflow — Vyrade`,
    description: `${wf.name}: a ${wf.category_label} ${platformLabel(wf.platform)} workflow using ${wf.integrations.slice(0, 4).join(', ')}. Indexed by Vyrade.`,
  };
}

function Meta({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-medium capitalize text-foreground">{value}</span>
    </div>
  );
}

export default async function WorkflowDetailPage({ params }) {
  const wf = await getWorkflowDetail(params.id);
  if (!wf) notFound();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2">
            <VyradeMark className="h-6 w-auto" />
            <span className="text-sm font-semibold">Vyrade</span>
          </Link>
          <Link href={`/technology/${wf.platform}`} className="text-xs font-medium text-muted-foreground hover:text-foreground">
            ← All {platformLabel(wf.platform)} workflows
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8">
        {/* Header */}
        <div className="mb-6 flex items-start gap-3">
          <PlatformChip platform={wf.platform} className="mt-1 h-9 w-9" />
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <Link href={`/technology/${wf.platform}`} className="hover:text-foreground">{platformLabel(wf.platform)}</Link>
              <span aria-hidden>/</span>
              <Link href={`/technology/${wf.platform}?category=${wf.category}`} className="hover:text-foreground">{wf.category_label}</Link>
            </div>
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">{wf.name}</h1>
            {wf.description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{wf.description}</p>}
          </div>
        </div>

        {/* Meta grid */}
        <div className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-4">
          <Meta label="Category" value={wf.category_label} />
          <Meta label="Trigger" value={(wf.trigger_type || 'unknown').replace('_', ' ')} />
          <Meta label="Complexity" value={wf.complexity} />
          <Meta label="Nodes" value={String(wf.node_count)} />
        </div>

        {/* Integrations + tags */}
        {(wf.integrations.length > 0 || wf.tags.length > 0) && (
          <div className="mb-6">
            <div className="flex flex-wrap gap-1.5">
              {wf.integrations.map((a) => (
                <span key={a} className="rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-500">{a}</span>
              ))}
              {wf.tags.map((t) => (
                <span key={t} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Structure */}
        {wf.skeleton && (
          <section className="mb-8">
            <h2 className="mb-2 text-sm font-semibold text-foreground">Workflow structure</h2>
            <pre className="overflow-x-auto rounded-xl border border-border bg-muted/40 p-4 text-[12px] leading-relaxed text-foreground scrollbar-thin whitespace-pre-wrap">
              {wf.skeleton}
            </pre>
          </section>
        )}

        {/* CTA */}
        <section className="mb-10 rounded-xl border border-blue-500/30 bg-blue-500/[0.04] p-5">
          <h2 className="text-base font-semibold text-foreground">Want this automation for your business?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Describe your outcome — Vyrade drafts the Blueprint, recommends the best platform, and generates the workflow.
          </p>
          <Link href="/" className="mt-3 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Build it with Vyrade
          </Link>
        </section>

        {/* Similar */}
        {wf.similar.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Similar {wf.category_label} workflows</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {wf.similar.map((s) => <WorkflowCard key={s.source_id} wf={s} />)}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
