/**
 * n8n import smoke test (pre-beta gate #6).
 *
 * Reports whether the n8n import verifier is configured, and — if it is —
 * imports a tiny throwaway workflow into the DISPOSABLE test instance and
 * deletes it again, proving connectivity + credentials without touching prod.
 *
 *   node scripts/n8n-smoke.js
 *
 * Two acceptable pre-beta outcomes:
 *   • DISABLED  — N8N_TEST_URL / N8N_TEST_API_KEY unset → verifier no-ops safely.
 *   • CONFIGURED + import OK against a disposable instance.
 * A CONFIGURED-but-failing instance exits non-zero so it can gate a release.
 */
import 'dotenv/config';
import { verifyN8nImport, isImportVerifierConfigured, SMOKE_TEST_PREFIX } from '../lib/services/n8nImportVerifier.js';

// A minimal, valid single-node workflow — enough to exercise import + cleanup.
const SAMPLE = {
  name: 'connectivity check',
  nodes: [{ parameters: {}, id: 'a1', name: 'Start', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [250, 300] }],
  connections: {},
  settings: {},
};

async function main() {
  if (!isImportVerifierConfigured()) {
    console.log('● n8n smoke test: DISABLED (no N8N_TEST_URL / N8N_TEST_API_KEY).');
    console.log('  This is a safe, acceptable pre-beta state — generation never calls a live instance.');
    process.exit(0);
  }

  const target = String(process.env.N8N_TEST_URL).replace(/\/+$/, '');
  console.log(`● n8n smoke test: CONFIGURED → ${target}`);
  console.log(`  Importing a throwaway workflow ("${SMOKE_TEST_PREFIX} …") and cleaning it up…`);

  const result = await verifyN8nImport(SAMPLE);

  if (result.ok && result.skipped) {
    console.error(`✗ Could not reach the instance: ${result.error || 'unknown reason'}`);
    console.error('  Fix the disposable instance URL/key, or unset the vars to run DISABLED.');
    process.exit(1);
  }
  if (!result.ok) {
    console.error(`✗ Import REJECTED (HTTP ${result.status}): ${result.error}`);
    process.exit(1);
  }
  console.log(`✓ Import OK (HTTP ${result.status}); cleaned up: ${result.cleanedUp ? 'yes' : 'no (delete failed — check API key scope)'}`);
  process.exit(result.cleanedUp ? 0 : 1);
}

main().catch((err) => { console.error('n8n smoke test error:', err.message); process.exit(1); });
