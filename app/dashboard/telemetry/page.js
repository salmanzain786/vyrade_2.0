import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Activity, Plug, ShieldCheck } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import TelemetrySetup from '@/components/telemetry/TelemetrySetup';

export const dynamic = 'force-dynamic';

const STEPS = [
  { title: 'Create a token', text: 'Generate an ingestion token below — shown once.' },
  { title: 'Wire it up', text: 'Add an HTTP request to your workflow that POSTs each run.' },
  { title: 'See measured data', text: 'Success rates, run volume and time replace estimates.' },
];

export default async function TelemetryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="w-full px-4 py-6 md:px-6 lg:px-8">
      <Link href="/dashboard" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
      </Link>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-blue-600/10 via-card to-card p-6 md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative">
          <Badge variant="outline" className="mb-3 gap-1.5 border-blue-500/30 bg-blue-500/5 text-blue-600 dark:text-blue-400">
            <Activity className="h-3 w-3" /> Telemetry
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Execution telemetry</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">Connect your automation platform so Vyrade can replace estimates with measured run data — success rates, execution time, and real volume.</p>
        </div>
      </div>

      {/* Content */}
      <div className="mt-6 grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* Info panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-start gap-3 space-y-0">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400"><Plug className="h-5 w-5" /></span>
              <div>
                <CardTitle className="text-base">How it works</CardTitle>
                <CardDescription className="mt-1 text-xs">Three steps to measured data.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ol className="space-y-1">
                {STEPS.map((st, i) => (
                  <li key={st.title} className="relative flex items-start gap-3 pb-4 last:pb-0">
                    {i < STEPS.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px bg-border" />}
                    <span className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-500/10 text-sm font-bold text-blue-600 dark:text-blue-400">{i + 1}</span>
                    <div className="pt-1">
                      <div className="text-sm font-medium">{st.title}</div>
                      <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{st.text}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs leading-relaxed text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Privacy-first: only status, duration, a coarse error category and an intervention flag are stored — never payloads or raw messages.</span>
          </div>
        </div>

        {/* Setup */}
        <div><TelemetrySetup /></div>
      </div>
    </div>
  );
}
