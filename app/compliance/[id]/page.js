import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, AlertTriangle, FileWarning, ClipboardList, Eye, History, ArrowUp, ArrowDown, Minus, GitCompareArrows, CheckCircle2, XCircle, RotateCcw, ListTodo, ExternalLink, ArrowLeft, Gauge, ShieldAlert, FileText } from 'lucide-react';
import { Card as UICard, CardContent as UICardContent, CardHeader as UICardHeader, CardTitle as UICardTitle } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/auth/session';
import { assertBlueprintOwner } from '@/lib/auth/ownership';
import { getScanContextForBlueprint, getLatestScan, getScanHistory, saveScan, getLastTwoScans, getResolutions } from '@/lib/services/scanner/scanRepository';
import { getTaskOrigin } from '@/lib/services/work-intelligence/writeback/taskLinkRepository';
import { scanContext } from '@/lib/services/scanner/scan';
import { diffScans, detectRegressions, findingKey } from '@/lib/services/scanner/reassessment';
import { VyradeMark } from '@/components/VyradeLogo';
import RescanButton from '@/components/scanner/RescanButton';
import PolicyEditor from '@/components/scanner/PolicyEditor';
import RemediateButton from '@/components/scanner/RemediateButton';
import FindingStatus from '@/components/scanner/FindingStatus';

export const dynamic = 'force-dynamic';

const fmtDate = (d) => { try { return new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return String(d); } };

const SEV = {
  critical: 'bg-red-600/10 text-red-600 border-red-600/20 dark:text-red-400',
  high: 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400',
  medium: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400',
  low: 'bg-slate-500/10 text-slate-600 border-slate-500/20 dark:text-slate-400',
  info: 'bg-slate-500/10 text-muted-foreground border-border',
};
const RISK_TONE = { High: 'text-red-600 dark:text-red-400', Medium: 'text-amber-600 dark:text-amber-400', Low: 'text-emerald-600 dark:text-emerald-400' };
const bandTone = (pct) => (pct >= 85 ? 'text-emerald-600 dark:text-emerald-400' : pct >= 70 ? 'text-blue-600 dark:text-blue-400' : pct >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400');

function Badge({ severity, children }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${SEV[severity] || SEV.info}`}>{children || severity}</span>;
}
function Card({ title, icon: Icon, children }) {
  return (
    <UICard className="mt-6">
      <UICardHeader className="flex flex-row items-center gap-2.5 space-y-0">
        {Icon && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"><Icon className="h-4 w-4" /></span>}
        <UICardTitle className="text-base">{title}</UICardTitle>
      </UICardHeader>
      <UICardContent>{children}</UICardContent>
    </UICard>
  );
}

export default async function CompliancePage({ params }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  try { await assertBlueprintOwner(user, params.id); } catch { notFound(); }

  // Render from the latest PERSISTED snapshot. On first-ever view, compute a
  // baseline and persist it, then read it back (so created_at is real and the
  // page always shows an immutable, comparable snapshot — not a live re-compute).
  let latest = await getLatestScan(params.id).catch(() => null);
  if (!latest?.report) {
    const ctx = await getScanContextForBlueprint(params.id).catch(() => null);
    if (!ctx) notFound();
    const result = scanContext(ctx);
    await saveScan({ blueprintId: params.id, userId: user.id, ctx, result });
    latest = await getLatestScan(params.id).catch(() => null);
  }
  if (!latest?.report) notFound();

  const history = await getScanHistory(params.id, 12).catch(() => []);
  const prev = history[1] || null; // history[0] is the current scan
  const delta = prev ? latest.readiness_pct - prev.readiness_pct : null;

  // Phase 7 — reassessment (before/after) + resolution tracking + regressions.
  const [twoScans, resolutions] = await Promise.all([
    getLastTwoScans(params.id).catch(() => []),
    getResolutions(params.id).catch(() => ({})),
  ]);
  const reassessment = twoScans.length >= 2 ? diffScans({ current: twoScans[0], previous: twoScans[1] }) : null;
  const regressions = detectRegressions(latest.findings || [], resolutions);
  const regressionKeys = new Set(regressions.map(findingKey));

  // Phase 5.3 — make the Assurance report task-aware: acknowledge the originating task.
  const taskOrigin = await getTaskOrigin(params.id).catch(() => null);

  const scan = { workflow_name: latest.workflow_name, node_count: latest.node_count, summary: latest.summary || {} };
  const r = latest.report;
  const o = r.overall;
  const e = r.evidence_and_limitations;
  const pc = r.policy_compliance || null;
  const PC_TONE = { compliant: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400', violations: 'border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400', no_policy: 'border-border bg-muted/30 text-muted-foreground', policy_disabled: 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400' };

  const FindingRow = ({ f }) => {
    const key = findingKey(f);
    const res = resolutions[key];
    const dimmed = res && (res.status === 'resolved' || res.status === 'accepted_risk');
    return (
      <div className={`flex items-start gap-3 border-b border-border py-4 last:border-0 ${dimmed ? 'opacity-55' : ''}`}>
        <Badge severity={f.severity} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[15px] font-semibold leading-snug">
            {f.title}
            {regressionKeys.has(key) && <span className="rounded bg-red-600/10 px-1.5 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400">regression</span>}
          </div>
          <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.detail}</div>
          {f.node && <div className="mt-1 text-xs text-muted-foreground">Node: <span className="font-mono">{f.node}</span></div>}
        </div>
        <FindingStatus blueprintId={params.id} type={f.type} node={f.node} initial={res?.status || 'open'} />
      </div>
    );
  };

  return (
    <div className="w-full px-4 py-6 md:px-6 lg:px-8">
      <Link href="/" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to workspace
      </Link>

      {/* Hero */}
      <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400"><ShieldCheck className="h-6 w-6" /></span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Governance &amp; Compliance assessment</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">{scan.workflow_name || 'Blueprint operational controls'}{scan.node_count ? ` · ${scan.node_count} nodes` : ''}</p>
              <p className="mt-1 text-xs text-muted-foreground">Last scanned {fmtDate(latest.created_at)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/report/${params.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-100"><FileText className="h-4 w-4" /> Go to report</Link>
            <RemediateButton blueprintId={params.id} />
            <RescanButton blueprintId={params.id} />
          </div>
        </div>
      </div>

      <main className="mt-6">

        {/* Phase 5.3 — originating task (Automation Assurance is task-aware) */}
        {taskOrigin && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 text-sm">
            <span className="flex items-center gap-2 text-blue-700 dark:text-blue-400"><ListTodo className="h-4 w-4" /> Assurance for an automation from a {taskOrigin.platform || 'task-platform'} task{taskOrigin.task_name ? <>: <span className="font-medium">{taskOrigin.task_name}</span></> : ''}.</span>
            {taskOrigin.task_url && <a href={taskOrigin.task_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400">Open task <ExternalLink className="h-4 w-4" /></a>}
          </div>
        )}

        {/* Disclaimers — first-class, per the spec */}
        <div className="mt-4 space-y-2.5">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm leading-relaxed text-amber-700 dark:text-amber-400"><strong>Gap assessment, not a certification.</strong> {r.disclaimer}</div>
          {!r.framework_review?.status || r.framework_review.status !== 'reviewed' ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm leading-relaxed text-red-700 dark:text-red-400"><strong>Framework mappings pending review.</strong> {r.framework_review?.warning}</div>
          ) : null}
        </div>

        {/* 5.1 Overall */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <UICard>
            <UICardContent className="flex items-start gap-3 p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400"><Gauge className="h-5 w-5" /></span>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Governance readiness</div>
                <div className={`mt-1 text-3xl font-bold tracking-tight ${bandTone(o.governance_readiness_pct)}`}>{o.governance_readiness_pct}%</div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{o.readiness_band}</span>
                  {delta !== null && delta !== 0 && (
                    <span className={`inline-flex items-center gap-0.5 font-medium ${delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {delta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{Math.abs(delta)} pts
                    </span>
                  )}
                  {delta === 0 && <span className="inline-flex items-center gap-0.5 text-muted-foreground"><Minus className="h-3 w-3" />no change</span>}
                </div>
              </div>
            </UICardContent>
          </UICard>
          <UICard>
            <UICardContent className="flex items-start gap-3 p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400"><ShieldAlert className="h-5 w-5" /></span>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Security risk</div>
                <div className={`mt-1 text-3xl font-bold tracking-tight ${RISK_TONE[o.security_risk_level] || ''}`}>{o.security_risk_level}</div>
              </div>
            </UICardContent>
          </UICard>
          <UICard>
            <UICardContent className="flex items-start gap-3 p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400"><FileWarning className="h-5 w-5" /></span>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Findings</div>
                <div className="mt-1 text-3xl font-bold tracking-tight">{scan.summary.total}</div>
                <div className="mt-1 text-xs text-muted-foreground">{scan.summary.manual_review_count} need review</div>
              </div>
            </UICardContent>
          </UICard>
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">{o.caveat}</p>

        {/* 7.3 Reassessment — before/after vs the previous scan */}
        {reassessment?.has_previous && (reassessment.counts.resolved + reassessment.counts.new) > 0 && (
          <Card title="Since the last scan" icon={RotateCcw}>
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" />{reassessment.counts.resolved} resolved</span>
              <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400"><AlertTriangle className="h-4 w-4" />{reassessment.counts.new} new</span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Minus className="h-4 w-4" />{reassessment.counts.persisting} still open</span>
              {reassessment.readiness_delta != null && reassessment.readiness_delta !== 0 && (
                <span className={`inline-flex items-center gap-1 font-medium ${reassessment.readiness_delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {reassessment.readiness_delta > 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}readiness {reassessment.readiness_delta > 0 ? '+' : ''}{reassessment.readiness_delta} pts
                </span>
              )}
            </div>
            {reassessment.resolved.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resolved</div>
                <ul className="mt-1.5 space-y-1">{reassessment.resolved.slice(0, 8).map((f, i) => <li key={i} className="text-sm text-emerald-700 line-through dark:text-emerald-400">{f.title}{f.node ? ` — ${f.node}` : ''}</li>)}</ul>
              </div>
            )}
            {reassessment.new.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Newly introduced</div>
                <ul className="mt-1.5 space-y-1">{reassessment.new.slice(0, 8).map((f, i) => <li key={i} className="text-sm text-red-700 dark:text-red-400">{f.title}{f.node ? ` — ${f.node}` : ''}</li>)}</ul>
              </div>
            )}
          </Card>
        )}

        {regressions.length > 0 && (
          <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-400">
            <strong>{regressions.length} regression{regressions.length === 1 ? '' : 's'}.</strong> {regressions.length === 1 ? 'A finding' : 'Findings'} you marked resolved {regressions.length === 1 ? 'has' : 'have'} reappeared in the latest scan — see the “regression” tags below.
          </div>
        )}

        {/* Framework alignment */}
        <Card title="Framework alignment" icon={ShieldCheck}>
          <div className="grid gap-3 sm:grid-cols-3">
            {o.framework_alignment.map((fw) => (
              <div key={fw.framework} className="rounded-xl border border-border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-base font-semibold">{fw.framework}</div>
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${fw.gap_areas ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>{fw.status}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-600 dark:text-amber-400">{fw.gap_areas} gap{fw.gap_areas === 1 ? '' : 's'}</span>
                  <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">{fw.assessed_areas} assessed</span>
                  <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">{fw.not_assessed} not assessed</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* 6.4 Policy compliance — Blueprint-vs-workflow (the differentiator) */}
        {pc && (
          <Card title="Policy compliance — does this match what was approved?" icon={GitCompareArrows}>
            <div className={`rounded-lg border p-4 text-sm leading-relaxed ${PC_TONE[pc.status] || PC_TONE.no_policy}`}>{pc.summary}</div>

            {pc.version_drift?.drifted && (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm leading-relaxed text-amber-700 dark:text-amber-400">
                <strong>Version drift.</strong> {pc.version_drift.detail}
              </div>
            )}

            {pc.violations?.length > 0 && (
              <ul className="mt-4 space-y-3">
                {pc.violations.map((v, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold leading-snug">{v.title}</div>
                      <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{v.detail}</div>
                    </div>
                    <Badge severity={v.severity} />
                  </li>
                ))}
              </ul>
            )}

            {pc.status === 'compliant' && (
              <div className="mt-3 flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" />Workflow matches approved policy on the evaluated checks.</div>
            )}
          </Card>
        )}

        {/* 6.1 Policy editor — author the approved policy */}
        <div className="mt-6"><PolicyEditor blueprintId={params.id} /></div>

        {/* 5.2 Priority findings */}
        {(r.priority_findings.critical.length + r.priority_findings.high.length) > 0 && (
          <Card title="Critical & high-priority findings" icon={AlertTriangle}>
            {r.priority_findings.critical.map((f, i) => <FindingRow key={`c${i}`} f={f} />)}
            {r.priority_findings.high.map((f, i) => <FindingRow key={`h${i}`} f={f} />)}
          </Card>
        )}

        {/* 5.3 Remediations */}
        {r.remediations.length > 0 && (
          <Card title="Recommended remediations" icon={ClipboardList}>
            <ul className="space-y-4">
              {r.remediations.map((rem) => (
                <li key={rem.type} className="flex items-start gap-3">
                  <Badge severity={rem.severity} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] leading-relaxed">{rem.recommendation}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {rem.count} occurrence{rem.count === 1 ? '' : 's'}{rem.nodes.length ? ` · ${rem.nodes.slice(0, 4).join(', ')}${rem.nodes.length > 4 ? '…' : ''}` : ''}
                    </div>
                    {rem.blueprint_hint && <div className="mt-1 text-xs text-blue-600 dark:text-blue-400">{rem.blueprint_hint}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* 5.4 Evidence & limitations — first-class */}
        <Card title="Evidence & limitations" icon={Eye}>
          <div className="grid gap-5 text-sm sm:grid-cols-2">
            <div>
              <div className="text-[15px] font-semibold">Detected from the workflow</div>
              <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{e.detected_from_workflow.note} ({e.detected_from_workflow.finding_count} findings)</div>
              <div className="mt-2 flex flex-wrap gap-1.5">{e.detected_from_workflow.check_families.map((c) => <span key={c} className="rounded-md border border-border bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground">{c}</span>)}</div>
            </div>
            <div>
              <div className="text-[15px] font-semibold">From the Blueprint</div>
              <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{e.from_blueprint.note}</div>
              {e.from_blueprint.assessed && <div className="mt-2 flex flex-wrap gap-1.5">{e.from_blueprint.check_families.map((c) => <span key={c} className="rounded-md border border-border bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground">{c}</span>)}</div>}
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[15px] font-semibold"><FileWarning className="h-4 w-4 text-amber-600 dark:text-amber-400" />Not assessed by this scan</div>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">{e.not_assessed.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </div>
            <div>
              <div className="text-[15px] font-semibold">Out of scope (not visible from a workflow)</div>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">{e.out_of_scope.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </div>
          </div>
        </Card>

        {/* Scan history — the persisted trail (Phase 7 before/after) */}
        {history.length > 1 && (
          <Card title="Scan history" icon={History}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-1.5 pr-4 font-medium">When</th>
                    <th className="py-1.5 pr-4 font-medium">Readiness</th>
                    <th className="py-1.5 pr-4 font-medium">Security risk</th>
                    <th className="py-1.5 pr-4 font-medium">Findings</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => {
                    const nxt = history[i + 1]; // older scan
                    const d = nxt ? h.readiness_pct - nxt.readiness_pct : null;
                    return (
                      <tr key={h.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2.5 pr-4 text-muted-foreground">{fmtDate(h.created_at)}{i === 0 && <span className="ml-1.5 rounded bg-blue-600/10 px-1.5 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">latest</span>}</td>
                        <td className="py-2.5 pr-4">
                          <span className={`font-medium ${bandTone(h.readiness_pct)}`}>{h.readiness_pct}%</span>
                          {d !== null && d !== 0 && <span className={`ml-1.5 text-xs ${d > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{d > 0 ? '+' : ''}{d}</span>}
                        </td>
                        <td className="py-2.5 pr-4"><span className={RISK_TONE[h.security_risk_level] || ''}>{h.security_risk_level || '—'}</span></td>
                        <td className="py-2.5 pr-4 text-muted-foreground">{h.findings_total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
