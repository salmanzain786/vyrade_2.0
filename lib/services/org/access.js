/**
 * Org roles & access scope (Phase 2.2) — pure policy, no DB.
 *
 * owner  — full org, manages members/settings (the creator)
 * admin  — full org, manages members
 * manager— their DEPARTMENT only (department-scoped views)
 * member — no org views (personal dashboard only)
 */
export const ORG_ROLES = ['owner', 'admin', 'manager', 'member'];
export const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', manager: 'Manager', member: 'Member' };

export const isOrgRole = (r) => ORG_ROLES.includes(r);
export const canSeeWholeOrg = (role) => role === 'owner' || role === 'admin';
export const canManageMembers = (role) => role === 'owner' || role === 'admin';
export const canInvite = (role) => role === 'owner' || role === 'admin';

/** What org data this role can see: whole org, just their department, or nothing. */
export function orgScope(role) {
  if (canSeeWholeOrg(role)) return 'org';
  if (role === 'manager') return 'department';
  return 'none';
}

/**
 * Resolve the effective viewing scope for a membership.
 * @returns {{scope:'org'|'department'|'none', departmentFilter:?string}}
 *   departmentFilter is the department a manager is limited to (null = all).
 */
export function resolveScope({ role, department } = {}) {
  const scope = orgScope(role);
  return { scope, departmentFilter: scope === 'department' ? (department || null) : null };
}

export default { ORG_ROLES, ROLE_LABEL, isOrgRole, canSeeWholeOrg, canManageMembers, canInvite, orgScope, resolveScope };
