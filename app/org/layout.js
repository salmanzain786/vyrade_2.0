import { getCurrentUser } from '@/lib/auth/session';
import AppShellRail from '@/components/shell/AppShellRail';

// Shared chrome for the organisation dashboard (Phase 2 pages).
// Uses the same homepage icon rail across the app for a consistent shell.
export default async function OrgLayout({ children }) {
  const user = await getCurrentUser();
  return <AppShellRail user={user}>{children}</AppShellRail>;
}
