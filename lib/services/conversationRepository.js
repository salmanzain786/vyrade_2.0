import { v4 as uuidv4 } from 'uuid';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { conversations, conversationMessages } from '../db/schema.js';

/**
 * Return the user_id that owns a conversation, or null if the conversation
 * doesn't exist yet (a brand-new session id). Used to enforce that a user can
 * only read/append to their own chats.
 */
export async function getConversationOwner(sessionId) {
  const [row] = await db
    .select({ userId: conversations.userId })
    .from(conversations)
    .where(eq(conversations.sessionId, sessionId))
    .limit(1);
  if (!row) return { exists: false, userId: null };
  return { exists: true, userId: row.userId };
}

/**
 * Append a chat message and upsert its conversation. The conversation title is
 * taken from the first user message (kept once set). `userId` stamps ownership
 * on first insert (kept once set for existing rows).
 */
export async function addMessage(sessionId, role, content, userId = null) {
  const title = role === 'user' ? String(content).slice(0, 120) : null;

  await db
    .insert(conversations)
    .values({ sessionId, userId, title })
    .onDuplicateKeyUpdate({
      set: {
        updatedAt: sql`CURRENT_TIMESTAMP`,
        // Keep the existing title/owner once set; only fill when currently NULL.
        title: sql`COALESCE(${conversations.title}, ${title})`,
        userId: sql`COALESCE(${conversations.userId}, ${userId})`,
      },
    });

  const id = uuidv4();
  await db.insert(conversationMessages).values({
    id,
    sessionId,
    role,
    content: String(content),
  });

  return { id };
}

/**
 * List a single user's conversations for the sidebar, most recently active
 * first. Scoped by user_id so a user never sees another user's chats.
 */
export async function listConversations(userId, limit = 100) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, limit)) : 100;

  // LEFT JOIN + GROUP BY rather than a correlated subquery: inside a raw sql``
  // template Drizzle renders columns unqualified, which would make the
  // subquery's WHERE self-referential and count the whole table.
  return db
    .select({
      session_id: conversations.sessionId,
      title: conversations.title,
      updated_at: conversations.updatedAt,
      message_count: sql`COUNT(${conversationMessages.seq})`.mapWith(Number),
    })
    .from(conversations)
    .leftJoin(conversationMessages, eq(conversationMessages.sessionId, conversations.sessionId))
    .where(eq(conversations.userId, userId))
    .groupBy(conversations.sessionId, conversations.title, conversations.updatedAt)
    .orderBy(desc(conversations.updatedAt))
    .limit(safeLimit);
}

/**
 * Full ordered message history for one conversation.
 */
export async function getMessages(sessionId) {
  return db
    .select({
      role: conversationMessages.role,
      content: conversationMessages.content,
      created_at: conversationMessages.createdAt,
    })
    .from(conversationMessages)
    .where(eq(conversationMessages.sessionId, sessionId))
    .orderBy(asc(conversationMessages.seq));
}
