'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Loader2, ArrowRight, ArrowLeft, Check, Sparkles, Eye, Download, RefreshCw, CheckCircle2, Lightbulb, AlertTriangle,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlatformChip, PLATFORMS } from '@/components/PlatformIcons';
import { READINESS_LABEL } from '@/lib/exporters/registry';
import GenerationLoader from '@/components/chat/GenerationLoader';
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

function Stepper({ step }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium',
            i === step ? 'bg-primary/10 text-primary' : i < step ? 'text-green-500' : 'text-muted-foreground')}>
            <span className={cn('flex h-4 w-4 items-center justify-center rounded-full text-[9px]',
              i === step ? 'bg-primary text-primary-foreground' : i < step ? 'bg-green-500 text-white' : 'bg-muted')}>
              {i < step ? <Check className="h-2.5 w-2.5" /> : i + 1}
            </span>
            {label}
          </div>
          {i < STEPS.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/50" />}
        </div>
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

  const readinessOf = (key) => platformReadiness?.[key] ?? (key === 'n8n' || key === 'claude' ? 'full' : 'coming_soon');
  const isGenerated = (key) => (key === 'n8n' ? !!workflow : exported.has(key));
  function run(key) { if (busy) return; if (key === 'n8n') onGenerate?.(); else onExportPlatform?.(key); }
  function viewWorkflow() { onViewWorkflow?.(); onOpenChange(false); }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onOpenChange(false); }}>
      <DialogContent
        hideClose
        className="max-w-3xl gap-0 p-0 overflow-hidden"
        onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
      >
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="text-base">Your automation architect</DialogTitle>
          <DialogDescription className="text-xs">From recommendation to cost to build — one guided path.</DialogDescription>
          <div className="pt-2"><Stepper step={step} /></div>
        </DialogHeader>

        <div className="max-h-[62vh] overflow-y-auto scrollbar-thin px-6 py-5">
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
                <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-foreground">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <span>{rec.warning}</span>
                </div>
              )}
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/[0.04] p-4">
                <div className="flex items-center gap-2.5">
                  {recExport && <PlatformChip platform={recExport} />}
                  <span className="text-[11px] font-medium uppercase tracking-wide text-blue-500">Recommended</span>
                  <span className="flex-1 text-base font-semibold text-foreground">{rec.recommended.name}</span>
                  <Badge variant="outline" className={cn('text-[10px] capitalize', CONF[rec.confidence])}>{rec.confidence} confidence</Badge>
                </div>
                <p className="mt-2 text-[13px] text-foreground">{rec.recommended.reason}</p>
                {rec.recommended.why_fits?.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {rec.recommended.why_fits.slice(0, 4).map((w, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-500" /> {w}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">{rec.recommended.cost_notes}</p>
              </div>

              {rec.alternatives?.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <Lightbulb className="h-3.5 w-3.5" /> Alternatives
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {rec.alternatives.map((a) => (
                      <div key={a.platform} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                        <p className="text-[12.5px] font-medium text-foreground">{a.name}</p>
                        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{a.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground">Rules-based recommendation from your Blueprint — no vendor bias.</p>
            </div>
          )}

          {/* STEP 2 — Cost */}
          {step === 1 && cost && (
            <div>
              <p className="mb-3 text-[12px] text-muted-foreground">
                At ~{Number(cost.monthly_volume).toLocaleString()} runs/mo{cost.volume_assumed ? ' (assumed)' : ''}. Known costs shown; unpriced items marked unknown — never guessed.
              </p>
              <div className="space-y-2">
                {cost.platforms.map((p) => {
                  const isRec = p.platform === recExport;
                  const units = Object.entries(p.estimated_units || {}).map(([u, q]) => `${q.toLocaleString()} ${u}${q === 1 ? '' : 's'}`).join(', ');
                  return (
                    <div key={p.platform} className={cn('flex items-center gap-3 rounded-lg border px-3 py-2.5',
                      isRec ? 'border-blue-500/40 bg-blue-500/[0.04]' : 'border-border')}>
                      <PlatformChip platform={p.platform} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-foreground">{p.platform_name}</span>
                          {isRec && <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-medium text-blue-500">RECOMMENDED</span>}
                        </div>
                        {units && <span className="text-[10.5px] text-muted-foreground">{units}/mo</span>}
                      </div>
                      <div className="text-right">
                        <div className="text-[13px] font-semibold text-foreground">
                          {money(p.known_monthly_cost, p.currency)}<span className="text-[10px] font-normal text-muted-foreground">{p.estimated_total == null ? '+ known' : '/mo'}</span>
                        </div>
                        <Badge variant="outline" className={cn('text-[9px] capitalize', CONF[p.confidence])}>{p.confidence}</Badge>
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
              <div className="grid gap-3 sm:grid-cols-2">
                {BUILD_TARGETS.map(({ key, blurb }) => {
                  const r = readinessOf(key);
                  const comingSoon = r === 'coming_soon';
                  const generated = isGenerated(key);
                  const isRec = key === recExport;
                  const isN8n = key === 'n8n';
                  return (
                    <div key={key} className={cn('flex flex-col gap-2 rounded-xl border p-4',
                      isRec ? 'border-blue-500/50 bg-blue-500/[0.03]' : generated ? 'border-green-500/30' : comingSoon ? 'border-border opacity-55' : 'border-border')}>
                      <div className="flex items-center gap-2.5">
                        <PlatformChip platform={key} />
                        <span className="font-medium text-foreground">{PLATFORMS[key]?.name || key}</span>
                        {isRec && <Badge variant="outline" className="ml-auto gap-1 border-blue-500/20 bg-blue-500/10 text-[9px] text-blue-500"><Sparkles className="h-2.5 w-2.5" /> Best fit</Badge>}
                        {!isRec && generated && <Badge variant="outline" className="ml-auto gap-1 border-green-500/20 bg-green-500/10 text-[9px] text-green-500"><CheckCircle2 className="h-2.5 w-2.5" /> Done</Badge>}
                        {!isRec && !generated && <span className="ml-auto text-[10px] text-muted-foreground">{READINESS_LABEL[r] || r}</span>}
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">{blurb}</p>
                      {generated ? (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {isN8n && <>
                            <Button size="sm" variant="secondary" className="h-8 gap-1.5 text-xs" onClick={viewWorkflow}><Eye className="h-3.5 w-3.5" /> View</Button>
                            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => onDownloadWorkflow?.()}><Download className="h-3.5 w-3.5" /> Download</Button>
                          </>}
                          <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => run(key)}><RefreshCw className="h-3.5 w-3.5" /> Regenerate{isN8n ? '' : ' & download'}</Button>
                        </div>
                      ) : (
                        <Button size="sm" className="mt-1 h-8 w-full gap-1.5 text-xs" disabled={comingSoon || busy} onClick={() => run(key)}>
                          {comingSoon ? 'Coming soon' : (<>{isN8n ? 'Generate workflow' : 'Generate & download'}<ArrowRight className="h-3.5 w-3.5" /></>)}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          <div>
            {step > 0 && !busy && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setStep(step - 1)}>
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === 0 && <Button size="sm" className="gap-1.5 text-xs" onClick={goCost} disabled={loading || !rec}>See cost comparison <ArrowRight className="h-3.5 w-3.5" /></Button>}
            {step === 1 && <Button size="sm" className="gap-1.5 text-xs" onClick={goBuild} disabled={loading}>Choose how to build <ArrowRight className="h-3.5 w-3.5" /></Button>}
            <Button variant="outline" size="sm" className="text-xs" onClick={() => onOpenChange(false)} disabled={busy}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
