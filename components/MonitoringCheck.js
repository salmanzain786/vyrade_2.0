'use client';

/**
 * Monitoring verification harness (milestone 1.7).
 *
 * Three deliberate errors, one per layer, so a real end-to-end pass can confirm
 * each reaches Sentry with the expected context:
 *   1. Client component that throws DURING RENDER inside an ErrorBoundary
 *      → boundary catches it, shows the fallback, reports to Sentry.
 *   2. Client component that throws during render OUTSIDE any boundary
 *      → the app's error fallback (global-error) + Sentry.
 *   3. A server API route (withAuth) that throws
 *      → captured with route + method + user id, NO request body / PII.
 *
 * Only reachable when MONITORING_CHECK_ENABLED=1 (see the page + route gate).
 * Note: React error boundaries only catch RENDER errors, not event handlers —
 * so each button flips state and a child throws on the next render.
 */
import { useState } from 'react';
import ErrorBoundary from './ErrorBoundary';

function Bomb({ armed, label }) {
  if (armed) throw new Error(`[monitoring-check] ${label}`);
  return null;
}

export default function MonitoringCheck() {
  const [boundaryArmed, setBoundaryArmed] = useState(false);
  const [globalArmed, setGlobalArmed] = useState(false);
  const [serverStatus, setServerStatus] = useState('');

  async function triggerServer() {
    setServerStatus('calling…');
    try {
      const res = await fetch('/api/monitoring-check?trigger=server');
      setServerStatus(`API responded ${res.status} (expect 500). Now check Sentry → Issues for "MonitoringCheckError" with route + your user id.`);
    } catch (e) {
      setServerStatus(`fetch failed: ${e.message}`);
    }
  }

  const box = 'rounded-lg border p-4';
  const btn = 'mt-3 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent';

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold">Monitoring verification (Sentry)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Trigger each layer, then confirm the event in Sentry → Issues with the expected
          context and <strong>no PII</strong>. Requires reporting enabled
          (production, or SENTRY_ENABLE_DEV=1 in dev).
        </p>
      </div>

      {/* 1. Client render error INSIDE a boundary */}
      <section className={box}>
        <h2 className="font-medium">1. Client component (inside ErrorBoundary)</h2>
        <p className="text-sm text-muted-foreground">Expect: the fallback below replaces this region, and a client event tagged <code>boundary: monitoring-check</code> appears.</p>
        <ErrorBoundary name="monitoring-check">
          <Bomb armed={boundaryArmed} label="client boundary test error" />
          <button className={btn} onClick={() => setBoundaryArmed(true)}>Throw inside boundary</button>
        </ErrorBoundary>
      </section>

      {/* 2. Client render error OUTSIDE any boundary → global fallback */}
      <section className={box}>
        <h2 className="font-medium">2. Global fallback (uncaught render error)</h2>
        <p className="text-sm text-muted-foreground">Expect: the app-level error screen, and the exception in Sentry.</p>
        <button className={btn} onClick={() => setGlobalArmed(true)}>Throw uncaught</button>
        <Bomb armed={globalArmed} label="global fallback test error" />
      </section>

      {/* 3. Server API route via withAuth */}
      <section className={box}>
        <h2 className="font-medium">3. Server API route (withAuth)</h2>
        <p className="text-sm text-muted-foreground">Expect: a 500 issue with <code>route</code>, <code>http.method</code>, your user id — and no request body.</p>
        <button className={btn} onClick={triggerServer}>Call failing API</button>
        {serverStatus && <p className="mt-2 text-sm">{serverStatus}</p>}
      </section>
    </div>
  );
}
