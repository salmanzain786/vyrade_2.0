'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Loader2, ArrowRight, ArrowLeft, Check, Sparkles, Eye, Download, RefreshCw, CheckCircle2, Lightbulb, AlertTriangle, Info,
} from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlatformChip, PLATFORMS } from '@/components/PlatformIcons';
import { READINESS_LABEL } from '@/lib/exporters/registry';
import GenerationLoader from '@/components/chat/GenerationLoader';
import N8nWorkflow from '@/components/chat/N8nWorkflow';
import { track } from '@/lib/analytics/mixpanel';
import { EVENTS } from '@/lib/analytics/events';
import { cn, formatMoney } from '@/lib/utils';

const STEPS = ['Recommendation', 'Cost', 'Build'];
const BUILD_TARGETS = [
  { key: 'n8n', blurb: 'A complete, importable n8n workflow.' },
  { key: 'make', blurb: 'Step-by-step Make.com scenario guide.' },
  { key: 'zapier', blurb: 'Step-by-step Zap outline.' },
  { key: 'claude', blurb: 'A developer package for Claude Code.' },
];
const CONF = {
  high: 'bg-green-500/10 text-green-500 border-green-500/20',
  medium: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  low: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  unknown: 'bg-muted text-muted-foreground border-border',
};
const money = (n, c) => formatMoney(n, c) ?? '—';

function Tabs({ step, onSelect, disabled }) {
  return (
    <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
      {STEPS.map((label, i) => (
        <button
          key={label}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(i)}
          className={cn(
            'flex-1 rounded-md px-3 py-2 text-[13px] font-medium transition-colors disabled:opacity-50',
            i === step ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function GuidedBuildModal({
  open, onOpenChange, blueprintId, platformReadiness,
  onGenerate, onExportPlatform, generating, exportingPlatform,
  workflow, onViewWorkflow, onDownloadWorkflow,
}) {
  const [step, setStep] = useState(0);
  const [rec, setRec] = useState(null);
  const [cost, setCost] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exported, setExported] = useState(() => new Set());
  // Show the generated n8n canvas inline in the Build tab instead of a popup.
  const [showInlineWorkflow, setShowInlineWorkflow] = useState(false);

  const busyPlatform = generating ? 'n8n' : exportingPlatform || null;
  const busy = !!busyPlatform;
  const lastBusy = useRef(null);

  const recExport = rec?.recommended?.export_platform || null; // 'n8n'|'make'|'zapier'|'claude'|null

  const fetchJson = useCallback(async (path, setter) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(path);
      if (res.status === 401) { window.location.assign('/login'); return; }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Request failed');
      setter(json);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);

  // On open, load the recommendation and reset to step 1.
  useEffect(() => {
    if (open && blueprintId) {
      setStep(0);
      track(EVENTS.GUIDED_BUILD_OPENED, { blueprint_id: blueprintId });
      fetchJson(`/api/blueprints/${blueprintId}/recommendation`, setRec);
    }
  }, [open, blueprintId, fetchJson]);

  // Guides aren't persisted — remember the ones produced this session.
  useEffect(() => {
    if (busy) { lastBusy.current = busyPlatform; return; }
    const finished = lastBusy.current;
    lastBusy.current = null;
    if (!finished || !open) return;
    if (finished === 'n8n') onOpenChange(false); // canvas opens; land there
    else setExported((s) => new Set(s).add(finished));
  }, [busy, busyPlatform, open, onOpenChange]);

  function goCost() {
    setStep(1);
    track(EVENTS.GUIDED_BUILD_STEP, { blueprint_id: blueprintId, step: 'cost' });
    if (!cost) fetchJson(`/api/blueprints/${blueprintId}/cost`, setCost);
  }
  function goBuild() {
    setStep(2);
    track(EVENTS.GUIDED_BUILD_STEP, { blueprint_id: blueprintId, step: 'build' });
    // Persist the recommendation the user is committing to build from, BEFORE
    // the build — so export provenance is saved even under strict enforcement.
    // Fire-and-forget: build-time ensureRecommendation is the backstop.
    fetch(`/api/blueprints/${blueprintId}/recommendation`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    }).catch(() => {});
  }

  // Tabs replace the linear stepper: selecting a tab still triggers that step's
  // lazy load (cost fetch / recommendation persist) so data arrives on demand.
  function selectTab(i) {
    if (busy) return;
    if (i === 1) goCost();
    else if (i === 2) goBuild();
    else setStep(0);
  }

  const readinessOf = (key) => platformReadiness?.[key] ?? (key === 'n8n' || key === 'claude' ? 'full' : 'coming_soon');
  const isGenerated = (key) => (key === 'n8n' ? !!workflow : exported.has(key));
  function run(key) { if (busy) return; if (key === 'n8n') onGenerate?.(); else onExportPlatform?.(key); }
  function viewWorkflow() { onViewWorkflow?.(); onOpenChange(false); }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o && !busy) onOpenChange(false); }}>
      <SheetContent
        side="right"
        className="flex w-[70%] max-w-none flex-col gap-0 p-0 sm:max-w-none"
        onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
      >
        <SheetHeader className="space-y-2 border-b border-border px-6 py-4 text-left">
          <SheetTitle className="text-lg">Your automation architect</SheetTitle>
          <SheetDescription className="text-[13px]">Recommendation, cost and build — jump between tabs.</SheetDescription>
          <div className="pt-2"><Tabs step={step} onSelect={selectTab} disabled={busy} /></div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-6 py-5">
          {error && <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">{error}</div>}
          {loading && (step === 0 || (step === 1 && !cost)) && (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> {step === 0 ? 'Analyzing your Blueprint…' : 'Comparing costs…'}
            </div>
          )}

          {/* STEP 1 — Recommendation */}
          {step === 0 && rec && !loading && (
            <div>
              {rec.warning && (
                <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] text-foreground">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <span>{rec.warning}</span>
                </div>
              )}
              <div className="rounded-xl border border-blue-500/30 bg-blue-600/10 p-4">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <Badge variant="outline" className="gap-1 border-blue-500/30 bg-blue-500/10 text-[10px] font-semibold uppercase tracking-wide text-blue-500">
                    <Sparkles className="h-3 w-3" /> Recommended
                  </Badge>
                  <Badge variant="outline" className={cn('text-[11px] capitalize', CONF[rec.confidence])}>{rec.confidence} confidence</Badge>
                </div>
                <div className="flex items-center gap-2.5">
                  {recExport && <PlatformChip platform={recExport} />}
                  <span className="flex-1 text-lg font-semibold text-foreground">{rec.recommended.name}</span>
                </div>
                <p className="mt-2.5 text-[14px] leading-relaxed text-foreground">{rec.recommended.reason}</p>
                {rec.recommended.why_fits?.length > 0 && (
                  <ul className="mt-2.5 space-y-1.5">
                    {rec.recommended.why_fits.slice(0, 4).map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] text-muted-foreground">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" /> {w}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2.5 text-[12px] text-muted-foreground">{rec.recommended.cost_notes}</p>
              </div>

              {rec.alternatives?.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                    <Lightbulb className="h-4 w-4" /> Alternatives
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {rec.alternatives.map((a) => (
                      <div key={a.platform} className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                        <PlatformChip platform={a.export_platform || a.platform} />
                        <div className="min-w-0">
                          <p className="text-[14px] font-medium text-foreground">{a.name}</p>
                          <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{a.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="mt-3 text-[12px] text-muted-foreground">Rules-based recommendation from your Blueprint — no vendor bias.</p>
            </div>
          )}

          {/* STEP 2 — Cost */}
          {step === 1 && cost && (
            <div>
              <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-3.5 py-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Estimated at ~<span className="font-semibold text-foreground">{Number(cost.monthly_volume).toLocaleString()}</span> runs/mo{cost.volume_assumed ? ' (assumed)' : ''}. Known costs are shown; unpriced items are marked unknown — never guessed.
                </p>
              </div>
              <div className="space-y-2.5">
                {cost.platforms.map((p) => {
                  const isRec = p.platform === recExport;
                  const units = Object.entries(p.estimated_units || {}).map(([u, q]) => `${q.toLocaleString()} ${u}${q === 1 ? '' : 's'}`).join(', ');
                  return (
                    <div key={p.platform} className={cn('flex items-center gap-3.5 rounded-xl border p-4 transition-colors',
                      isRec ? 'border-blue-500/50 bg-blue-500/[0.06]' : 'border-border bg-muted/10 hover:bg-muted/20')}>
                      <PlatformChip platform={p.platform} className="h-9 w-9" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[15px] font-semibold text-foreground">{p.platform_name}</span>
                          {isRec && (
                            <Badge variant="outline" className="gap-1 border-blue-500/30 bg-blue-500/10 text-[9px] font-semibold uppercase tracking-wide text-blue-500">
                              <Sparkles className="h-2.5 w-2.5" /> Recommended
                            </Badge>
                          )}
                        </div>
                        {units && <span className="mt-0.5 block text-[12px] text-muted-foreground">{units}/mo</span>}
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <div className="flex items-baseline gap-1">
                          <span className="text-[19px] font-bold leading-none text-foreground">{money(p.known_monthly_cost, p.currency)}</span>
                          <span className="text-[11px] font-normal text-muted-foreground">{p.estimated_total == null ? '+ unpriced' : '/mo'}</span>
                        </div>
                        <Badge variant="outline" className={cn('text-[10px] capitalize', CONF[p.confidence])}>{p.confidence}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3 — Build */}
          {step === 2 && (
            busy ? (
              <GenerationLoader platform={busyPlatform} label={`Preparing your ${PLATFORMS[busyPlatform]?.name || busyPlatform}…`} />
            ) : (
              <>
              <div className="grid gap-3 sm:grid-cols-2">
                {BUILD_TARGETS.map(({ key, blurb }) => {
                  const r = readinessOf(key);
                  const comingSoon = r === 'coming_soon';
                  const generated = isGenerated(key);
                  const isRec = key === recExport;
                  const isN8n = key === 'n8n';
                  return (
                    <div key={key} className={cn('flex flex-col rounded-xl border p-4 transition-colors',
                      isRec ? 'border-blue-500/50 bg-blue-500/[0.06] ring-1 ring-blue-500/20'
                        : generated ? 'border-green-500/40 bg-green-500/[0.04]'
                        : comingSoon ? 'border-border bg-muted/10 opacity-60'
                        : 'border-border bg-muted/10 hover:bg-muted/20')}>
                      <div className="flex items-start gap-3">
                        <PlatformChip platform={key} className="h-9 w-9" />
                        <div className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold text-foreground">{PLATFORMS[key]?.name || key}</span>
                          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{blurb}</p>
                        </div>
                        {isRec && <Badge variant="outline" className="shrink-0 gap-1 border-blue-500/30 bg-blue-500/10 text-[10px] font-semibold text-blue-500"><Sparkles className="h-2.5 w-2.5" /> Best fit</Badge>}
                        {!isRec && generated && <Badge variant="outline" className="shrink-0 gap-1 border-green-500/30 bg-green-500/10 text-[10px] font-semibold text-green-500"><CheckCircle2 className="h-2.5 w-2.5" /> Done</Badge>}
                        {!isRec && !generated && <span className="shrink-0 text-[11px] text-muted-foreground">{READINESS_LABEL[r] || r}</span>}
                      </div>
                      <div className="mt-4">
                        {generated ? (
                          <div className="flex flex-wrap gap-1.5">
                            {isN8n && <>
                              <Button size="sm" variant={showInlineWorkflow ? 'default' : 'secondary'} className="h-9 gap-1.5 text-[13px]" onClick={() => setShowInlineWorkflow((v) => !v)}><Eye className="h-3.5 w-3.5" /> {showInlineWorkflow ? 'Hide' : 'View'}</Button>
                              <Button size="sm" variant="outline" className="h-9 gap-1.5 text-[13px]" onClick={() => onDownloadWorkflow?.()}><Download className="h-3.5 w-3.5" /> Download</Button>
                            </>}
                            <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-[13px]" onClick={() => run(key)}><RefreshCw className="h-3.5 w-3.5" /> Regenerate{isN8n ? '' : ' & download'}</Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            className="h-9 w-full gap-1.5 text-[13px] font-medium"
                            variant="secondary"
                            disabled={comingSoon || busy}
                            onClick={() => run(key)}
                          >
                            {comingSoon ? 'Coming soon' : (<>{isN8n ? 'Generate workflow' : 'Generate & download'}<ArrowRight className="h-3.5 w-3.5" /></>)}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {showInlineWorkflow && workflow && (
                <div className="mt-4 overflow-hidden rounded-xl border border-border bg-sidebar">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <span className="text-[13px] font-medium text-foreground">{workflow.name || 'Generated n8n workflow'}</span>
                    <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={() => setShowInlineWorkflow(false)}>Hide</Button>
                  </div>
                  <N8nWorkflow workflow={workflow} height="400px" />
                </div>
              )}
              </>
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
