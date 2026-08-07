import { NextResponse } from 'next/server';
import { resolveToken, recordExecutionEvent } from '@/lib/services/telemetry/telemetryRepository';

export const dynamic = 'force-dynamic';

// Execution telemetry ingestion (Phase 4.1). Authenticated by an INGESTION TOKEN
// (not a user session), so a platform instance can post directly.
//   Header: x-telemetry-token: <token>   (or Authorization: Bearer <token>)
//   Body:   a single event, or { events: [...] }
//   Event:  { blueprint_id?, external_workflow_id?, status, duration_ms?,
//             error?/error_category?, human_intervention?, occurred_at?, platform? }
const MAX_BATCH = 200;

function readToken(request) {
  const h = request.headers;
  const direct = h.get('x-telemetry-token');
  if (direct) return direct.trim();
  const auth = h.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export async function POST(request) {
  const token = readToken(request);
  const resolved = token ? await resolveToken(token).catch(() => null) : null;
  if (!resolved) return NextResponse.json({ error: 'Invalid or missing telemetry token' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const events = Array.isArray(body?.events) ? body.events : (body && typeof body === 'object' && body.status ? [body] : []);
  if (!events.length) return NextResponse.json({ error: 'No events. Send a single event object or { events: [...] }.' }, { status: 400 });
  if (events.length > MAX_BATCH) return NextResponse.json({ error: `Too many events (max ${MAX_BATCH} per request)` }, { status: 413 });

  let recorded = 0;
  for (const e of events) {
    try {
      await recordExecutionEvent({
        userId: resolved.userId,
        blueprintId: e.blueprint_id || null,
        platform: e.platform || 'n8n',
        externalWorkflowId: e.external_workflow_id || e.workflow_id || e.workflow_name || null,
        status: e.status,
        durationMs: e.duration_ms ?? e.execution_time_ms ?? null,
        rawError: e.error || e.error_message || null,      // categorised then discarded
        errorCategory: e.error_category || null,
        humanIntervention: e.human_intervention === true || e.human_intervention === 1,
        occurredAt: e.occurred_at || e.finished_at || null,
      });
      recorded += 1;
    } catch { /* skip a bad event, keep the batch going */ }
  }
  return NextResponse.json({ ok: true, recorded });
}
