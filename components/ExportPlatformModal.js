'use client';

import { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PlatformChip, PLATFORMS } from '@/components/PlatformIcons';
import { READINESS_LABEL } from '@/lib/exporters/registry';
import GenerationLoader from '@/components/chat/GenerationLoader';
import { cn } from '@/lib/utils';

const TARGETS = [
  { key: 'n8n', blurb: 'A complete, importable n8n workflow — opens in an interactive canvas.' },
  { key: 'make', blurb: 'Step-by-step Make.com scenario guide with recommended modules.' },
  { key: 'zapier', blurb: 'Step-by-step Zap outline with the right apps for each step.' },
  { key: 'claude', blurb: 'A developer package (architecture, prompt, MCPs, tests) for Claude Code.' },
];

export default function ExportPlatformModal({
  open,
  onOpenChange,
  platformReadiness,
  onGenerate,          // n8n
  onExportPlatform,    // claude / make / zapier
  generating,          // n8n in flight
  exportingPlatform,   // 'claude' | 'make' | 'zapier' | null
}) {
  const busyPlatform = generating ? 'n8n' : exportingPlatform || null;
  const busy = !!busyPlatform;

  // Close automatically once the work finishes, so the user lands on the result
  // instead of this modal covering the workflow canvas that just opened.
  const wasBusy = useRef(false);
  useEffect(() => {
    if (busy) { wasBusy.current = true; return; }
    if (wasBusy.current && open) {
      wasBusy.current = false;
      onOpenChange(false);
    }
  }, [busy, open, onOpenChange]);

  const readinessOf = (key) =>
    platformReadiness?.[key] ?? (key === 'n8n' || key === 'claude' ? 'full' : 'coming_soon');

  function run(key) {
    if (busy) return;
    if (key === 'n8n') onGenerate?.();
    else onExportPlatform?.(key);
  }

  return (
    <Dialog open={open} onOpenChange={() => { /* controlled: only the Close button dismisses */ }}>
      <DialogContent
        hideClose
        className="max-w-2xl gap-0 p-0 overflow-hidden"
        // Deliberately non-dismissible: no outside click, no Esc. The user must
        // press Close — which keeps a long generation from being lost by a stray click.
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="text-base">
            {busy ? 'Generating…' : 'Choose an export target'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {busy
              ? 'Hang tight — this runs against live retrieval and the model.'
              : 'Your Blueprint is complete. Pick where you want to build this automation.'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto scrollbar-thin px-6 py-5">
          {busy ? (
            <GenerationLoader
              platform={busyPlatform}
              label={`Preparing your ${PLATFORMS[busyPlatform]?.name || busyPlatform} export…`}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {TARGETS.map(({ key, blurb }) => {
                const meta = PLATFORMS[key];
                const r = readinessOf(key);
                const disabled = r === 'coming_soon';
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => run(key)}
                    disabled={disabled}
                    className={cn(
                      'group flex flex-col gap-2 rounded-xl border p-4 text-left transition-all',
                      disabled
                        ? 'cursor-not-allowed border-border opacity-55'
                        : 'border-border hover:border-blue-500/50 hover:bg-accent/50'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <PlatformChip platform={key} />
                      <span className="font-medium text-foreground">{meta?.name || key}</span>
                      {!disabled && (
                        <ArrowRight className="ml-auto h-4 w-4 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                      )}
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{blurb}</p>
                    <span
                      className={cn(
                        'mt-auto w-fit rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                        r === 'full' && 'bg-green-500/10 text-green-500',
                        r === 'guide' && 'bg-blue-500/10 text-blue-500',
                        r === 'coming_soon' && 'bg-muted text-muted-foreground'
                      )}
                    >
                      {READINESS_LABEL[r] || r}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          <span className="text-[11px] text-muted-foreground">
            {busy ? 'You can close this — the export continues.' : 'Exports run from the current Blueprint version.'}
          </span>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
