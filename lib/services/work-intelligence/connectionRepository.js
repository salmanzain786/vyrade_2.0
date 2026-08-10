/**
 * Platform connection persistence (Work Intelligence, Phase 1.1/1.3/1.4).
 * Tokens are encrypted at rest; scope + governance configs are normalized on the
 * way in and out. A user has one ACTIVE connection per platform.
 */
import { randomUUID } from 'crypto';
import { pool } from '../../config/db.js';
import { encryptToken, decryptToken } from './tokenCrypto.js';
import { normalizeScope } from './scope.js';
import { normalizeGovernance } from './governance.js';

const parse = (x) => { try { return typeof x === 'string' ? JSON.parse(x) : x; } catch { return null; } };

// Public shape — NEVER includes the encrypted tokens (kept under a private key).
function shape(row) {
  return {
    id: row.id, user_id: row.user_id, org_id: row.org_id, platform: row.platform,
    external_account_id: row.external_account_id, account_name: row.account_name,
    status: row.status, token_expires_at: row.token_expires_at,
    scope: normalizeScope(parse(row.scope_config) || {}),
    governance: normalizeGovernance(parse(row.governance_config) || {}),
    connected_at: row.connected_at,
    _enc: { access: row.access_token_enc, refresh: row.refresh_token_enc }, // server-only
  };
}

export async function createConnection({ userId, orgId = null, platform, account = {}, tokens = {} }) {
  // Enforce one active connection per user+platform.
  await pool.query("UPDATE platform_connections SET status='revoked', revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND platform=? AND status='active'", [userId, platform]);
  const id = randomUUID();
  await pool.query(
    `INSERT INTO platform_connections
       (id, user_id, org_id, platform, external_account_id, account_name, access_token_enc, refresh_token_enc, token_expires_at, scope_config, governance_config)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, userId, orgId, platform, account.external_account_id || null, account.account_name || null,
      encryptToken(tokens.accessToken), encryptToken(tokens.refreshToken), tokens.expiresAt || null,
      JSON.stringify(normalizeScope({})), JSON.stringify(normalizeGovernance({}))]
  );
  return getConnection(id);
}

export async function getConnection(id) {
  const [[row]] = await pool.query('SELECT * FROM platform_connections WHERE id = ? LIMIT 1', [id]);
  return row ? shape(row) : null;
}

export async function getActiveConnection(userId, platform) {
  const [[row]] = await pool.query("SELECT * FROM platform_connections WHERE user_id=? AND platform=? AND status='active' ORDER BY connected_at DESC LIMIT 1", [userId, platform]);
  return row ? shape(row) : null;
}

export async function listConnections(userId) {
  const [rows] = await pool.query("SELECT * FROM platform_connections WHERE user_id=? AND status='active' ORDER BY connected_at DESC", [userId]);
  return rows.map(shape);
}

/** Decrypt the access token for a connection — only where a connector needs it. */
export function accessTokenOf(connection) {
  return connection?._enc?.access ? decryptToken(connection._enc.access) : null;
}

export async function setScope(id, scope) {
  await pool.query('UPDATE platform_connections SET scope_config = ? WHERE id = ?', [JSON.stringify(normalizeScope(scope)), id]);
  return getConnection(id);
}
export async function setGovernance(id, governance) {
  await pool.query('UPDATE platform_connections SET governance_config = ? WHERE id = ?', [JSON.stringify(normalizeGovernance(governance)), id]);
  return getConnection(id);
}

export async function revokeConnection(id) {
  // Drop the tokens on revoke — they must not persist after disconnect.
  await pool.query("UPDATE platform_connections SET status='revoked', revoked_at=CURRENT_TIMESTAMP, access_token_enc=NULL, refresh_token_enc=NULL WHERE id=?", [id]);
}

/** Strip the server-only encrypted blob before sending to a client. */
export const toPublic = (c) => { if (!c) return null; const { _enc, ...rest } = c; return rest; };

export default { createConnection, getConnection, getActiveConnection, listConnections, accessTokenOf, setScope, setGovernance, revokeConnection, toPublic };
