import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';

// Admin dashboard gate (milestone 3.2). Server-side and authoritative: the edge
// middleware only guarantees a signed-in user reaches here; THIS decides admin.
// A non-admin gets a 404 (notFound) rather than a 403 — the admin area doesn't
// advertise its existence to ordinary users.
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.isAdmin) notFound();
  return <section className="min-h-screen bg-background">{children}</section>;
}
