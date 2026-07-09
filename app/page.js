import { randomUUID } from 'crypto';
import { redirect } from 'next/navigation';

// A fresh id per request; the conversation row is only created in MySQL once
// the first message is sent, so visiting "/" costs nothing.
export const dynamic = 'force-dynamic';

export default function Home() {
  redirect(`/chat/${randomUUID()}`);
}
