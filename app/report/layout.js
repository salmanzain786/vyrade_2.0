import { getCurrentUser } from '@/lib/auth/session';
import AppShellRail from '@/components/shell/AppShellRail';

// Shared chrome for Blueprint report pages — same centralised rail and content
// surface as the rest of the app (the rail hides itself when printing).
export default async function ReportLayout({ children }) {
  const user = await getCurrentUser();
  return <AppShellRail user={user}>{children}</AppShellRail>;
}
