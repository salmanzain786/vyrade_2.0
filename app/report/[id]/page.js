import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { assertBlueprintOwner } from '@/lib/auth/ownership';
import { getLatest } from '@/lib/services/blueprintRepository.js';
import { generateBlueprintReport } from '@/lib/services/report/blueprintReport.js';
import { getLatestScan } from '@/lib/services/scanner/scanRepository';
import { VyradeMark } from '@/components/VyradeLogo';
import PrintButton from '@/components/report/PrintButton';
import { cn, formatMoney } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const RISK = {
  high: 'bg-red-500/10 text-red-500 border-red-500/20',
  medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  low: 'bg-green-500/10 text-green-500 border-green-500/20',
};
const money = (n, c) => formatMoney(n, c) ?? '—';

function Section({ n, title, children }) {
  return (
    <section className="mb-8 break-inside-avoid">
      <h2 className="mb-3 flex items-center gap-2 border-b border-border pb-1.5 text-[15px] font-semibold text-foreground">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 font-mono text-[10px] text-primary">{n}</span>
        {title}
      </h2>
      <div className="text-[13px] leading-relaxed text-foreground">{children}</div>
    </section>
  );
}

export default async function ReportPage({ params }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  try { await assertBlueprintOwner(user, params.id); } catch { notFound(); }

  const record = await getLatest(params.id);
  if (!record?.blueprint) notFound();

  const report = await generateBlueprintReport({
    blueprint: record.blueprint, blueprintId: params.id, blueprintVersion: record.version,
  });
  const s = report.sections;

  // Phase 8.1 — governance status per Blueprint, from the latest persisted scan.
  const gov = await getLatestScan(params.id).catch(() => null);
  const govFrameworks = gov?.report?.overall?.framework_alignment || [];
  const govBandTone = (p) => (p == null ? 'text-muted-foreground' : p >= 85 ? 'text-emerald-600 dark:text-emerald-400' : p >= 70 ? 'text-blue-600 dark:text-blue-400' : p >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400');
  const govRiskTone = { High: 'text-red-600 dark:text-red-400', Medium: 'text-amber-600 dark:text-amber-400', Low: 'text-emerald-600 dark:text-emerald-400' };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border print:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
          <Link href={`/chat/${record.session_id || ''}`} className="flex items-center gap-2">
            <VyradeMark className="h-6 w-auto" /><span className="text-sm font-semibold">Vyrade</span>
          </Link>
          <div className="flex items-center gap-3 print:hidden">
            <Link href={`/compliance/${params.id}`} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent">Governance &amp; Compliance</Link>
            <PrintButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8 print:py-2">
        {/* Cover */}
        <div className="mb-8 border-b-2 border-primary/40 pb-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Automation Blueprint Report</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">{record.blueprint.name || 'Untitled automation'}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Version {report.blueprint_version} · Confidence: <span className="capitalize">{report.confidence}</span>
          </p>
        </div>

        {/* Governance status (Phase 8.1) — from the latest governance scan */}
        <div className="mb-8 rounded-lg border border-border bg-card p-4 print:hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Governance &amp; Compliance</span>
            <Link href={`/compliance/${params.id}`} className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
              {gov ? 'View full assessment →' : 'Run a scan →'}
            </Link>
          </div>
          {gov ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-3">
              <div>
                <div className="text-[11px] text-muted-foreground">Readiness</div>
                <div className={`text-xl font-bold ${govBandTone(gov.readiness_pct)}`}>{gov.readiness_pct}%<span className="ml-1 text-xs font-normal text-muted-foreground">{gov.readiness_band}</span></div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">Security risk</div>
                <div className={`text-xl font-bold ${govRiskTone[gov.security_risk_level] || ''}`}>{gov.security_risk_level || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">Findings</div>
                <div className="text-xl font-bold">{gov.findings_total}</div>
              </div>
              {govFrameworks.length > 0 && (
                <div>
                  <div className="text-[11px] text-muted-foreground">Frameworks</div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {govFrameworks.map((fw) => (
                      <span key={fw.framework} className={`rounded border px-1.5 py-0.5 text-[10px] ${fw.gap_areas ? 'border-amber-500/30 text-amber-600 dark:text-amber-400' : 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400'}`}>{fw.framework}: {fw.gap_areas ? `${fw.gap_areas} gap${fw.gap_areas === 1 ? '' : 's'}` : 'ok'}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">This automation hasn’t been scanned for governance &amp; compliance yet.</p>
          )}
        </div>

        {/* 1. Business problem */}
        <Section n="1" title="Business problem">
          <p>{s.business_problem.summary}</p>
        </Section>

        {/* 2. Current / intended process (may not be manual) */}
        <Section n="2" title={s.current_process.heading || 'Current / intended process'}>
          <p className="mb-2 text-muted-foreground">{s.current_process.note}</p>
          {s.current_process.steps.length > 0 && (
            <ol className="list-decimal space-y-1 pl-5">{s.current_process.steps.map((st, i) => <li key={i}>{st}</li>)}</ol>
          )}
        </Section>

        {/* 3. Automation Blueprint (the designed automation) */}
        <Section n="3" title="Automation Blueprint">
          <p className="mb-2">
            <span className="font-medium">Trigger:</span>{' '}
            <span className="text-muted-foreground">
              {s.automation_blueprint.trigger.type}
              {s.automation_blueprint.trigger.event ? ` — ${s.automation_blueprint.trigger.event}` : ''}
              {s.automation_blueprint.trigger.source ? ` (from ${s.automation_blueprint.trigger.source})` : ''}
            </span>
          </p>
          {s.automation_blueprint.steps.length > 0 && (
            <ol className="list-decimal space-y-1 pl-5">
              {s.automation_blueprint.steps.map((st) => (
                <li key={st.sequence}>{st.action} <span className="text-[10px] text-muted-foreground">[{st.action_type}]</span></li>
              ))}
            </ol>
          )}
          <p className="mt-2 text-[12px] text-muted-foreground">
            {s.automation_blueprint.systems_count} system(s)
            {s.automation_blueprint.has_ai ? ' · includes AI steps' : ''}
            {s.automation_blueprint.has_branching ? ' · conditional logic' : ''}
            {s.automation_blueprint.volume.estimated_executions ? ` · ~${Number(s.automation_blueprint.volume.estimated_executions).toLocaleString()}/${s.automation_blueprint.volume.period}` : ''}
          </p>
        </Section>

        {/* 4. Systems involved */}
        <Section n="4" title="Systems involved">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1 pr-3 font-medium">System</th><th className="py-1 pr-3 font-medium">Role</th>
                <th className="py-1 pr-3 font-medium">Auth</th><th className="py-1 pr-3 font-medium">Complexity</th><th className="py-1 font-medium">Security</th>
              </tr></thead>
              <tbody>
                {s.systems.map((sys, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-1.5 pr-3 font-medium">{sys.name}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{sys.role}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{sys.auth_method}</td>
                    <td className="py-1.5 pr-3 capitalize text-muted-foreground">{sys.integration_complexity}</td>
                    <td className="py-1.5 capitalize text-muted-foreground">{sys.security_risk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* 4. Business rules */}
        <Section n="5" title="Business rules">
          {s.business_rules.rules.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {s.business_rules.rules.map((r, i) => <li key={i}>{r.description}{r.result ? <span className="text-muted-foreground"> → {r.result}</span> : null}</li>)}
            </ul>
          ) : <p className="text-muted-foreground">No explicit business rules captured.</p>}
          {s.business_rules.exceptions.length > 0 && (
            <div className="mt-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Exceptions</p>
              <ul className="list-disc space-y-1 pl-5">{s.business_rules.exceptions.map((e, i) => <li key={i}>{e.scenario}: {e.behavior}</li>)}</ul>
            </div>
          )}
        </Section>

        {/* 5. Risk areas */}
        <Section n="6" title="Risk areas">
          <div className="space-y-2">
            {s.risk_areas.map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize', RISK[r.severity] || RISK.low)}>{r.severity}</span>
                <span><span className="font-medium">{r.area}.</span> <span className="text-muted-foreground">{r.detail}</span></span>
              </div>
            ))}
          </div>
        </Section>

        {/* 6. Recommended architecture */}
        <Section n="7" title="Recommended architecture">
          <p className="mb-1"><span className="font-semibold text-foreground">{s.recommended_architecture.name}</span> <span className="text-[11px] capitalize text-muted-foreground">({s.recommended_architecture.suitability} fit)</span></p>
          <p className="mb-2 text-muted-foreground">{s.recommended_architecture.reason}</p>
          {s.recommended_architecture.alternatives.length > 0 && (
            <p className="text-[12px] text-muted-foreground"><span className="font-medium">Alternatives:</span> {s.recommended_architecture.alternatives.map((a) => a.name).join(', ')}.</p>
          )}
          <p className="mt-1 text-[12px] text-muted-foreground">{s.recommended_architecture.cost_notes}</p>
        </Section>

        {/* 7. Cost comparison */}
        <Section n="8" title="Cost comparison">
          <p className="mb-2 text-[12px] text-muted-foreground">
            At ~{Number(s.cost_comparison.monthly_volume).toLocaleString()} runs/mo{s.cost_comparison.volume_assumed ? ' (assumed)' : ''}. {s.cost_comparison.note}
          </p>
          <table className="w-full text-[12px]">
            <thead><tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-1 pr-3 font-medium">Platform</th><th className="py-1 pr-3 font-medium">Known cost</th><th className="py-1 font-medium">Confidence</th>
            </tr></thead>
            <tbody>
              {s.cost_comparison.platforms.map((p, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-1.5 pr-3 font-medium">{p.name}</td>
                  <td className="py-1.5 pr-3">{money(p.known_monthly_cost, p.currency)}/mo{p.estimated_total == null ? ' +' : ''}</td>
                  <td className="py-1.5 capitalize text-muted-foreground">{p.confidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {/* 8. Implementation roadmap */}
        <Section n="9" title="Implementation roadmap">
          <ol className="space-y-3">
            {s.implementation_roadmap.map((ph) => (
              <li key={ph.phase}>
                <p className="font-medium text-foreground">Phase {ph.phase}: {ph.title}</p>
                <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-muted-foreground">{ph.tasks.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </li>
            ))}
          </ol>
        </Section>

        {/* 9. Human approval points */}
        <Section n="10" title="Human approval points">
          <p className="text-muted-foreground">{s.human_approval_points.note}</p>
          {s.human_approval_points.points.length > 0 && (
            <ul className="mt-1 list-disc space-y-1 pl-5">{s.human_approval_points.points.map((pt, i) => <li key={i}>{pt}</li>)}</ul>
          )}
        </Section>

        {/* 10. Security notes */}
        <Section n="11" title="Security notes">
          <ul className="list-disc space-y-1 pl-5">{s.security_notes.map((note, i) => <li key={i}>{note.text}</li>)}</ul>
        </Section>

        {/* 11. Next steps */}
        <Section n="12" title="Next steps">
          <ol className="list-decimal space-y-1 pl-5">{s.next_steps.map((st, i) => <li key={i}>{st}</li>)}</ol>
        </Section>

        <footer className="mt-10 border-t border-border pt-4 text-center text-[10px] text-muted-foreground">
          Generated by Vyrade · Costs and risks reflect verified data where available; unknowns are shown, not guessed.
        </footer>
      </main>
    </div>
  );
}
