import { ForbiddenError } from './guard.js';
import { getBlueprintOwnerId } from '../services/blueprintRepository.js';
import { getConversationOwner } from '../services/conversationRepository.js';

// Custom error so routes can return 404 (rather than 403) for a truly missing
// resource without leaking existence of other users' data.
export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

/**
 * Ensure `user` owns the blueprint. A missing blueprint → 404; one owned by
 * someone else → 403. Unowned legacy rows (userId null) are treated as
 * inaccessible to keep the boundary strict.
 */
export async function assertBlueprintOwner(user, blueprintId) {
  const ownerId = await getBlueprintOwnerId(blueprintId);
  if (ownerId === undefined) throw new NotFoundError('Blueprint not found');
  if (ownerId !== user.id) throw new ForbiddenError();
}

/**
 * Ensure `user` may act on a conversation/session. A brand-new session with no
 * row yet is allowed (the caller will create it under this user). An existing
 * conversation owned by another user → 403.
 * Returns { exists } so callers can short-circuit reads of empty sessions.
 */
export async function assertSessionAccess(user, sessionId) {
  const { exists, userId } = await getConversationOwner(sessionId);
  if (exists && userId && userId !== user.id) throw new ForbiddenError();
  return { exists };
}
