import { v4 as uuidv4 } from 'uuid';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { conversations, conversationMessages } from '../db/schema.js';

/**
 * Append a chat message and upsert its conversation. The conversation title is
 * taken from the first user message (kept once set).
 */
export async function addMessage(sessionId, role, content) {
  const title = role === 'user' ? String(content).slice(0, 120) : null;

  await db
    .insert(conversations)
    .values({ sessionId, title })
    .onDuplicateKeyUpdate({
      set: {
        updatedAt: sql`CURRENT_TIMESTAMP`,
        // Keep the existing title once set; only a first user message fills it.
        title: sql`COALESCE(${conversations.title}, ${title})`,
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
 * List conversations for the sidebar, most recently active first.
 */
export async function listConversations(limit = 100) {
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
