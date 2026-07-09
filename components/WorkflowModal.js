'use client';

import { Download, Check, Copy } from 'lucide-react';
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function WorkflowModal({ workflow, onClose }) {
  const [copied, setCopied] = useState(false);
  if (!workflow) return null;

  const jsonText = JSON.stringify(workflow, null, 2);
  const nodeCount = Array.isArray(workflow.nodes) ? workflow.nodes.length : 0;

  function handleDownload() {
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow.name || 'workflow'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — download still works */
    }
  }

  return (
    <Dialog open={!!workflow} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl gap-3">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm tracking-[0.1em]">WORKFLOW OUTPUT</DialogTitle>
          <DialogDescription className="flex items-center gap-2 pt-1">
            <Badge variant="default">n8n</Badge>
            <Badge variant="outline">{nodeCount} nodes</Badge>
            {workflow.meta?.retrieved_doc_count != null && (
              <Badge variant="outline">{workflow.meta.retrieved_doc_count} docs retrieved</Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <pre className="scrollbar-thin max-h-[55vh] overflow-auto rounded-md border border-border bg-muted p-4 font-mono text-xs leading-relaxed text-foreground">
          {jsonText}
        </pre>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button onClick={handleDownload}>
            <Download className="h-4 w-4" />
            Download JSON
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
