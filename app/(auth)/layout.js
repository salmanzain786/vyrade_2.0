import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';

// Auth screens are for signed-out visitors. If a session already exists, skip
// straight to the app. The root layout keeps <body> at overflow-hidden for the
// full-screen chat, so give these pages their own scroll container.
export const dynamic = 'force-dynamic';

export default async function AuthLayout({ children }) {
  const user = await getCurrentUser();
  if (user) redirect('/');

  return <div className="h-screen overflow-y-auto">{children}</div>;
}
