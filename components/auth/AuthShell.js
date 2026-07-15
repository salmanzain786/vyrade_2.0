'use client';

import Link from 'next/link';
import { VyradeMark } from '@/components/VyradeLogo';

/**
 * Auth frame — matches chat-vyrade-ai-next-all's auth screens: full-screen dark
 * (#0f0f10), centered narrow column, node mark + "Vyrade.ai", then the form.
 */
export default function AuthShell({ title, subtitle, children, footer, error, notice }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#0f0f10] text-white">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2">
            <VyradeMark className="h-11 w-auto" />
            <div className="text-2xl font-medium">Vyrade.ai</div>
          </div>

          <div>
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold mb-1">{title}</h2>
              {subtitle && <p className="text-sm text-white/50">{subtitle}</p>}
            </div>

            {error && (
              <div role="alert" className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}
            {notice && (
              <div className="mb-4 rounded-xl border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">
                {notice}
              </div>
            )}

            {children}
          </div>

          {footer && <div className="text-center text-sm text-white/60">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

export function Field({ label, htmlFor, children, hint }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={htmlFor} className="text-sm font-medium text-white/80">{label}</label>
      )}
      {children}
      {hint && <p className="text-xs text-white/40">{hint}</p>}
    </div>
  );
}

// Reference-styled dark input.
export function AuthInput({ className = '', ...props }) {
  return (
    <input
      className={
        'w-full px-3 py-3 rounded-xl text-sm bg-[#29292B] border border-[#383839] text-white ' +
        'placeholder-white/40 focus:outline-none focus:border-[#4a4a4c] focus:bg-[#383839] ' +
        className
      }
      {...props}
    />
  );
}

// Reference-styled blue submit button.
export function AuthButton({ children, loading, className = '', ...props }) {
  return (
    <button
      className={
        'w-full flex justify-center items-center bg-blue-700 hover:bg-blue-800 disabled:opacity-70 ' +
        'text-white px-3 py-3 rounded-xl font-bold transition-colors ' +
        className
      }
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : children}
    </button>
  );
}

export function AuthLink({ href, children }) {
  return (
    <Link href={href} className="font-medium text-white hover:underline">{children}</Link>
  );
}
