/**
 * Resolve a user's org access for pages/routes: their membership + the viewing
 * scope (whole org / their department / none). Returns null if they're not in
 * an org. The single place server code asks "what can this user see?".
 */
import { getMembership } from './membershipRepository.js';
import { resolveScope } from './access.js';

export async function getOrgAccess(userId) {
  const membership = await getMembership(userId).catch(() => null);
  if (!membership) return null;
  const { scope, departmentFilter } = resolveScope(membership);
  return { ...membership, scope, departmentFilter };
}

export default { getOrgAccess };
