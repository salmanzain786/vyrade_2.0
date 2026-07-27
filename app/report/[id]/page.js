import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { assertBlueprintOwner } from '@/lib/auth/ownership';
import { getLatest } from '@/lib/services/blueprintRepository.js';
import { generateBlueprintReport } from '@/lib/services/report/blueprintReport.js';
import { VyradeMark } from '@/components/VyradeLogo';
import PrintButton from '@/components/report/PrintButton';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const RISK = {
  high: 'bg-red-500/10 text-red-500 border-red-500/20',
  medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  low: 'bg-green-500/10 text-green-500 border-green-500/20',
};
const money = (n, c = 'USD') => (n == null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: c, maximumFractionDigits: n < 1 && n !== 0 ? 4 : 2 }).format(n));

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border print:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
          <Link href={`/chat/${record.session_id || ''}`} className="flex items-center gap-2">
            <VyradeMark className="h-6 w-auto" /><span className="text-sm font-semibold">Vyrade</span>
          </Link>
          <PrintButton />
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

        {/* 1. Business problem */}
        <Section n="1" title="Business problem">
          <p>{s.business_problem.summary}</p>
        </Section>

        {/* 2. Current manual process */}
        <Section n="2" title="Current manual process">
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
