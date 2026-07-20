'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, Check, Download, Eye, Code2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Embeds the official n8n canvas for a generated workflow using the
 * `@n8n_io/n8n-demo-component` web component (an interactive n8n preview),
 * with a preview/code toggle and copy/download — same approach as
 * chat-vyrade-ai-next-all.
 */
export default function N8nWorkflow({ workflow, height = '100%' }) {
  const containerRef = useRef(null);
  const [viewMode, setViewMode] = useState('preview'); // preview | code
  const [copied, setCopied] = useState(false);

  const jsonText = workflow ? JSON.stringify(workflow, null, 2) : '';

  // Load the web component once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { await import('@n8n_io/n8n-demo-component'); } catch { /* offline: preview unavailable */ }
    })();
    // Silence noisy internal n8n preview errors.
    const orig = console.error;
    console.error = (...args) => {
      const s = args.join(' ');
      if (/n8n-preview-service|dynamic-node-parameters|resource-mapper-fields|schemas\/n8n-nodes/.test(s)) return;
      orig.apply(console, args);
    };
    return () => { console.error = orig; cancelled = true; };
  }, []);

  // (Re)mount the <n8n-demo> element whenever the workflow or view changes.
  useEffect(() => {
    if (viewMode !== 'preview' || !containerRef.current || !workflow) return;
    const el = containerRef.current;
    el.innerHTML = '';
    const theme = typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    const timer = setTimeout(() => {
      try {
        const demo = document.createElement('n8n-demo');
        demo.setAttribute('workflow', JSON.stringify(workflow));
        demo.setAttribute('frame', 'true');
        demo.setAttribute('theme', theme);
        el.appendChild(demo);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [workflow, viewMode]);

  function handleDownload() {
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow?.name || 'workflow'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked */ }
  }

  const nodeCount = Array.isArray(workflow?.nodes) ? workflow.nodes.length : 0;
  // 'verified' | 'failed' | 'skipped' (no test instance configured)
  const importCheck = workflow?.meta?.import_check;

  return (
    <div style={{ height }} className="flex flex-col overflow-hidden bg-sidebar">
      <style>{`
        n8n-demo {
          --n8n-frame-background-color: #171717;
          --n8n-json-background-color: #171717;
          --n8n-workflow-min-height: 100%;
          --n8n-iframe-border-radius: 0px;
          --n8n-iframe-padding: 0px;
          display: block;
          width: 100%;
          height: 100%;
        }
        .embedded_tip { display: none !important; }
      `}</style>

      {/* Toolbar */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <div className="flex items-center gap-1 rounded-lg bg-secondary p-0.5">
          <button
            onClick={() => setViewMode('preview')}
            className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              viewMode === 'preview' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            <Eye className="h-3.5 w-3.5" /> Preview
          </button>
          <button
            onClick={() => setViewMode('code')}
            className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              viewMode === 'code' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            <Code2 className="h-3.5 w-3.5" /> JSON
          </button>
          <span className="px-2 text-xs text-muted-foreground">{nodeCount} nodes</span>
        </div>

        {/* Did a real n8n instance accept this import? */}
        {importCheck === 'verified' && (
          <span
            title="A real n8n instance accepted this workflow on import"
            className="hidden items-center gap-1.5 rounded-md bg-green-500/10 px-2 py-1 text-xs font-medium text-green-500 sm:inline-flex"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Import verified
          </span>
        )}
        {importCheck === 'failed' && (
          <span
            title={workflow?.meta?.import_error || 'n8n rejected this workflow on import'}
            className="hidden items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-500 sm:inline-flex"
          >
            <ShieldAlert className="h-3.5 w-3.5" /> Import unverified
          </span>
        )}

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
          </Button>
          <Button size="sm" onClick={handleDownload} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Download JSON</span>
          </Button>
        </div>
      </div>

      {/* Body */}
      {viewMode === 'preview' ? (
        <div ref={containerRef} className="relative w-full flex-1 min-h-0" />
      ) : (
        <pre className="scrollbar-thin flex-1 min-h-0 overflow-auto bg-[#171717] p-6 font-mono text-xs leading-relaxed text-foreground">
          {jsonText}
        </pre>
      )}
    </div>
  );
}
