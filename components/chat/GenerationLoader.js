'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VyradeMark } from '@/components/VyradeLogo';

/**
 * Staged loader for a long generation.
 *
 * We have no real progress events from the server, so stages advance on a
 * timer — but deliberately NEVER complete on their own: the loader parks on the
 * final stage until the request actually resolves. That way it narrates what is
 * happening without implying progress it can't measure.
 */
const STAGES = {
  n8n: [
    'Reading the Blueprint',
    'Retrieving similar workflows',
    'Loading n8n node knowledge',
    'Matching tool APIs',
    'Composing and wiring the graph',
    'Validating structure & verifying import',
  ],
  claude: [
    'Reading the Blueprint',
    'Selecting MCP connectors',
    'Writing the implementation package',
    'Sanitizing secrets & bundling',
  ],
  make: [
    'Reading the Blueprint',
    'Retrieving Make.com modules',
    'Mapping systems to modules',
    'Writing the implementation guide',
  ],
  zapier: [
    'Reading the Blueprint',
    'Retrieving Zapier apps',
    'Mapping systems to apps',
    'Writing the implementation guide',
  ],
};

const STAGE_MS = 2600;

export default function GenerationLoader({ platform = 'n8n', label }) {
  const stages = STAGES[platform] || STAGES.n8n;
  const [active, setActive] = useState(0);

  useEffect(() => {
    setActive(0);
    const id = setInterval(() => {
      // Park on the last stage — only the real response ends the loader.
      setActive((i) => (i < stages.length - 1 ? i + 1 : i));
    }, STAGE_MS);
    return () => clearInterval(id);
  }, [platform, stages.length]);

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      {/* Pulsing brand mark inside an expanding ring. */}
      <div className="relative flex h-20 w-20 items-center justify-center">
        <span className="absolute inline-flex h-16 w-16 animate-ping rounded-full bg-blue-500/20" />
        <span className="absolute h-20 w-20 rounded-full border border-blue-500/30" />
        <span className="absolute h-20 w-20 animate-spin rounded-full border-2 border-transparent border-t-blue-500" />
        <VyradeMark className="relative h-8 w-auto" />
      </div>

      <div className="text-center">
        <p className="text-base font-semibold text-foreground">{label || 'Building your automation…'}</p>
        <p className="mt-1 text-xs text-muted-foreground">This usually takes 20–60 seconds. Keep this open.</p>
      </div>

      <ol className="w-full max-w-sm space-y-2">
        {stages.map((s, i) => {
          const done = i < active;
          const current = i === active;
          return (
            <li
              key={s}
              className={cn(
                'flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px] transition-all duration-500',
                current && 'border-blue-500/40 bg-blue-500/5 text-foreground',
                done && 'border-transparent text-muted-foreground',
                !done && !current && 'border-transparent text-muted-foreground/50'
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                {done ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : current ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" />
                )}
              </span>
              <span className={cn(current && 'font-medium')}>{s}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
