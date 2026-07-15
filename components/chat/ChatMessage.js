'use client';

import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VyradeMark } from '@/components/VyradeLogo';

/**
 * One chat message. User → right-aligned bubble; Vyrade (agent) and system →
 * left with an avatar, laid out identically. Agent shows the brand mark; system
 * shows a system icon and slightly muted text.
 */
export default function ChatMessage({ role, content, streaming }) {
  if (role === 'user') {
    return (
      <div className="flex justify-end px-4 py-2 animate-fade-in">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-secondary px-4 py-2.5 text-[15px] leading-relaxed text-secondary-foreground whitespace-pre-wrap">
          {content}
        </div>
      </div>
    );
  }

  const isSystem = role === 'system';

  return (
    <div className="flex gap-3 px-4 py-2 animate-fade-in">
      <div
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          isSystem ? 'bg-muted text-muted-foreground' : 'bg-blue-600/15'
        )}
      >
        {isSystem ? <Info className="h-4 w-4" /> : <VyradeMark className="h-4 w-auto" />}
      </div>
      <div
        className={cn(
          'min-w-0 flex-1 pt-0.5 text-[15px] leading-relaxed whitespace-pre-wrap',
          isSystem ? 'text-muted-foreground' : 'text-foreground'
        )}
      >
        {content}
        {streaming && (
          <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-caret-blink bg-foreground align-middle" />
        )}
      </div>
    </div>
  );
}
