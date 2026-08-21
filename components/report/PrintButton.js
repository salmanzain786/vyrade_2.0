'use client';

import { Printer } from 'lucide-react';

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-100 print:hidden"
    >
      <Printer className="h-4 w-4" /> Print / Save PDF
    </button>
  );
}
