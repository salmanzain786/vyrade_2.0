'use client';

import Link from 'next/link';
import { VyradeLogo } from '@/components/VyradeLogo';

/**
 * Centered card frame shared by every auth screen. Keeps the brand lockup,
 * heading, error/success banners, and footer link consistent across pages.
 */
export default function AuthShell({ title, subtitle, children, footer, error, notice }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <VyradeLogo className="h-6 w-auto text-foreground" />
          <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground">
            AUTOMATION BLUEPRINT
          </span>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-lg">
          <div className="mb-5">
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}
          {notice && (
            <div className="mb-4 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-foreground">
              {notice}
            </div>
          )}

          {children}
        </div>

        {footer && <p className="mt-5 text-center text-sm text-muted-foreground">{footer}</p>}
      </div>
    </div>
  );
}

export function Field({ label, htmlFor, children, hint }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function AuthLink({ href, children }) {
  return (
    <Link href={href} className="font-medium text-primary underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
