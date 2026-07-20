/**
 * Real-import smoke test.
 *
 * Structural validation proves the JSON is well-formed; only n8n itself proves
 * it IMPORTS. This posts the generated workflow to a throwaway n8n instance,
 * captures the rejection message when it fails (so the model can repair against
 * the real error), and deletes the workflow again so the instance stays clean.
 *
 * Entirely optional: with no N8N_TEST_URL / N8N_TEST_API_KEY it reports
 * `skipped` and generation proceeds exactly as before.
 */

const TIMEOUT_MS = Number.parseInt(process.env.N8N_TEST_TIMEOUT_MS ?? '', 10) || 15000;

export function isImportVerifierConfigured() {
  return Boolean(process.env.N8N_TEST_URL && process.env.N8N_TEST_API_KEY);
}

const baseUrl = () => String(process.env.N8N_TEST_URL || '').replace(/\/+$/, '');

async function n8nFetch(path, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${baseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': process.env.N8N_TEST_API_KEY,
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * n8n's create endpoint rejects unknown top-level properties, so send only what
 * the API accepts. Our own `meta` (retrieval counts etc.) must not be posted.
 */
// Prefix so a smoke-test workflow is unmistakable on a shared instance — if a
// cleanup DELETE ever fails, the leftover is trivially identifiable/greppable.
export const SMOKE_TEST_PREFIX = '[vyrade-smoke-test]';

function importPayload(workflow) {
  return {
    name: `${SMOKE_TEST_PREFIX} ${String(workflow?.name || 'import check')}`.slice(0, 128),
    nodes: workflow?.nodes || [],
    connections: workflow?.connections || {},
    settings: workflow?.settings && typeof workflow.settings === 'object' ? workflow.settings : {},
  };
}

/** Pull the most useful message out of an n8n error body. */
function errorMessage(status, body) {
  const detail =
    (body && (body.message || body.error || body.hint)) ||
    (typeof body === 'string' ? body : '') ||
    `HTTP ${status}`;
  return String(detail).slice(0, 500);
}

/**
 * Try to import `workflow` into the test instance.
 * @returns {Promise<{ok:boolean, skipped?:boolean, error?:string, status?:number, cleanedUp?:boolean}>}
 *          Never throws — a verifier outage must not fail generation.
 */
export async function verifyN8nImport(workflow) {
  if (!isImportVerifierConfigured()) return { ok: true, skipped: true };

  let created;
  try {
    const res = await n8nFetch('/api/v1/workflows', {
      method: 'POST',
      body: JSON.stringify(importPayload(workflow)),
    });

    let body = null;
    try { body = await res.json(); } catch { /* non-JSON error page */ }

    if (!res.ok) {
      return { ok: false, status: res.status, error: errorMessage(res.status, body) };
    }
    created = body?.id ?? body?.data?.id ?? null;
    return { ok: true, status: res.status, cleanedUp: await cleanup(created) };
  } catch (err) {
    // Network failure / timeout / instance down — treat as "couldn't verify"
    // rather than "workflow is bad", so a flaky test box can't block a user.
    const reason = err?.name === 'AbortError' ? `timed out after ${TIMEOUT_MS}ms` : err?.message;
    console.warn('[n8n-verify] could not reach the test instance:', reason);
    return { ok: true, skipped: true, error: reason };
  }
}

/** Remove the smoke-test workflow so the instance doesn't accumulate junk. */
async function cleanup(id) {
  if (!id) return false;
  try {
    const res = await n8nFetch(`/api/v1/workflows/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    console.warn(`[n8n-verify] could not delete smoke-test workflow ${id}`);
    return false;
  }
}
