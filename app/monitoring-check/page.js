import { notFound } from 'next/navigation';
import MonitoringCheck from '@/components/MonitoringCheck';

// Verification harness page (milestone 1.7). Always available in dev; in
// production it 404s unless MONITORING_CHECK_ENABLED=1 — so it can't be abused
// to spray errors at your live Sentry project.
export const dynamic = 'force-dynamic';

const ENABLED = process.env.NODE_ENV !== 'production' || process.env.MONITORING_CHECK_ENABLED === '1';

export default function MonitoringCheckPage() {
  if (!ENABLED) notFound();
  return <MonitoringCheck />;
}
