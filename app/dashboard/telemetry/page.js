import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { VyradeMark } from '@/components/VyradeLogo';
import TelemetrySetup from '@/components/telemetry/TelemetrySetup';

export const dynamic = 'force-dynamic';

export default async function TelemetryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Execution telemetry</h1>
      <p className="mt-1 text-sm text-muted-foreground">Connect your automation platform so Vyrade can replace estimates with measured run data — success rates, execution time, and real volume.</p>
      <div className="mt-6"><TelemetrySetup /></div>
    </main>
  );
}
