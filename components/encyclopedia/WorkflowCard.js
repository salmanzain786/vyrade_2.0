import Link from 'next/link';
import { cn } from '@/lib/utils';

const TIER = {
  excellent: 'bg-green-500/10 text-green-500 border-green-500/20',
  good: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  fair: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  low: 'bg-muted text-muted-foreground border-border',
};

export default function WorkflowCard({ wf }) {
  return (
    <Link
      href={`/workflows/${wf.source_id}`}
      className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-all hover:border-blue-500/50 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-[13.5px] font-medium leading-snug text-foreground group-hover:text-blue-500">
          {wf.name}
        </h3>
        <span className={cn('shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium', TIER[wf.quality_tier] || TIER.low)}>
          {wf.quality_score}
        </span>
      </div>

      {wf.integrations?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {wf.integrations.slice(0, 4).map((a) => (
            <span key={a} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{a}</span>
          ))}
          {wf.integrations.length > 4 && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">+{wf.integrations.length - 4}</span>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 pt-1 text-[10.5px] text-muted-foreground">
        <span>{wf.category_label || wf.category}</span>
        <span aria-hidden>·</span>
        <span className="capitalize">{wf.complexity}</span>
        <span aria-hidden>·</span>
        <span>{wf.node_count} nodes</span>
      </div>
    </Link>
  );
}
