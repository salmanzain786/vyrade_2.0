'use client';

/**
 * Boots Mixpanel once for the whole app and emits a "Page Viewed" event on
 * every client-side route change. Mounted high in the tree (root layout) so it
 * covers auth pages (anonymous) and the app (identified) alike.
 *
 * User identity is attached separately, where the user object is actually known
 * (see ChatWorkspace → identifyUser). This provider stays user-agnostic.
 */
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { initAnalytics, trackPageView } from './mixpanel';

// Collapse the per-chat UUID so the funnel groups all chats under one route
// instead of exploding into thousands of unique page paths.
function normalizePath(pathname) {
  if (!pathname) return '/';
  return pathname
    .replace(/\/chat\/[^/]+$/, '/chat/[id]')
    .replace(/\/reset-password\/[^/]+$/, '/reset-password/[token]');
}

export default function AnalyticsProvider() {
  const pathname = usePathname();
  const lastPath = useRef(null);

  useEffect(() => { initAnalytics(); }, []);

  useEffect(() => {
    const normalized = normalizePath(pathname);
    // Guard against duplicate fires (StrictMode, same-path re-renders).
    if (lastPath.current === normalized) return;
    lastPath.current = normalized;
    trackPageView(normalized, { raw_path: pathname });
  }, [pathname]);

  return null;
}
