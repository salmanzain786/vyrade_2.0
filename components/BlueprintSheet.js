'use client';

import { useState } from 'react';
import {
  Loader2, Copy, Download, FileCode2, Lock, Sparkles, ShieldCheck, Hash, History, Files, FileText,
  Target, Zap, Server, ListChecks, Scale, Gauge, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import GuidedBuildModal from '@/components/GuidedBuildModal';
import { track } from '@/lib/analytics/mixpanel';
import { EVENTS } from '@/lib/analytics/events';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import WorkflowRouting from '@/components/WorkflowRouting';
import { cn } from '@/lib/utils';

function Field({ label, value, filled }) {
  return (
    <div className="flex items-center gap-4 py-1 text-[15px] leading-relaxed">
      <span className="w-[132px] shrink-0 rounded-md border border-blue-500/30 bg-blue-500/10 py-1 text-center font-mono text-[10px] uppercase tracking-wider text-blue-400 font-bold">{label}</span>
      {filled ? (
        <span className="min-w-0 font-medium text-foreground capitalize">{value}</span>
      ) : (
        <span className="min-w-0">
          {/* An unfilled field on a drawing is a rule, not an em dash. */}
          <span
            aria-hidden="true"
            className="inline-block w-20 translate-y-[-4px] border-b border-dashed border-border border-white/50"
          />
          <span className="sr-only">Not specified</span>
        </span>
      )}
    </div>
  );
}

/**
 * Each requirement group is a self-contained card: a header strip with a
 * numbered chip, a section icon and the title, over the captured content.
 * Reads like a structured spec document rather than a flat list.
 */
function Section({ number, title, icon: Icon, filled, children }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-muted/20">
      <header className="flex items-center gap-2.5 border-b border-border/70 bg-muted/30 px-4 py-2.5">
        {Icon && (
          <span
            aria-hidden="true"
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
              filled ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/40' : 'bg-muted text-muted-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
        <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
          {title}
        </h3>
      </header>
      <div className="px-4 py-3.5">{children}</div>
    </section>
  );
}

function StatusStamp({ status }) {
  const map = {
    collecting_requirements: { text: 'IN PROGRESS', variant: 'outline' },
    requirements_complete: { text: 'COMPLETE', variant: 'success' },
    blocked: { text: 'BLOCKED', variant: 'destructive' },
  };
  const s = map[status] || { text: status, variant: 'outline' };
  return (
    <Badge variant={s.variant} className="font-mono text-[10px] tracking-[0.12em]">
      {s.text}
    </Badge>
  );
}

function ReadinessMeter({ readiness }) {
  const pct = readiness?.score ?? 0;
  const blocked = !!readiness?.blocking_unknowns?.length;
  const complete = readiness?.status === 'requirements_complete';

  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground">READINESS</span>
        <span className="font-mono text-[10.5px] text-muted-foreground">{readiness ? `${pct}%` : '—'}</span>
      </div>
      <Progress
        value={pct}
        indicatorClassName={cn(
          complete ? 'bg-[oklch(var(--success))]' : blocked ? 'bg-[oklch(var(--warning))]' : 'bg-primary'
        )}
      />
    </div>
  );
}

export default function BlueprintSheet({
  blueprint, readiness, version, blueprintId, onGenerate, generating, workflow, workflowStale, onViewWorkflow,
  onExportPlatform, onCopyPrompt, exportingPlatform, platformReadiness,
}) {
  const bp = blueprint;
  const [guidedOpen, setGuidedOpen] = useState(false);
  // Gate on the readiness STATUS, not a literal 100% score: the score can sit
  // below 100 with non-blocking unknowns while the server-side export gate still
  // passes. The not-ready label shows the score purely as information.
  const ready = readiness?.status === 'requirements_complete';
  const canGenerate = ready && !generating;
  const shortId = blueprintId ? blueprintId.slice(0, 8) : '————————';
  const hasOpenItems = !!bp?.unknown_requirements?.length;

  function handleDownload() {
    if (!workflow) return;
    track(EVENTS.WORKFLOW_DOWNLOADED, {
      blueprint_id: blueprintId,
      node_count: workflow?.nodes?.length ?? null,
    });
    const jsonText = JSON.stringify(workflow, null, 2);
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow.name || 'workflow'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-card">

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 pb-3 pt-5">
        <div className="mb-6 flex items-center justify-between gap-3 border-b border-border pb-4">
          
            <div className="flex flex-col leading-tight">
              <span className="font-mono text-[15px] font-semibold tracking-[0.14em] text-foreground">
                AUTOMATION BLUEPRINT
              </span>
              <span className="mt-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Technical specification
              </span>
            </div>
          
          {readiness && <StatusStamp status={readiness.status} />}
        </div>

        {!bp && (
          <p className="pt-10 text-center font-mono text-[13px] text-muted-foreground">
            Sheet is blank until the conversation begins.
          </p>
        )}

        {bp && (
          <div className="space-y-3">
            <Section
              number="01"
              title="Business intent"
              icon={Target}
              filled={!!bp.business_intent?.business_goal}
            >
              <Field label="Goal" value={bp.business_intent?.business_goal} filled={!!bp.business_intent?.business_goal} />
              <Field label="Desired outcome" value={bp.business_intent?.desired_outcome} filled={!!bp.business_intent?.desired_outcome} />
            </Section>

            <Section
              number="02"
              title="Trigger"
              icon={Zap}
              filled={
                (!!bp.trigger?.trigger_type && bp.trigger.trigger_type !== 'unknown') ||
                (!!bp.trigger?.event && bp.trigger.event !== 'unknown') ||
                !!bp.trigger?.source_system
              }
            >
              <Field label="Type" value={bp.trigger?.trigger_type} filled={bp.trigger?.trigger_type && bp.trigger.trigger_type !== 'unknown'} />
              <Field label="Event" value={bp.trigger?.event} filled={!!bp.trigger?.event && bp.trigger.event !== 'unknown'} />
              <Field label="Source" value={bp.trigger?.source_system} filled={!!bp.trigger?.source_system} />
            </Section>

            <Section number="03" title="Systems involved" icon={Server} filled={bp.systems?.length > 0}>
              {bp.systems?.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {bp.systems.map((s, i) => (
                    <li key={i} className="flex items-center gap-4 text-[15px]">
                      <Badge
                        variant="outline"
                        className="w-[132px] shrink-0 justify-center border-blue-500/30 bg-blue-500/10 py-1 font-mono text-[10px] uppercase tracking-wider text-blue-400"
                      >
                        {s.role}
                      </Badge>
                      <span className="min-w-0 font-medium text-foreground">{s.name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[15px] italic text-muted-foreground">Nothing captured yet.</p>
              )}
            </Section>

            <Section number="04" title="Process steps" icon={ListChecks} filled={bp.process_steps?.length > 0}>
              {bp.process_steps?.length > 0 ? (
                <ul className="space-y-1.5 text-[15px] leading-relaxed text-foreground">
                  {bp.process_steps.slice().sort((a, b) => a.sequence - b.sequence).map((s) => (
                    <li key={s.step_id} className="flex gap-2">
                      <span aria-hidden="true" className="shrink-0 text-muted-foreground">–</span>
                      <span className="min-w-0">{s.action}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[15px] italic text-muted-foreground">Nothing captured yet.</p>
              )}
            </Section>

            <Section number="05" title="Business rules" icon={Scale} filled={bp.business_rules?.length > 0}>
              {bp.business_rules?.length > 0 ? (
                <ul className="space-y-1.5 text-[15px] leading-relaxed text-foreground">
                  {bp.business_rules.map((r) => (
                    <li key={r.rule_id} className="flex gap-2">
                      <span aria-hidden="true" className="shrink-0 text-muted-foreground">–</span>
                      <span className="min-w-0">{r.description}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[15px] italic text-muted-foreground">Nothing captured yet.</p>
              )}
            </Section>

            <Section
              number="06"
              title="Volume & approval"
              icon={Gauge}
              filled={!!bp.volume?.estimated_executions}
            >
              <Field
                label="Volume"
                value={bp.volume?.estimated_executions ? `${bp.volume.estimated_executions} / ${bp.volume.period}` : null}
                filled={!!bp.volume?.estimated_executions}
              />
              <Field
                label="Human approval"
                value={
                  bp.human_approval?.required == null ? null : (
                    <Badge
                      variant={bp.human_approval.required ? 'warning' : 'success'}
                      className="font-mono text-[10px] uppercase tracking-wider"
                    >
                      {bp.human_approval.required ? 'Required' : 'Not required'}
                    </Badge>
                  )
                }
                filled={bp.human_approval?.required != null}
              />
            </Section>

            {hasOpenItems && (
              <Section number="07" title="Open items" icon={AlertTriangle} filled={false}>
                <ul className="space-y-1.5 text-[15px] leading-relaxed text-[oklch(var(--warning))]">
                  {bp.unknown_requirements.map((u, i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden="true" className="shrink-0">–</span>
                      <span className="min-w-0">{u.reason}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        )}
      </div>

      {generating && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-background/85 px-6 text-center backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="font-mono text-[13px] tracking-[0.06em] text-foreground">Composing n8n workflow…</p>
          <p className="max-w-[280px] text-xs leading-relaxed text-muted-foreground">
            Retrieving matching nodes and wiring the graph. This can take up to a minute.
          </p>
        </div>
      )}

      {/*
        Below lg the sheet only owns half the viewport, and five routes plus the
        title block overflow it. Scroll the footer there; let it size naturally
        on desktop. These are sibling scroll regions, not nested ones.
      */}
      <div className="scrollbar-thin max-h-[58%] shrink-0 overflow-y-auto border-t-2 border-white/10 bg-background/70 px-5 py-4 backdrop-blur lg:max-h-none lg:overflow-visible">
        <ReadinessMeter readiness={readiness} />

        {/*
          The primary call to action. Disabled until the Blueprint is complete —
          and it says so, rather than failing at the server gate.
        */}
        {/*
          One guided path — recommendation → cost → build — instead of separate
          "generate" and "estimate cost" tools. Disabled (and says so) until the
          Blueprint is complete.
        */}
        <div className="mb-3 flex flex-col gap-4 sm:flex-row">
          <Button
            size="lg"
            onClick={() => setGuidedOpen(true)}
            disabled={!canGenerate}
            className="h-11 flex-1 gap-2 bg-blue-600 text-[13px] font-semibold text-white hover:bg-blue-500"
          >
            {canGenerate ? (
              <>
                <Sparkles className="h-4 w-4" />
                Review &amp; build automation
              </>
            ) : (
              <>
                <Lock className="h-3.5 w-3.5" />
                Blueprint not ready yet{readiness ? ` — ${readiness.score ?? 0}%` : ''}
              </>
            )}
          </Button>

          {/* Governance & Compliance — scan this automation against security,
              privacy, framework and approved-policy checks. */}
          {blueprintId && (
            <Button asChild variant="outline" size="lg" className="h-11 flex-1 gap-1.5 border-white bg-white text-[13px] font-medium text-black hover:bg-white/90 hover:text-black">
              <a href={`/compliance/${blueprintId}`}>
                <ShieldCheck className="h-4 w-4" /> Governance &amp; Compliance scan
              </a>
            </Button>
          )}
        </div>

        <GuidedBuildModal
          open={guidedOpen}
          onOpenChange={setGuidedOpen}
          blueprintId={blueprintId}
          platformReadiness={platformReadiness}
          onGenerate={onGenerate}
          onExportPlatform={onExportPlatform}
          generating={generating}
          exportingPlatform={exportingPlatform}
          workflow={workflow}
          onViewWorkflow={onViewWorkflow}
          onDownloadWorkflow={handleDownload}
        />

        {workflow && workflowStale && (
          <div
            role="alert"
            className="mb-3 rounded-md border border-[oklch(var(--warning))]/40 bg-[oklch(var(--warning))]/10 px-3 py-2 text-[12px] leading-snug text-foreground"
          >
            <span className="font-medium">Workflow outdated.</span>{' '}
            The Blueprint changed after this workflow was generated. Regenerate to match the current Blueprint.
          </div>
        )}

        {/* <WorkflowRouting
          canGenerate={canGenerate}
          generating={generating}
          workflow={workflow}
          onGenerate={onGenerate}
          onViewWorkflow={onViewWorkflow}
          onDownload={handleDownload}
          hasBlueprint={!!blueprintId}
          exportingPlatform={exportingPlatform}
          platformReadiness={platformReadiness}
          onExportPlatform={onExportPlatform}
        /> */}

        {/* {blueprintId && (onExportPlatform || onCopyPrompt) && (
          <div
            className="mb-3 mt-2 grid grid-cols-2 gap-1.5"
            title={canGenerate ? undefined : 'Available once the blueprint is complete'}
          >
            <Button variant="ghost" size="sm" onClick={onCopyPrompt} disabled={!canGenerate} className="h-8 gap-1.5 text-xs">
              <Copy className="h-3.5 w-3.5" /> Copy prompt
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onExportPlatform?.('claude')} disabled={!canGenerate || exportingPlatform === 'claude'} className="h-8 gap-1.5 text-xs">
              <FileCode2 className="h-3.5 w-3.5" />
              {exportingPlatform === 'claude' ? 'Preparing…' : 'Claude package'}
            </Button>
          </div>
        )} */}

        <Separator className="mb-3" />

        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: Hash, label: 'DWG NO.', value: shortId },
            { icon: History, label: 'REV', value: version ?? '—' },
            { icon: Files, label: 'SHEET', value: '1 OF 1' },
          ].map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/60 px-3 py-2.5 transition-colors hover:border-blue-500/40 hover:bg-muted/50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
                <span className="truncate font-mono text-[15px] font-semibold leading-tight tabular-nums text-foreground">
                  {value}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
