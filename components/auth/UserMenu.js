'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { track, resetAnalytics } from '@/lib/analytics/mixpanel';
import { EVENTS } from '@/lib/analytics/events';

// Compact signed-in identity + sign-out control for the app header.
export default function UserMenu({ user }) {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    track(EVENTS.SIGN_OUT_CLICKED);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* ignore — we redirect regardless */
    }
    // Clear the Mixpanel identity so the next user on this device is distinct.
    resetAnalytics();
    // Full navigation so server components re-evaluate the cleared session.
    window.location.assign('/login');
  }

  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-2 sm:flex">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary"
          title={user?.email}
        >
          {initial}
        </span>
        <span className="max-w-[140px] truncate text-[13px] text-muted-foreground">
          {user?.name || user?.email}
        </span>
      </div>
      <Button variant="ghost" size="sm" onClick={signOut} disabled={busy} className="gap-1.5" title="Sign out">
        <LogOut />
        <span className="hidden md:inline">{busy ? 'Signing out…' : 'Sign out'}</span>
      </Button>
    </div>
  );
}
