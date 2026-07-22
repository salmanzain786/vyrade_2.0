'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Eye, Download, RefreshCw, CheckCircle2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  // Saved n8n workflow + its view/download handlers (present once generated).
  workflow,
  onViewWorkflow,
  onDownloadWorkflow,
}) {
  const busyPlatform = generating ? 'n8n' : exportingPlatform || null;
  const busy = !!busyPlatform;

  // Guides (make/zapier/claude) aren't persisted, so remember which ones the
  // user has produced THIS session to flip them into the "generated" state.
  const [exported, setExported] = useState(() => new Set());
  const lastBusy = useRef(null);

  useEffect(() => {
    if (busy) { lastBusy.current = busyPlatform; return; }
    const finished = lastBusy.current;
    lastBusy.current = null;
    if (!finished || !open) return;
    if (finished === 'n8n') {
      // The workflow canvas opens on success — land the user there, not on this.
      onOpenChange(false);
    } else {
      setExported((s) => new Set(s).add(finished));
    }
  }, [busy, busyPlatform, open, onOpenChange]);

  const readinessOf = (key) =>
    platformReadiness?.[key] ?? (key === 'n8n' || key === 'claude' ? 'full' : 'coming_soon');

  // n8n has a real saved workflow; guides are "generated" if produced this session.
  const isGenerated = (key) => (key === 'n8n' ? !!workflow : exported.has(key));

  function run(key) {
    if (busy) return;
    if (key === 'n8n') onGenerate?.();
    else onExportPlatform?.(key);
  }

  function viewWorkflow() {
    onViewWorkflow?.();
    onOpenChange(false); // reveal the full-width canvas underneath
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onOpenChange(false); }}>
      <DialogContent
        hideClose
        className="max-w-2xl gap-0 p-0 overflow-hidden"
        // Non-dismissible WHILE BUSY only — a long generation shouldn't be lost
        // to a stray click; when idle the user can click out / press Esc / Close.
        onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }}
        onInteractOutside={(e) => { if (busy) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
      >
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="text-base">
            {busy ? 'Generating…' : 'Build & export this automation'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {busy
              ? 'Hang tight — this runs against live retrieval and the model.'
              : 'Generate for any platform. Already built ones can be viewed, downloaded, or regenerated.'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[62vh] overflow-y-auto scrollbar-thin px-6 py-5">
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
                const comingSoon = r === 'coming_soon';
                const generated = isGenerated(key);
                const isN8n = key === 'n8n';

                return (
                  <div
                    key={key}
                    className={cn(
                      'flex flex-col gap-2 rounded-xl border p-4 text-left transition-all',
                      generated ? 'border-green-500/30 bg-green-500/[0.03]'
                        : comingSoon ? 'border-border opacity-55'
                        : 'border-border'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <PlatformChip platform={key} />
                      <span className="font-medium text-foreground">{meta?.name || key}</span>
                      {generated ? (
                        <Badge variant="outline" className="ml-auto gap-1 border-green-500/20 bg-green-500/10 text-[10px] text-green-500">
                          <CheckCircle2 className="h-3 w-3" /> Generated
                        </Badge>
                      ) : (
                        <span
                          className={cn(
                            'ml-auto w-fit rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                            r === 'full' && 'bg-green-500/10 text-green-500',
                            r === 'guide' && 'bg-blue-500/10 text-blue-500',
                            r === 'coming_soon' && 'bg-muted text-muted-foreground'
                          )}
                        >
                          {READINESS_LABEL[r] || r}
                        </span>
                      )}
                    </div>

                    <p className="text-xs leading-relaxed text-muted-foreground">{blurb}</p>

                    {/* Actions */}
                    {generated ? (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {isN8n && (
                          <>
                            <Button size="sm" variant="secondary" className="h-8 gap-1.5 text-xs" onClick={viewWorkflow}>
                              <Eye className="h-3.5 w-3.5" /> View
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => onDownloadWorkflow?.()}>
                              <Download className="h-3.5 w-3.5" /> Download
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => run(key)} disabled={busy}>
                          <RefreshCw className="h-3.5 w-3.5" /> Regenerate{isN8n ? '' : ' & download'}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        className="mt-1 h-8 w-full gap-1.5 text-xs"
                        disabled={comingSoon || busy}
                        onClick={() => run(key)}
                      >
                        {comingSoon
                          ? 'Coming soon'
                          : (<>{isN8n ? 'Generate workflow' : 'Generate & download'}<ArrowRight className="h-3.5 w-3.5" /></>)}
                      </Button>
                    )}
                  </div>
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
