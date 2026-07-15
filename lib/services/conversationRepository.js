import { v4 as uuidv4 } from 'uuid';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { conversations, conversationMessages } from '../db/schema.js';
import { costForUsage } from '../config/pricing.js';

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
 *
 * `usage` (optional) = { model, promptTokens, completionTokens, totalTokens }
 * for a message produced by a model call. Its USD cost is computed here (never
 * trusted from a caller) and stored on the row, and the amounts are added to the
 * conversation's running totals.
 */
export async function addMessage(sessionId, role, content, userId = null, usage = null) {
  const title = role === 'user' ? String(content).slice(0, 120) : null;

  const promptTokens = usage?.promptTokens || 0;
  const completionTokens = usage?.completionTokens || 0;
  const totalTokens = usage?.totalTokens || promptTokens + completionTokens;
  const costUsd = usage ? costForUsage(usage) : 0;

  await db
    .insert(conversations)
    .values({ sessionId, userId, title, totalTokens, totalCostUsd: String(costUsd) })
    .onDuplicateKeyUpdate({
      set: {
        updatedAt: sql`CURRENT_TIMESTAMP`,
        // Keep the existing title/owner once set; only fill when currently NULL.
        title: sql`COALESCE(${conversations.title}, ${title})`,
        userId: sql`COALESCE(${conversations.userId}, ${userId})`,
        // Accumulate the conversation's total spend.
        totalTokens: sql`${conversations.totalTokens} + ${totalTokens}`,
        totalCostUsd: sql`${conversations.totalCostUsd} + ${costUsd}`,
      },
    });

  const id = uuidv4();
  await db.insert(conversationMessages).values({
    id,
    sessionId,
    role,
    content: String(content),
    model: usage?.model || null,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd: String(costUsd),
  });

  return { id, costUsd, totalTokens };
}

/**
 * Add token cost to a conversation WITHOUT writing a message row — for turns
 * whose LLM work produced no chat message (e.g. a blueprint update whose turn
 * ended the interview). Keeps the per-conversation total accurate.
 */
export async function addConversationUsage(sessionId, userId, usage) {
  const totalTokens = usage?.totalTokens || 0;
  const costUsd = usage ? costForUsage(usage) : 0;
  if (!totalTokens && !costUsd) return;

  await db
    .insert(conversations)
    .values({ sessionId, userId, totalTokens, totalCostUsd: String(costUsd) })
    .onDuplicateKeyUpdate({
      set: {
        updatedAt: sql`CURRENT_TIMESTAMP`,
        userId: sql`COALESCE(${conversations.userId}, ${userId})`,
        totalTokens: sql`${conversations.totalTokens} + ${totalTokens}`,
        totalCostUsd: sql`${conversations.totalCostUsd} + ${costUsd}`,
      },
    });
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
      total_tokens: conversations.totalTokens,
      total_cost_usd: conversations.totalCostUsd,
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
 * The most recent assistant (agent) message for a session — i.e. the last
 * clarification question Vyrade asked. Used to give the Blueprint patch engine
 * the QUESTION a user's answer responds to, so "Only on failures" is applied to
 * the right field instead of guessed at. Returns null if none yet.
 */
export async function getLastAssistantQuestion(sessionId) {
  const [row] = await db
    .select({ content: conversationMessages.content })
    .from(conversationMessages)
    .where(and(
      eq(conversationMessages.sessionId, sessionId),
      eq(conversationMessages.role, 'agent'),
    ))
    .orderBy(desc(conversationMessages.seq))
    .limit(1);
  return row ? row.content : null;
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
