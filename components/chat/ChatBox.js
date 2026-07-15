'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Composer — matches chat-vyrade-ai-next-all's chat-box: a rounded card with an
 * auto-growing textarea and a round blue send button. n8n badge stands in for
 * the reference's multi-platform mode selector (Vyrade targets n8n).
 */
export default function ChatBox({
  value,
  onChange,
  onSubmit,
  loading = false,
  placeholder = 'What do you want to automate?',
  disclaimer = 'The more context you give, the better the blueprint we draft.',
  showModeBadge = true,
}) {
  const [rows, setRows] = useState(1);
  const canSend = !loading && value.trim().length > 0;

  useEffect(() => {
    if (!value) { setRows(1); return; }
    const lines = value.split('\n');
    let total = 0;
    const perRow = typeof window !== 'undefined' && window.innerWidth > 640 ? 80 : 50;
    lines.forEach((l) => { total += l.length === 0 ? 1 : Math.ceil(l.length / perRow); });
    setRows(Math.min(Math.max(total, 1), 6));
  }, [value]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSubmit();
    }
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (canSend) onSubmit(); }}
      className="w-full"
    >
      <div className="bg-white dark:bg-[#222224] border border-input hover:border-ring transition-all duration-300 rounded-2xl sm:rounded-3xl px-3 sm:px-4 py-3 sm:py-4 shadow-xl w-full max-w-full mx-auto relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          disabled={loading}
          autoComplete="off"
          className="w-full bg-transparent outline-none border-none text-foreground placeholder-muted-foreground text-sm sm:text-base resize-none overflow-y-auto scrollbar-thin mb-5 disabled:opacity-50 disabled:cursor-not-allowed"
        />

        <div className="flex flex-wrap items-center justify-between gap-y-2">
          {showModeBadge ? (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-secondary text-xs font-medium text-muted-foreground">
              <img src="/n8n.svg" alt="n8n" className="h-4 w-4" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              <span>n8n</span>
            </div>
          ) : <span />}

          <Button
            type="submit"
            size="icon"
            disabled={!canSend}
            className={`h-8 w-8 rounded-full text-white transition-all ${
              canSend ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600/60 cursor-not-allowed'
            }`}
          >
            {loading ? (
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <ArrowUp className="h-4 w-4 text-white" />
            )}
          </Button>
        </div>
      </div>

      {disclaimer && (
        <div className="text-center text-muted-foreground text-sm tracking-wide pt-4">{disclaimer}</div>
      )}
    </form>
  );
}
