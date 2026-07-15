import { client, MODEL, temperatureFor } from '../config/openai.js';
import { openQuestions, materialGaps } from './readiness.js';
import { usageFromCompletion, emptyUsage } from '../config/pricing.js';

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

// While a structural must-have is still missing the model must ask (never end),
// so the streaming endpoint can pipe tokens straight through. Once the
// structural essentials are in place, the model MAY wrap up — but it should
// still ask about any remaining detail the user hasn't addressed, and only
// finish when there is genuinely nothing left to ask (or the user has already
// been asked and couldn't provide it). This is what both keeps the interview
// asking about underspecified details AND stops it from re-asking a question the
// user already declined (no infinite loop).
const MUST_ASK = `${BASE_RULES}
- You MUST ask a question. Do NOT respond with DONE — required details are still missing.`;

const MAY_FINISH = `${BASE_RULES}
- Ask about the single most important remaining detail the user has NOT yet
  addressed in the conversation.
- Respond with exactly DONE only if every remaining item has already been raised
  and the user could not or chose not to provide it, or nothing material is left.
- Never repeat a question the user has already answered or explicitly declined.`;

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

  // Force a question (MUST_ASK, streamed) while any STRUCTURAL must-have is
  // still missing. Once those are in place, switch to MAY_FINISH: the model
  // still asks about remaining underspecified details, but is now allowed to
  // end instead of being forced to re-ask a point the user already declined.
  const hasMaterialBlocker = materialGaps(blueprintContent).some((g) => g.blocking);
  const messages = [
    { role: 'system', content: hasMaterialBlocker ? MUST_ASK : MAY_FINISH },
    { role: 'user', content: buildUserPrompt(gaps, conversationSoFar) },
  ];

  return { done: false, allowDone: !hasMaterialBlocker, messages };
}

/**
 * Non-streaming next question (kept for the JSON endpoint / callers that don't
 * stream). Returns { text, done, usage } — `text` is the question or 'DONE'.
 */
export async function askNextQuestion(blueprintContent, conversationSoFar) {
  const prep = prepareQuestion(blueprintContent, conversationSoFar);
  if (prep.done) return { text: 'DONE', done: true, usage: emptyUsage(MODEL) };

  const completion = await client.chat.completions.create({
    model: MODEL,
    ...temperatureFor(0.3),
    messages: prep.messages,
  });

  const usage = usageFromCompletion(completion, MODEL);
  let answer = (completion.choices[0].message.content || '').trim();
  // With MUST_ASK the model won't say DONE while a structural gap remains; guard.
  if (answer === 'DONE' && !prep.allowDone) {
    answer = 'Before I can finish the blueprint, could you tell me more about the remaining requirement?';
  }
  return { text: answer, done: answer === 'DONE', usage };
}
