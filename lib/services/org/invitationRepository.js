/**
 * Org invitations (Phase 2.2). Invite-by-email → the invitee accepts via a
 * tokened link, which adds their org_members row. Email delivery is best-effort;
 * the accept link is always returned so an admin can share it directly.
 */
import { randomUUID, randomBytes } from 'crypto';
import { pool } from '../../config/db.js';
import { isOrgRole } from './access.js';
import { addMember, getMembership } from './membershipRepository.js';

const INVITE_TTL_DAYS = 7;

export async function createInvitation({ orgId, email, role = 'member', department = null, invitedBy = null }) {
  if (!email) throw new Error('email is required');
  if (!isOrgRole(role)) throw new Error(`Invalid org role "${role}"`);
  const id = randomUUID();
  const token = randomBytes(32).toString('hex'); // 64 hex chars
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400_000);
  await pool.query(
    `INSERT INTO org_invitations (id, org_id, email, role, department, token, invited_by, expires_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, orgId, String(email).toLowerCase().trim(), role, department, token, invitedBy, expiresAt]
  );
  return { id, token, email, role, department, expires_at: expiresAt };
}

/** Accept a pending, unexpired invite → join the org. Idempotent-ish (a used token can't be reused). */
export async function acceptInvitation({ token, userId }) {
  const [[inv]] = await pool.query('SELECT * FROM org_invitations WHERE token = ? LIMIT 1', [token]);
  if (!inv) throw new Error('Invitation not found');
  if (inv.status !== 'pending') throw new Error('This invitation has already been used or revoked');
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) throw new Error('This invitation has expired');

  const existing = await getMembership(userId);
  if (existing && existing.org_id !== inv.org_id) throw new Error('You already belong to another organisation');

  await addMember({ orgId: inv.org_id, userId, role: inv.role, department: inv.department });
  await pool.query('UPDATE org_invitations SET status = ? WHERE id = ?', ['accepted', inv.id]);
  return { org_id: inv.org_id, role: inv.role, department: inv.department };
}

export async function listInvitations(orgId, { status = 'pending' } = {}) {
  const [rows] = await pool.query(
    'SELECT id, email, role, department, status, expires_at, created_at FROM org_invitations WHERE org_id = ? AND status = ? ORDER BY created_at DESC',
    [orgId, status]
  );
  return rows;
}

export async function revokeInvitation({ orgId, id }) {
  await pool.query('UPDATE org_invitations SET status = ? WHERE id = ? AND org_id = ? AND status = ?', ['revoked', id, orgId, 'pending']);
}

export default { createInvitation, acceptInvitation, listInvitations, revokeInvitation };
