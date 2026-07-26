'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, RefreshCw, Lightbulb, AlertTriangle, TrendingDown, Target, Info, Scale } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PlatformChip, PLATFORMS } from '@/components/PlatformIcons';
import { cn } from '@/lib/utils';

const CONF = {
  high: { label: 'High', cls: 'bg-green-500/10 text-green-500 border-green-500/20' },
  medium: { label: 'Medium', cls: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  low: { label: 'Low', cls: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
  unknown: { label: 'Unknown', cls: 'bg-muted text-muted-foreground border-border' },
};

const SUGGEST_ICON = {
  accuracy: Target, 'cost-driver': AlertTriangle, platform: TrendingDown,
  tradeoff: Scale, framing: Scale, recommendation: Lightbulb, default: Info,
};

function GroupCell({ label, group }) {
  const val = !group ? '—'
    : group.has_unpriced ? (group.known ? `${money(group.known)}+` : '?')
    : money(group.known);
  return (
    <div className="rounded-md bg-muted/40 px-1 py-1">
      <div className="text-[8.5px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-[11px] font-medium text-foreground">{val}</div>
    </div>
  );
}

function money(n) {
  if (n == null) return null;
  if (n === 0) return '$0';
  return n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

function ConfidenceBadge({ value }) {
  const c = CONF[value] || CONF.unknown;
  return <Badge variant="outline" className={cn('text-[10px] font-medium', c.cls)}>{c.label}</Badge>;
}

function fmtDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * The honest headline. We lead with KNOWN cost — the sum of lines we actually
 * have a price for — and only surface a single "estimated total" when every
 * core line is priced (`fully_priced`). No fake precision.
 */
function CostHeadline({ est }) {
  const known = est.known_monthly_cost;
  return (
    <div>
      {known != null ? (
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-semibold text-foreground">{money(known)}</span>
          <span className="text-[11px] text-muted-foreground">known/mo</span>
        </div>
      ) : (
        <span className="text-sm font-medium text-muted-foreground">No priced components yet</span>
      )}

      {/* A single total ONLY when every core line is priced. Otherwise we say
          it's partial and refuse to show a headline number — no fake precision. */}
      {est.estimated_total != null ? (
        est.total_is_partial ? (
          <p className="mt-0.5 text-[11px] text-amber-500">Core priced (~{money(est.estimated_total)}/mo); storage/human costs not included.</p>
        ) : (
          <p className="mt-0.5 text-[11px] text-green-500">Complete estimate — ~{money(est.estimated_total)}/mo.</p>
        )
      ) : (
        <p className="mt-0.5 text-[11px] text-amber-500">
          Partial — {est.priced_components}/{est.total_components} components priced. No total shown.
        </p>
      )}
    </div>
  );
}

function PlatformCard({ est }) {
  const meta = PLATFORMS[est.platform];
  const units = Object.entries(est.estimated_units || {});
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <PlatformChip platform={est.platform} />
        <span className="flex-1 font-medium text-foreground">{meta?.name || est.platform_name}</span>
        <ConfidenceBadge value={est.confidence} />
      </div>

      {/* Known cost + estimated usage */}
      <div className="border-b border-border px-4 py-3">
        <CostHeadline est={est} />
        <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Estimated usage</p>
        <p className="text-[11px] text-foreground">
          {units.length > 0
            ? units.map(([u, q]) => `${q.toLocaleString()} ${u}${q === 1 ? '' : 's'}/mo`).join(' · ')
            : 'No metered usage'}
        </p>

        {/* Platform cost vs. total automation cost — not a single headline. */}
        <div className="mt-2 grid grid-cols-3 gap-1 text-center" title="Known monthly cost by group ( + means unpriced extras exist )">
          <GroupCell label="Platform" group={est.cost_groups?.platform} />
          <GroupCell label="Operational" group={est.cost_groups?.operational} />
          <GroupCell label="Usage" group={est.cost_groups?.usage} />
        </div>
        {est.tradeoff?.responsibility && (
          <p className="mt-2 text-[10px] italic leading-snug text-muted-foreground">⤷ {est.tradeoff.responsibility}</p>
        )}
      </div>

      {/* Cost components — each with price, confidence, source + last checked */}
      <ul className="flex-1 divide-y divide-border/60 px-1 py-1">
        {est.cost_components.map((c, i) => (
          <li key={i} className="px-3 py-2">
            <div className="flex items-start gap-2">
              <span className="h-1.5 w-1.5 shrink-0 translate-y-1.5 rounded-full"
                style={{ background: c.line_cost == null ? 'var(--muted-foreground, #888)' : c.line_cost === 0 ? '#22c55e' : '#3b82f6' }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] text-foreground" title={c.reason}>{c.name}</span>
                {c.quantity != null && (
                  <span className="text-[10px] text-muted-foreground">{Number(c.quantity).toLocaleString()} {c.unit}</span>
                )}
              </span>
              <span className="shrink-0 text-right text-[11px]">
                {c.line_cost != null
                  ? <span className={cn(c.line_cost === 0 ? 'text-green-500' : 'text-foreground')}>{money(c.line_cost)}</span>
                  : <span className="text-muted-foreground">—</span>}
              </span>
            </div>
            {/* Provenance: only shown for priced lines, per the trust rule. */}
            {c.line_cost != null && (c.source || c.last_checked) && (
              <div className="ml-3.5 mt-0.5 flex flex-wrap items-center gap-1.5 text-[9.5px] text-muted-foreground">
                {c.source_url
                  ? <a href={c.source_url} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-foreground">{c.source}</a>
                  : c.source && <span>{c.source}</span>}
                {c.last_checked && <span>· checked {fmtDate(c.last_checked)}</span>}
                {c.freshness_label && (
                  <span className={cn(
                    'rounded px-1 py-px font-medium',
                    c.freshness === 'stale' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
                  )}>
                    ⚠ {c.freshness_label}
                  </span>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Unknown cost drivers */}
      {est.unknowns.length > 0 && (
        <div className="border-t border-border px-4 py-2.5">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-amber-500">
            <AlertTriangle className="h-3 w-3" /> Unknown cost drivers
          </p>
          <ul className="space-y-0.5">
            {est.unknowns.slice(0, 5).map((u, i) => (
              <li key={i} className="text-[11px] leading-snug text-muted-foreground">• {u}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Assumptions */}
      {est.assumptions?.length > 0 && (
        <details className="border-t border-border px-4 py-2">
          <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Assumptions ({est.assumptions.length})
          </summary>
          <ul className="mt-1 space-y-0.5">
            {est.assumptions.map((a, i) => (
              <li key={i} className="text-[10.5px] leading-snug text-muted-foreground">• {a}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export default function CostComparisonModal({ open, onOpenChange, blueprintId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [volume, setVolume] = useState('');

  const load = useCallback(async (monthlyRuns) => {
    if (!blueprintId) return;
    setLoading(true); setError(null);
    try {
      const qs = monthlyRuns ? `?monthlyRuns=${encodeURIComponent(monthlyRuns)}` : '';
      const res = await fetch(`/api/blueprints/${blueprintId}/cost${qs}`);
      if (res.status === 401) { window.location.assign('/login'); return; }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not build cost estimate');
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [blueprintId]);

  useEffect(() => { if (open) load(null); }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl gap-0 p-0 overflow-hidden">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="text-base">Estimated monthly cost — platform comparison</DialogTitle>
          <DialogDescription className="text-xs">
            Quantities are modeled from your Blueprint; prices come from verified pricing sources. Anything unpriced is shown as unknown — never guessed.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[75vh] overflow-y-auto scrollbar-thin px-6 py-5">
          {/* Volume control */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Monthly volume:</span>
            <span className="text-sm font-medium text-foreground">
              {data ? `${data.monthly_volume?.toLocaleString()} runs/mo` : '—'}
              {data?.volume_assumed && <span className="ml-1 text-[10px] text-amber-500">(assumed)</span>}
            </span>
            <div className="flex items-center gap-1.5">
              <Input
                type="number" min="1" placeholder="override"
                value={volume} onChange={(e) => setVolume(e.target.value)}
                className="h-8 w-28 text-xs"
              />
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
                onClick={() => load(volume ? Number(volume) : null)} disabled={loading}>
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Recalculate
              </Button>
            </div>
          </div>

          {loading && !data && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Building estimates across platforms…
            </div>
          )}
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-foreground">{error}</div>
          )}

          {data && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {data.platforms.map((est) => <PlatformCard key={est.platform} est={est} />)}
              </div>

              {/* Vendor-neutral platform tradeoffs — presented alongside the
                  numbers so "cheapest" is never the takeaway. */}
              {data.tradeoffs?.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Scale className="h-4 w-4 text-blue-500" /> Platform tradeoffs — cost vs. ownership
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {data.tradeoffs.map((t) => (
                      <div key={t.platform} className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <PlatformChip platform={t.platform} />
                          <span className="text-[12.5px] font-medium text-foreground">{t.platform_name}</span>
                        </div>
                        <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{t.summary}</p>
                        {t.cost_drivers?.length > 0 && (
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            <span className="font-medium">Cost drivers:</span> {t.cost_drivers.join(' · ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cost-saving suggestions */}
              {data.suggestions?.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Lightbulb className="h-4 w-4 text-amber-500" /> Cost-saving suggestions
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {data.suggestions.map((s, i) => {
                      const Icon = SUGGEST_ICON[s.kind] || SUGGEST_ICON.default;
                      return (
                        <div key={i} className="flex gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="text-[12.5px] font-medium text-foreground">{s.title}</p>
                            <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{s.detail}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">
                Some platform options (n8n Cloud vs Self-hosted split, Python/custom) and full dollar totals depend on pricing data still being seeded.
                Add verified prices with <code className="rounded bg-muted px-1">npm run seed:pricing</code> to replace “—” with real figures.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
