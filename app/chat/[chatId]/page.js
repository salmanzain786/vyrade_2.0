import { redirect } from 'next/navigation';
import ChatWorkspace from '@/components/ChatWorkspace';
import ErrorBoundary from '@/components/ErrorBoundary';
import { getCurrentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function ChatPage({ params }) {
  // Real auth boundary (middleware only does a coarse presence check).
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // `key` remounts the workspace when the chat id changes, so switching chats
  // starts from clean state instead of leaking the previous conversation's.
  // The boundary keeps a workspace crash from white-screening the whole app.
  return (
    <ErrorBoundary name="chat-workspace">
      <ChatWorkspace key={params.chatId} sessionId={params.chatId} user={user} />
    </ErrorBoundary>
  );
}
