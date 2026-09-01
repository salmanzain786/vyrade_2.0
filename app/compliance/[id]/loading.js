import { Loader2, ShieldCheck } from 'lucide-react';

/**
 * Streamed as the Suspense shell while the compliance page runs its scan on the
 * server. Renders inside the shared shell (sidebar + content area), so it only
 * needs to fill the content region with a centred loading state.
 */
export default function ComplianceLoading() {
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center px-5 py-32 text-center">
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
        <ShieldCheck className="h-6 w-6" />
      </span>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Running governance &amp; compliance scan…
      </div>
    </div>
  );
}
