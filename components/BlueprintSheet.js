'use client';

import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import WorkflowRouting from '@/components/WorkflowRouting';
import { cn } from '@/lib/utils';

/** Corner ticks, the way a real drawing sheet is registered for printing. */
function RegistrationMarks() {
  const arm = 'pointer-events-none absolute z-20 h-3 w-3 border-primary/30';
  return (
    <>
      <span aria-hidden="true" className={cn(arm, 'left-2 top-2 border-l border-t')} />
      <span aria-hidden="true" className={cn(arm, 'right-2 top-2 border-r border-t')} />
      <span aria-hidden="true" className={cn(arm, 'bottom-2 left-2 border-b border-l')} />
      <span aria-hidden="true" className={cn(arm, 'bottom-2 right-2 border-b border-r')} />
    </>
  );
}

function Field({ label, value, filled }) {
  return (
    <div className="flex gap-3 text-[13px] leading-relaxed">
      <span className="w-[110px] shrink-0 pt-px font-mono text-[11px] text-muted-foreground">{label}</span>
      {filled ? (
        <span className="min-w-0 text-foreground">{value}</span>
      ) : (
        <span className="min-w-0">
          {/* An unfilled field on a drawing is a rule, not an em dash. */}
          <span
            aria-hidden="true"
            className="inline-block w-20 translate-y-[-4px] border-b border-dashed border-border"
          />
          <span className="sr-only">Not specified</span>
        </span>
      )}
    </div>
  );
}

/**
 * Sections hang off a vertical rail, each tagged with a numbered balloon —
 * the callout convention from engineering drawings, and the same visual
 * grammar as the routing traces in the footer.
 */
function Section({ number, title, filled, isLast, children }) {
  return (
    <section className="relative pb-6 pl-9">
      {!isLast && (
        <span aria-hidden="true" className="absolute bottom-0 left-[10px] top-[25px] w-px bg-border" />
      )}
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-0 top-0 flex h-[21px] w-[21px] items-center justify-center rounded-full border font-mono text-[9px] tabular-nums',
          filled
            ? 'border-primary/50 bg-primary/10 text-primary'
            : 'border-border bg-muted/50 text-muted-foreground'
        )}
      >
        {number}
      </span>
      <h3 className="mb-2 pt-[3px] font-mono text-[11px] uppercase tracking-[0.12em] text-foreground">
        {title}
      </h3>
      <div>{children}</div>
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
          complete ? 'bg-[hsl(var(--success))]' : blocked ? 'bg-[hsl(var(--warning))]' : 'bg-primary'
        )}
      />
    </div>
  );
}

export default function BlueprintSheet({
  blueprint, readiness, version, blueprintId, onGenerate, generating, workflow, onViewWorkflow,
}) {
  const bp = blueprint;
  const canGenerate = readiness?.status === 'requirements_complete' && !generating;
  const shortId = blueprintId ? blueprintId.slice(0, 8) : '————————';
  const hasOpenItems = !!bp?.unknown_requirements?.length;

  function handleDownload() {
    if (!workflow) return;
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
    <div className="relative flex min-h-0 flex-col bg-card/40 blueprint-grid">
      <RegistrationMarks />

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 pb-3 pt-5">
        <div className="mb-5 flex items-center justify-between border-b-2 border-primary/40 pb-3">
          <span className="font-mono text-[13px] font-semibold tracking-[0.14em] text-foreground">
            AUTOMATION BLUEPRINT
          </span>
          {readiness && <StatusStamp status={readiness.status} />}
        </div>

        {!bp && (
          <p className="pt-10 text-center font-mono text-[13px] text-muted-foreground">
            Sheet is blank until the conversation begins.
          </p>
        )}

        {bp && (
          <>
            <Section
              number="01"
              title="Business intent"
              filled={!!bp.business_intent?.business_goal}
            >
              <Field label="Goal" value={bp.business_intent?.business_goal} filled={!!bp.business_intent?.business_goal} />
              <Field label="Desired outcome" value={bp.business_intent?.desired_outcome} filled={!!bp.business_intent?.desired_outcome} />
            </Section>

            <Section
              number="02"
              title="Trigger"
              filled={!!bp.trigger?.event && bp.trigger.event !== 'unknown'}
            >
              <Field label="Type" value={bp.trigger?.trigger_type} filled={bp.trigger?.trigger_type && bp.trigger.trigger_type !== 'unknown'} />
              <Field label="Event" value={bp.trigger?.event} filled={!!bp.trigger?.event && bp.trigger.event !== 'unknown'} />
              <Field label="Source" value={bp.trigger?.source_system} filled={!!bp.trigger?.source_system} />
            </Section>

            <Section number="03" title="Systems involved" filled={bp.systems?.length > 0}>
              {bp.systems?.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {bp.systems.map((s, i) => (
                    <li key={i} className="flex items-center gap-2 text-[13px]">
                      <Badge variant="outline" className="font-mono text-[10px]">{s.role}</Badge>
                      <span className="text-foreground">{s.name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] italic text-muted-foreground">Nothing captured yet.</p>
              )}
            </Section>

            <Section number="04" title="Process steps" filled={bp.process_steps?.length > 0}>
              {bp.process_steps?.length > 0 ? (
                <ol className="list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-foreground marker:font-mono marker:text-muted-foreground">
                  {bp.process_steps.slice().sort((a, b) => a.sequence - b.sequence).map((s) => (
                    <li key={s.step_id}>{s.action}</li>
                  ))}
                </ol>
              ) : (
                <p className="text-[13px] italic text-muted-foreground">Nothing captured yet.</p>
              )}
            </Section>

            <Section number="05" title="Business rules" filled={bp.business_rules?.length > 0}>
              {bp.business_rules?.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-foreground marker:text-muted-foreground">
                  {bp.business_rules.map((r) => <li key={r.rule_id}>{r.description}</li>)}
                </ul>
              ) : (
                <p className="text-[13px] italic text-muted-foreground">Nothing captured yet.</p>
              )}
            </Section>

            <Section
              number="06"
              title="Volume & approval"
              filled={!!bp.volume?.estimated_executions}
              isLast={!hasOpenItems}
            >
              <Field
                label="Volume"
                value={bp.volume?.estimated_executions ? `${bp.volume.estimated_executions} / ${bp.volume.period}` : null}
                filled={!!bp.volume?.estimated_executions}
              />
              <Field
                label="Human approval"
                value={bp.human_approval?.required == null ? null : (bp.human_approval.required ? 'Required' : 'Not required')}
                filled={bp.human_approval?.required != null}
              />
            </Section>

            {hasOpenItems && (
              <Section number="07" title="Open items" filled={false} isLast>
                <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-[hsl(var(--warning))] marker:text-[hsl(var(--warning))]">
                  {bp.unknown_requirements.map((u, i) => <li key={i}>{u.reason}</li>)}
                </ul>
              </Section>
            )}
          </>
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
      <div className="scrollbar-thin max-h-[58%] shrink-0 overflow-y-auto border-t-2 border-primary/40 bg-background/70 px-5 py-4 backdrop-blur lg:max-h-none lg:overflow-visible">
        <ReadinessMeter readiness={readiness} />

        <WorkflowRouting
          canGenerate={canGenerate}
          generating={generating}
          workflow={workflow}
          onGenerate={onGenerate}
          onViewWorkflow={onViewWorkflow}
          onDownload={handleDownload}
        />

        <Separator className="mb-3" />

        <Card className="grid grid-cols-3 rounded-md shadow-none">
          {[
            ['DWG NO.', shortId],
            ['REV', version ?? '—'],
            ['SHEET', '1 OF 1'],
          ].map(([label, value], i) => (
            <div key={label} className={cn('flex flex-col px-2.5 py-1.5', i < 2 && 'border-r border-border')}>
              <span className="font-mono text-[8.5px] tracking-[0.14em] text-muted-foreground">{label}</span>
              <span className="mt-0.5 font-mono text-xs text-foreground">{value}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
