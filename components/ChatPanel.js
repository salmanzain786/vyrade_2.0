'use client';

import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import Composer from './Composer';
import { VyradeMark } from '@/components/VyradeLogo';
import { Skeleton } from '@/components/ui/skeleton';

export default function ChatPanel({ messages, onSend, disabled, composerPlaceholder, thinking, loading }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  return (
    <div className="flex min-h-0 flex-col border-r border-border">
      <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-6">
        {loading && (
          <div className="space-y-5">
            <Skeleton className="h-16 w-[70%]" />
            <Skeleton className="ml-auto h-10 w-[45%]" />
            <Skeleton className="h-20 w-[75%]" />
          </div>
        )}

        {!loading && messages.length === 0 && !thinking && (
          <div className="mx-auto mt-16 max-w-md text-center">
            <VyradeMark className="mx-auto mb-5 h-9 w-auto" />
            <p className="text-[15px] font-medium text-foreground">
              Describe the automation you want to build.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Vyrade will ask what it needs to know, then draft a structured
              blueprint on the right as the picture becomes clear.
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} role={m.role} content={m.content} pending={m.pending} streaming={m.streaming} />
        ))}

        {thinking && <MessageBubble role="agent" pending />}
      </div>

      <Composer onSend={onSend} disabled={disabled} placeholder={composerPlaceholder} />
    </div>
  );
}
