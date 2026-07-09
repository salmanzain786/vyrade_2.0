import { cn } from '@/lib/utils';

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1.5 py-0.5" aria-label="Vyrade is thinking">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-dot-blink" />
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-dot-blink [animation-delay:0.18s]" />
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-dot-blink [animation-delay:0.36s]" />
    </span>
  );
}

export default function MessageBubble({ role, content, pending, streaming }) {
  const isUser = role === 'user';
  const isSystem = role === 'system';

  return (
    <div className={cn('mb-5 flex max-w-[80%] flex-col gap-1.5', isUser && 'ml-auto items-end')}>
      {!isUser && (
        <span className="px-0.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground">
          {isSystem ? 'SYSTEM' : 'VYRADE'}
        </span>
      )}

      <div
        className={cn(
          'whitespace-pre-wrap rounded-lg border px-3.5 py-3 text-[14.5px] leading-relaxed',
          !isUser && !isSystem && 'border-border bg-card text-card-foreground',
          isUser && 'border-primary/50 bg-primary/10 text-foreground',
          isSystem && 'border-dashed border-border bg-transparent font-mono text-[12.5px] text-muted-foreground',
          pending && 'text-muted-foreground'
        )}
      >
        {pending ? <TypingDots /> : content}
        {streaming && (
          <span className="ml-0.5 inline-block h-[1em] w-[7px] translate-y-[2px] bg-primary animate-caret-blink" />
        )}
      </div>

      {isUser && (
        <span className="px-0.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground">YOU</span>
      )}
    </div>
  );
}
