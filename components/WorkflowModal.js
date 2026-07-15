'use client';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import N8nWorkflow from '@/components/chat/N8nWorkflow';

/**
 * Full-width modal showing the generated workflow embedded as an interactive
 * n8n canvas (with a JSON view + copy/download inside).
 */
export default function WorkflowModal({ workflow, onClose }) {
  if (!workflow) return null;

  return (
    <Dialog open={!!workflow} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="!flex flex-col max-w-none w-[98vw] h-[95vh] p-0 gap-0 overflow-hidden border-border bg-sidebar sm:rounded-xl">
        <DialogTitle className="sr-only">{workflow.name || 'Generated n8n workflow'}</DialogTitle>
        <N8nWorkflow workflow={workflow} height="100%" />
      </DialogContent>
    </Dialog>
  );
}
