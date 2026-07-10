import { randomUUID } from 'crypto';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';

// A fresh id per request; the conversation row is only created in MySQL once
// the first message is sent, so visiting "/" costs nothing. Signed-out visitors
// are sent to the login screen (server-side enforcement, not just middleware).
export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  redirect(`/chat/${randomUUID()}`);
}
