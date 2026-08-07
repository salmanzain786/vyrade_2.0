/**
 * Organisation membership (Phase 2.1). A user belongs to at most one org.
 * Additive: creating/joining an org never changes Blueprint ownership.
 */
import { randomUUID } from 'crypto';
import { pool } from '../../config/db.js';
import { CATALOG, DEPARTMENT_LABEL } from '../adoption/catalog.js';
import { isOrgRole } from './access.js';

/** The user's single membership (or null). */
export async function getMembership(userId) {
  const [[row]] = await pool.query(
    `SELECT m.org_id, m.role, m.department, o.name AS org_name, o.owner_user_id
       FROM org_members m JOIN organizations o ON o.id = m.org_id
      WHERE m.user_id = ? LIMIT 1`,
    [userId]
  );
  if (!row) return null;
  return { org_id: row.org_id, role: row.role, department: row.department, org_name: row.org_name, is_owner: row.owner_user_id === userId };
}

/** Create an org, seed its department roster from the catalog, add the owner. */
export async function createOrganization({ userId, name, department = null }) {
  const existing = await getMembership(userId);
  if (existing) throw new Error('You already belong to an organisation.');
  const orgId = randomUUID();
  await pool.query('INSERT INTO organizations (id, name, owner_user_id) VALUES (?,?,?)', [orgId, String(name || 'My organisation').slice(0, 160), userId]);

  // Seed the department roster from the catalog (excluding the 'general' bucket).
  const depts = Object.keys(CATALOG).filter((k) => k !== 'general');
  if (depts.length) {
    const values = depts.map(() => '(?,?,?,?)').join(',');
    const params = depts.flatMap((k) => [randomUUID(), orgId, k, DEPARTMENT_LABEL[k] || k]);
    await pool.query(`INSERT IGNORE INTO departments (id, org_id, \`key\`, label) VALUES ${values}`, params);
  }

  await pool.query('INSERT INTO org_members (org_id, user_id, role, department) VALUES (?,?,?,?)', [orgId, userId, 'owner', department]);
  return getMembership(userId);
}

export async function addMember({ orgId, userId, role = 'member', department = null }) {
  if (!isOrgRole(role)) throw new Error(`Invalid org role "${role}"`);
  await pool.query(
    `INSERT INTO org_members (org_id, user_id, role, department) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE role = VALUES(role), department = VALUES(department)`,
    [orgId, userId, role, department]
  );
  return { orgId, userId, role, department };
}

export async function updateMember({ orgId, userId, role, department }) {
  if (role !== undefined && !isOrgRole(role)) throw new Error(`Invalid org role "${role}"`);
  await pool.query(
    'UPDATE org_members SET role = COALESCE(?, role), department = COALESCE(?, department) WHERE org_id = ? AND user_id = ?',
    [role ?? null, department ?? null, orgId, userId]
  );
  return { orgId, userId, role, department };
}

export async function removeMember({ orgId, userId }) {
  await pool.query('DELETE FROM org_members WHERE org_id = ? AND user_id = ? AND role <> ?', [orgId, userId, 'owner']);
}

/** Members of an org, optionally scoped to one department. Joins user identity. */
export async function listMembers(orgId, { department = null } = {}) {
  const params = [orgId];
  let where = 'm.org_id = ?';
  if (department) { where += ' AND m.department = ?'; params.push(department); }
  const [rows] = await pool.query(
    `SELECT m.user_id, m.role, m.department, u.email, u.name
       FROM org_members m JOIN users u ON u.id = m.user_id
      WHERE ${where} ORDER BY FIELD(m.role,'owner','admin','manager','member'), u.email`,
    params
  );
  return rows.map((r) => ({ user_id: r.user_id, role: r.role, department: r.department, email: r.email, name: r.name }));
}

export async function listDepartments(orgId) {
  const [rows] = await pool.query('SELECT `key`, label FROM departments WHERE org_id = ? ORDER BY label', [orgId]);
  return rows.map((r) => ({ key: r.key, label: r.label }));
}

export default { getMembership, createOrganization, addMember, updateMember, removeMember, listMembers, listDepartments };
