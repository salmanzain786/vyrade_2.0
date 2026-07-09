import { client, MODEL, temperatureFor } from '../config/openai.js';
import { openQuestions } from './readiness.js';

const BASE_RULES = `You are Vyrade's clarification assistant.

You are given a checklist of CANDIDATE gaps in a structured automation
requirement (each in plain-English form) and the conversation so far.

Rules:
- Choose the SINGLE gap that is not yet resolved by the conversation and is
  most likely to affect architecture, cost, or reliability, and ask about it.
- Ask about ONE thing only. Do NOT bundle multiple questions together.
- Do NOT ask about anything the user has already answered or made clear in the
  conversation, even if it still appears in the checklist.
- Phrase it as a natural, friendly question a business user can answer without
  technical knowledge (never mention "fields", "schema", or "JSON").
- Never ask the user to paste passwords, API keys, tokens, or other secrets. If
  authentication is the gap, only confirm THAT access/credentials will be needed
  and which account or system, never the secret value itself.`;

// When blocking gaps remain the model must ask (never end); when only optional
// gaps remain it may wrap up. This lets the streaming endpoint pipe tokens
// straight through without a post-hoc "DONE override".
const MUST_ASK = `${BASE_RULES}
- You MUST ask a question. Do NOT respond with DONE — required details are still missing.`;

const MAY_FINISH = `${BASE_RULES}
- If every checklist item is already resolved by the conversation, respond with exactly: DONE`;

function buildUserPrompt(gaps, conversationSoFar) {
  const gapText = gaps.map((g) => `- ${g.description}`).join('\n');
  return `Conversation so far:\n${conversationSoFar || '(no conversation yet)'}\n\nCandidate gaps (pick the single most important one still unresolved, or DONE if allowed):\n${gapText}`;
}

/**
 * Prepare the clarification request WITHOUT calling the model, so both the
 * streaming and non-streaming paths share one source of truth.
 *
 * Returns:
 *   { done: true }                          — nothing left to ask
 *   { done: false, allowDone, messages }    — ask the model; allowDone is false
 *                                             when a blocking gap remains (model
 *                                             is forbidden from ending early)
 */
export function prepareQuestion(blueprintContent, conversationSoFar) {
  const gaps = openQuestions(blueprintContent);
  if (gaps.length === 0) return { done: true };

  const hasBlocking = gaps.some((g) => g.blocking);
  const messages = [
    { role: 'system', content: hasBlocking ? MUST_ASK : MAY_FINISH },
    { role: 'user', content: buildUserPrompt(gaps, conversationSoFar) },
  ];

  return { done: false, allowDone: !hasBlocking, messages };
}

/**
 * Non-streaming next question (kept for the JSON endpoint / callers that don't
 * stream). Returns the question text or the literal "DONE".
 */
export async function askNextQuestion(blueprintContent, conversationSoFar) {
  const prep = prepareQuestion(blueprintContent, conversationSoFar);
  if (prep.done) return 'DONE';

  const completion = await client.chat.completions.create({
    model: MODEL,
    ...temperatureFor(0.3),
    messages: prep.messages,
  });

  const answer = (completion.choices[0].message.content || '').trim();
  // With MUST_ASK the model won't say DONE while blocking; guard anyway.
  if (answer === 'DONE' && !prep.allowDone) {
    return `Before I can finish the blueprint, could you tell me more about the remaining requirement?`;
  }
  return answer;
}
