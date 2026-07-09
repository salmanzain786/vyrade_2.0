'use client';

import { Fragment } from 'react';
import { Download, Eye, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { PlatformChip, PLATFORMS } from '@/components/PlatformIcons';
import { cn } from '@/lib/utils';

/**
 * Every target on one bus, one row:
 *
 *                  ● origin
 *      ┌───────────┴───────────┐   bus
 *      │     │     │     │     │   drops
 *    [n8n] │[mk] │[zp] │[tl] │[mcp]
 *      ───────────────────────────
 *      n8n · Generate workflow      caption
 *
 * Drops live inside their flex cell rather than at absolute percentages, so
 * each one lands on its chip's true centre no matter how the panel resizes.
 *
 * Inert targets use `aria-disabled`, not `disabled`. A `disabled` button gets
 * `pointer-events: none` from buttonVariants, which would stop the tooltip from
 * ever opening — and it would drop out of the tab order, hiding the one piece of
 * text that explains why the target is unavailable.
 */

const ROUTES = ['n8n', 'make', 'zapier', 'tools', 'mcp'];

function Drop({ live }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute -top-4 left-1/2 h-4 w-0 border-l',
        live ? 'border-primary/60' : 'border-dashed border-border'
      )}
    />
  );
}

function Node({ live }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute -top-[3px] left-1/2 z-10 h-1.5 w-1.5 -translate-x-1/2 rounded-full',
        live ? 'bg-primary' : 'border border-border bg-background'
      )}
    />
  );
}

export default function WorkflowRouting({
  canGenerate,
  generating,
  workflow,
  onGenerate,
  onViewWorkflow,
  onDownload,
}) {
  const live = canGenerate || !!workflow;

  const n8nStatus = generating
    ? 'Generating…'
    : workflow
      ? 'Regenerate workflow'
      : canGenerate
        ? 'Generate workflow'
        : 'Finish the blueprint first';

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mb-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
            Routing
          </span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
          <span className="font-mono text-[10px] text-muted-foreground">
            1 of {ROUTES.length} wired
          </span>
        </div>

        {/* Origin, then the bus it feeds. */}
        <div className="relative h-3">
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-0 z-10 flex h-2 w-2 -translate-x-1/2 items-center justify-center"
          >
            {canGenerate && (
              <span className="absolute inline-flex h-3.5 w-3.5 animate-ping rounded-full bg-primary/40" />
            )}
            <span
              className={cn(
                'relative h-2 w-2 rounded-full ring-2 ring-background',
                live ? 'bg-primary' : 'bg-muted-foreground/50'
              )}
            />
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute left-1/2 top-2 h-[calc(100%-0.5rem)] w-0 border-l',
              live ? 'border-primary/60' : 'border-border'
            )}
          />
        </div>

        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[10%] top-0 h-0 border-t border-border"
          />

          <div className="flex items-center justify-between pt-4">
            {ROUTES.map((key, i) => {
              const meta = PLATFORMS[key];
              const isN8n = key === 'n8n';
              const enabled = isN8n && canGenerate;
              const status = isN8n ? n8nStatus : 'Coming soon';

              return (
                <Fragment key={key}>
                  {i > 0 && (
                    <Separator orientation="vertical" className="h-8 shrink-0" aria-hidden="true" />
                  )}

                  <div className="relative flex flex-1 justify-center">
                    <Drop live={isN8n && live} />
                    <Node live={isN8n && live} />

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-disabled={!enabled}
                          aria-label={`${meta.name} — ${status}`}
                          onClick={enabled ? onGenerate : (e) => e.preventDefault()}
                          className={cn(
                            // 44px hit area, per the touch-target minimum.
                            'relative h-11 w-11',
                            enabled && 'bg-primary/10 hover:bg-primary/20',
                            // aria-disabled keeps pointer events, so ghost's
                            // hover:bg-accent has to be cancelled by hand.
                            !enabled && 'cursor-not-allowed hover:bg-transparent',
                            isN8n && !enabled && 'opacity-70',
                            !isN8n && 'opacity-55'
                          )}
                        >
                          <PlatformChip platform={key} />
                          {enabled && (
                            <Sparkles
                              aria-hidden="true"
                              className="absolute -right-0.5 -top-0.5 !size-3 text-primary"
                            />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="flex flex-col items-center gap-0.5">
                        <span className="font-mono text-[11px] font-semibold">{meta.name}</span>
                        <span className="text-[10.5px] text-muted-foreground">{status}</span>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>

        {/*
          The tooltips above are hover-only, so they never reach a touch user.
          This caption states the wired route and its next action unconditionally.
        */}
        <p className="mt-2.5 border-t border-border pt-2 text-center font-mono text-[10.5px] text-muted-foreground">
          <span className="text-foreground">{PLATFORMS.n8n.name}</span>
          <span aria-hidden="true"> · </span>
          {n8nStatus}
        </p>

        {workflow && !generating && (
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <Button variant="ghost" size="sm" onClick={onViewWorkflow} className="h-8 text-xs">
              <Eye className="h-3.5 w-3.5" /> View
            </Button>
            <Button variant="ghost" size="sm" onClick={onDownload} className="h-8 text-xs">
              <Download className="h-3.5 w-3.5" /> JSON
            </Button>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
