'use client';

import {
  RadialBar, RadialBarChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart,
  Bar, BarChart, XAxis, YAxis, CartesianGrid, Cell, LabelList, Pie, PieChart, Area, AreaChart,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

// Brand-consistent chart palette (oklch triplets live in globals.css as --chart-*).
const BLUE = 'oklch(0.62 0.19 255)';
const EMERALD = 'oklch(0.7 0.16 152)';
const AMBER = 'oklch(0.78 0.16 70)';
const VIOLET = 'oklch(0.62 0.22 300)';
const SLATE = 'oklch(0.6 0.02 260)';
const track = 'oklch(var(--muted))';
const PIE_COLORS = [BLUE, EMERALD, AMBER, VIOLET, SLATE, 'oklch(0.65 0.2 20)'];

function bandColor(score) {
  if (score >= 60) return EMERALD;
  if (score >= 40) return AMBER;
  return BLUE;
}

/* ── Department adoption bars (horizontal, band-coloured) ───────── */
export function DepartmentAdoptionChart({ data = [] }) {
  const chartData = data.slice(0, 10).map((d) => ({
    label: d.label.length > 16 ? `${d.label.slice(0, 15)}…` : d.label,
    value: Math.round(d.value || 0),
  }));
  if (!chartData.length) return null;
  return (
    <ChartContainer config={{ value: { label: 'Adoption' } }} className="h-[280px] w-full">
      <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 30, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="oklch(var(--border))" />
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis dataKey="label" type="category" width={130} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'oklch(var(--muted-foreground))' }} />
        <ChartTooltip cursor={{ fill: 'oklch(var(--muted) / 0.5)' }} content={<ChartTooltipContent formatter={(v) => `${v} / 100`} />} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
          {chartData.map((d, i) => <Cell key={i} fill={bandColor(d.value)} fillOpacity={0.85} />)}
          <LabelList dataKey="value" position="right" className="fill-muted-foreground" style={{ fontSize: 10 }} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/* ── Semicircle score gauge ─────────────────────────────────────── */
export function ScoreGauge({ score = 0, label }) {
  const color = bandColor(score);
  const data = [{ name: 'score', value: score, fill: 'url(#scoreGaugeGrad)' }];
  return (
    <div className="mx-auto w-[240px]">
      <div className="relative">
        <ChartContainer config={{ score: { label: 'Score' } }} className="h-[150px] w-[240px]">
          <RadialBarChart data={data} cx="50%" cy="100%" startAngle={180} endAngle={0} innerRadius={92} outerRadius={120} barSize={20}>
            <defs>
              <linearGradient id="scoreGaugeGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={BLUE} />
                <stop offset="100%" stopColor={color} />
              </linearGradient>
            </defs>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
            <RadialBar dataKey="value" background={{ fill: track }} cornerRadius={12} />
          </RadialBarChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="text-[3.25rem] font-bold leading-none tracking-tight" style={{ color }}>{score}</span>
          <span className="mt-0.5 text-[11px] text-muted-foreground">out of 100</span>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between px-1 text-[10px] font-medium text-muted-foreground">
        <span>0</span>
        {label && <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold" style={{ color }}>{label}</span>}
        <span>100</span>
      </div>
    </div>
  );
}

/* ── Score-driver radar ─────────────────────────────────────────── */
export function ScoreDriversRadar({ data = [] }) {
  const chartData = data.map((d) => ({ label: d.label, value: Math.round((d.value || 0) * 100) }));
  return (
    <ChartContainer config={{ value: { label: 'Strength', color: BLUE } }} className="mx-auto h-[260px] w-full">
      <RadarChart data={chartData} outerRadius="72%">
        <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(v) => `${v}%`} hideLabel />} />
        <PolarGrid stroke="oklch(var(--border))" />
        <PolarAngleAxis dataKey="label" tick={{ fontSize: 10, fill: 'oklch(var(--muted-foreground))' }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar dataKey="value" fill={BLUE} fillOpacity={0.35} stroke={BLUE} strokeWidth={2} dot={{ r: 3, fill: BLUE }} />
      </RadarChart>
    </ChartContainer>
  );
}

/* ── Score-driver horizontal bars ───────────────────────────────── */
export function ScoreDriversBars({ data = [] }) {
  const chartData = data.map((d) => ({
    label: d.label.length > 22 ? `${d.label.slice(0, 21)}…` : d.label,
    value: Math.round((d.value || 0) * 100),
  }));
  return (
    <ChartContainer config={{ value: { label: 'Strength' } }} className="h-[260px] w-full">
      <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 28, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="oklch(var(--border))" />
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis dataKey="label" type="category" width={150} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'oklch(var(--muted-foreground))' }} />
        <ChartTooltip cursor={{ fill: 'oklch(var(--muted) / 0.5)' }} content={<ChartTooltipContent formatter={(v) => `${v}%`} />} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={14} fill={BLUE} fillOpacity={0.85}>
          <LabelList dataKey="value" position="right" formatter={(v) => `${v}%`} className="fill-muted-foreground" style={{ fontSize: 10 }} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/* Multi-line, non-rotated axis tick that wraps the full label onto up to 3 lines. */
function WrappedTick({ x, y, payload }) {
  const words = String(payload?.value ?? '').split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (cur && `${cur} ${w}`.length > 11) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return (
    <g transform={`translate(${x},${y})`}>
      {lines.slice(0, 3).map((ln, i) => (
        <text key={i} x={0} y={12 + i * 11} textAnchor="middle" fontSize={10} fill="oklch(var(--muted-foreground))">{ln}</text>
      ))}
    </g>
  );
}

/* ── Score-driver area chart ────────────────────────────────────── */
export function ScoreDriversArea({ data = [] }) {
  const chartData = data.map((d) => ({ label: d.label, value: Math.round((d.value || 0) * 100) }));
  return (
    <ChartContainer config={{ value: { label: 'Strength', color: BLUE } }} className="h-[300px] w-full">
      <AreaChart data={chartData} margin={{ left: 0, right: 12, top: 12, bottom: 8 }}>
        <defs>
          <linearGradient id="scoreAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BLUE} stopOpacity={0.45} />
            <stop offset="100%" stopColor={BLUE} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="oklch(var(--border))" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} height={52} tick={<WrappedTick />} />
        <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={34} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: 'oklch(var(--muted-foreground))' }} />
        <ChartTooltip cursor={{ stroke: 'oklch(var(--border))', strokeWidth: 1 }} content={<ChartTooltipContent formatter={(v) => `${v}%`} />} />
        <Area dataKey="value" type="monotone" stroke={BLUE} strokeWidth={2.5} fill="url(#scoreAreaGrad)" dot={{ r: 3, fill: BLUE, strokeWidth: 0 }} activeDot={{ r: 5, fill: BLUE }} />
      </AreaChart>
    </ChartContainer>
  );
}

/* ── Opportunity potential bars (horizontal) ────────────────────── */
export function OpportunityBars({ data = [] }) {
  const chartData = data
    .filter((o) => (o.est_hours_month || 0) > 0)
    .slice(0, 8)
    .map((o) => ({
      label: o.label.length > 24 ? `${o.label.slice(0, 23)}…` : o.label,
      hours: o.est_hours_month || 0,
      addressed: !!o.blueprint_id || o.status === 'addressed',
    }));
  if (!chartData.length) return null;
  return (
    <ChartContainer config={{ hours: { label: 'Est. hours/mo' } }} className="h-[280px] w-full">
      <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 32, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="oklch(var(--border))" />
        <XAxis type="number" hide />
        <YAxis dataKey="label" type="category" width={160} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'oklch(var(--muted-foreground))' }} />
        <ChartTooltip cursor={{ fill: 'oklch(var(--muted) / 0.5)' }} content={<ChartTooltipContent formatter={(v) => `~${v}h / mo`} />} />
        <Bar dataKey="hours" radius={[0, 4, 4, 0]} barSize={16}>
          {chartData.map((d, i) => (
            <Cell key={i} fill={d.addressed ? EMERALD : BLUE} fillOpacity={d.addressed ? 0.9 : 0.75} />
          ))}
          <LabelList dataKey="hours" position="right" formatter={(v) => `${v}h`} className="fill-muted-foreground" style={{ fontSize: 10 }} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/* ── Generic distribution donut with side legend (status / complexity) ── */
export function DistributionDonut({ data = [], centerLabel, centerValue }) {
  const chartData = data.filter((d) => d.value > 0);
  if (!chartData.length) return null;
  const total = chartData.reduce((a, d) => a + d.value, 0);
  const config = Object.fromEntries(chartData.map((d, i) => [d.name, { label: d.name, color: PIE_COLORS[i % PIE_COLORS.length] }]));
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10">
      <div className="relative h-[190px] w-[190px] shrink-0">
        <ChartContainer config={config} className="h-[190px] w-[190px]">
          <PieChart>
            <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="name" hideLabel />} />
            <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={90} paddingAngle={2} strokeWidth={2} stroke="oklch(var(--card))" cornerRadius={4}>
              {chartData.map((d, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
          </PieChart>
        </ChartContainer>
        {centerValue != null && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold tracking-tight">{centerValue}</span>
            {centerLabel && <span className="text-[11px] text-muted-foreground">{centerLabel}</span>}
          </div>
        )}
      </div>

      <ul className="w-full max-w-[280px] space-y-3">
        {chartData.map((d, i) => {
          const pct = total ? Math.round((d.value / total) * 100) : 0;
          const color = PIE_COLORS[i % PIE_COLORS.length];
          return (
            <li key={d.name} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{d.name}</span>
                <span className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{d.value}</span> · {pct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} /></div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Telemetry mini radial (success rate) ───────────────────────── */
export function SuccessRadial({ rate = 0 }) {
  const color = rate >= 90 ? EMERALD : rate >= 70 ? AMBER : 'oklch(var(--destructive))';
  const data = [{ name: 'rate', value: rate, fill: color }];
  return (
    <div className="relative mx-auto h-[120px] w-[120px]">
      <ChartContainer config={{ rate: { label: 'Success' } }} className="h-[120px] w-[120px]">
        <RadialBarChart data={data} startAngle={90} endAngle={90 - (rate / 100) * 360} innerRadius={44} outerRadius={58} barSize={11}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
          <RadialBar dataKey="value" background={{ fill: track }} cornerRadius={20} />
        </RadialBarChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold" style={{ color }}>{rate}%</span>
      </div>
    </div>
  );
}

/* ── Stage progression funnel bars ──────────────────────────────── */
export function StageFunnel({ stages = [], reachedIndex = -1 }) {
  const chartData = stages.map((s, i) => ({ label: s, reached: i <= reachedIndex ? 1 : 0, idx: i }));
  return (
    <ChartContainer config={{ reached: { label: 'Reached' } }} className="h-[200px] w-full">
      <BarChart data={chartData} margin={{ left: 0, right: 0, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="oklch(var(--border))" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 9, fill: 'oklch(var(--muted-foreground))' }} />
        <YAxis hide domain={[0, 1]} />
        <Bar dataKey="reached" radius={[4, 4, 0, 0]} barSize={28} minPointSize={4}>
          {chartData.map((d, i) => (
            <Cell key={i} fill={d.reached ? BLUE : 'oklch(var(--muted))'} fillOpacity={d.reached ? 0.9 : 0.5} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
