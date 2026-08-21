'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import AppSidebar from '@/components/shell/AppSidebar';

function newId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Shared app chrome for non-chat pages (dashboard, organisation): the same
// centralised icon rail used across the app, plus the padded content area.
export default function AppShellRail({ user, children }) {
  const router = useRouter();
  const [conversations, setConversations] = React.useState([]);

  React.useEffect(() => {
    let alive = true;
    fetch('/api/conversations')
      .then((r) => (r.ok ? r.json() : { conversations: [] }))
      .then((d) => { if (alive) setConversations(d.conversations || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <>
      <AppSidebar
        user={user}
        conversations={conversations}
        currentSessionId={undefined}
        onNewChat={() => router.push(`/chat/${newId()}`)}
        onSelect={(sid) => router.push(`/chat/${sid}`)}
      />
      {/* Content area #171717 (bg-sidebar). Cards nudged one step lighter so
          they keep their depth against the content surface. */}
      <div className="min-h-screen bg-sidebar pb-16 sm:ml-16 sm:pb-0 print:ml-0 print:bg-transparent print:pb-0" style={{ '--card': '0.245 0 0' }}>{children}</div>
    </>
  );
}
