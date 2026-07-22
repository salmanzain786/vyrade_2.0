'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, RefreshCw, Lightbulb, AlertTriangle, TrendingDown, Target, Info } from 'lucide-react';
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
  recommendation: Lightbulb, default: Info,
};

function money(n) {
  if (n == null) return null;
  if (n === 0) return '$0';
  return n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

function ConfidenceBadge({ value }) {
  const c = CONF[value] || CONF.unknown;
  return <Badge variant="outline" className={cn('text-[10px] font-medium', c.cls)}>{c.label}</Badge>;
}

function TotalLine({ est }) {
  if (est.estimated_total != null) {
    return (
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-semibold text-foreground">{money(est.estimated_total)}</span>
        <span className="text-[11px] text-muted-foreground">/mo{est.total_is_partial ? ' core' : ''}</span>
      </div>
    );
  }
  if (est.estimated_subtotal != null && est.estimated_subtotal > 0) {
    return (
      <div className="flex flex-col">
        <span className="text-base font-semibold text-foreground">{money(est.estimated_subtotal)}<span className="text-[11px] font-normal text-muted-foreground"> known</span></span>
        <span className="text-[10px] text-amber-500">+ unpriced items</span>
      </div>
    );
  }
  return <span className="text-sm font-medium text-muted-foreground">Not priced yet</span>;
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

      <div className="border-b border-border px-4 py-3">
        <TotalLine est={est} />
        {units.length > 0 && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {units.map(([u, q]) => `${q.toLocaleString()} ${u}${q === 1 ? '' : 's'}/mo`).join(' · ')}
          </p>
        )}
      </div>

      {/* Cost components */}
      <ul className="flex-1 divide-y divide-border/60 px-1 py-1">
        {est.cost_components.map((c, i) => (
          <li key={i} className="flex items-start gap-2 px-3 py-2" title={c.reason}>
            <span className="h-1.5 w-1.5 shrink-0 translate-y-1.5 rounded-full"
              style={{ background: c.line_cost == null ? 'var(--muted-foreground, #888)' : c.line_cost === 0 ? '#22c55e' : '#3b82f6' }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] text-foreground">{c.name}</span>
              {c.quantity != null && (
                <span className="text-[10px] text-muted-foreground">{Number(c.quantity).toLocaleString()} {c.unit}</span>
              )}
            </span>
            <span className="shrink-0 text-right text-[11px]">
              {c.line_cost != null
                ? <span className={cn(c.line_cost === 0 ? 'text-green-500' : 'text-foreground')}>{money(c.line_cost)}</span>
                : <span className="text-muted-foreground">—</span>}
            </span>
          </li>
        ))}
      </ul>

      {est.unknowns.length > 0 && (
        <div className="border-t border-border px-4 py-2.5">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-amber-500">
            <AlertTriangle className="h-3 w-3" /> Unknowns / plan reqs
          </p>
          <ul className="space-y-0.5">
            {est.unknowns.slice(0, 4).map((u, i) => (
              <li key={i} className="text-[11px] leading-snug text-muted-foreground">• {u}</li>
            ))}
          </ul>
        </div>
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
