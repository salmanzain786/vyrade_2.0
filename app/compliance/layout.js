import { getCurrentUser } from '@/lib/auth/session';
import AppShellRail from '@/components/shell/AppShellRail';

// Shared chrome for compliance / assurance pages — same centralised rail and
// content surface as the dashboard and organisation sections.
export default async function ComplianceLayout({ children }) {
  const user = await getCurrentUser();
  return <AppShellRail user={user}>{children}</AppShellRail>;
}
