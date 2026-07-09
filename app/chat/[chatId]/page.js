import ChatWorkspace from '@/components/ChatWorkspace';

export const dynamic = 'force-dynamic';

export default function ChatPage({ params }) {
  // `key` remounts the workspace when the chat id changes, so switching chats
  // starts from clean state instead of leaking the previous conversation's.
  return <ChatWorkspace key={params.chatId} sessionId={params.chatId} />;
}
