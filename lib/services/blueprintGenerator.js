import { zodResponseFormat } from 'openai/helpers/zod';
import { client, MODEL, temperatureFor } from '../config/openai.js';
import { AutomationBlueprintContent, validateBlueprint } from '../schema/blueprintSchema.js';
import { usageFromCompletion, mergeUsage, emptyUsage } from '../config/pricing.js';

const SYSTEM_PROMPT = `You are the Vyrade Automation Blueprint Engine.

Your job is to convert the user's clarified business requirement into a
platform-neutral Automation Blueprint.

PRIMARY RULE:
Describe WHAT the automation must accomplish.
Do not decide HOW n8n, Make, Zapier, Claude Code, MCP, Python, or any
specific implementation platform will build it.

You may include a named business system when the user explicitly requires
that system, for example HubSpot, Shopify, Slack, or Google Drive.

Do not include:
- n8n node names
- Make module identifiers
- Zapier action identifiers
- API endpoints
- MCP server recommendations
- SDK/package recommendations
- model recommendations
- implementation code

Never invent material requirements. When the requirement is underspecified,
prefer null, "unknown" confidence, and empty arrays over guessing. Do NOT
fabricate business rules, retry behavior, notifications, exceptions, an
expected volume, or a human-approval decision the user has not stated — leave
human_approval.required null and volume unknown until the user tells you.
These deliberate gaps are what drive the clarification questions.

If volume, budget, approval requirements, security requirements, or another
important value is unknown:
1. use null in the correct field (never the string "unknown");
2. add an entry to unknown_requirements;
3. state whether the unknown blocks generation or cost confidence.

CRITICAL — resolving unknowns: when the conversation now answers something that
was previously unknown, populate the correct field with the real value AND
REMOVE its matching entry from unknown_requirements. Never keep an
unknown_requirements entry for a detail the user has already provided, and never
re-add one for it. This is what lets the interview finish.

Preserve explicit business rules, exceptions, retry requirements,
notification rules, and human approval points.

PLATFORM LOCK-IN (constraints.implementation_constraints): when the user states
they are required to use, already use, must avoid, or prefer a specific
automation platform (e.g. "we're required to stay on n8n", "we already use
Zapier"), DO NOT put that platform anywhere in the business process. Record it
ONLY here:
- required_platforms: platforms they are contractually/operationally required to use
- prohibited_platforms: platforms they must not use
- existing_platforms: platforms already in use at the company
- platform_preferences: soft preferences
This keeps the process neutral while preserving the real user constraint. All
four arrays must be present (empty [] if none stated).

For a business rule condition, express the comparison as {field, operator,
value} where value is ALWAYS a list of strings: a single-value comparison
(operator "equals") uses a one-element list; a set comparison (operator
"not_in") lists every value. Represent exception data_changes as a list of
{field, value} entries.

Every array field must be present, even if empty ([]).`;

const RESPONSE_FORMAT = zodResponseFormat(AutomationBlueprintContent, 'automation_blueprint');

// Each generator call returns { parsed, usage } so token cost can be summed
// across the repair loop and attributed to the conversation.
export async function generateBlueprintDraft(conversationText) {
  const completion = await client.beta.chat.completions.parse({
    model: MODEL,
    ...temperatureFor(0),
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Clarified conversation:\n\n${conversationText}` },
    ],
    response_format: RESPONSE_FORMAT,
  });

  const parsed = completion.choices[0].message.parsed;
  if (!parsed) throw new Error('Model refused or returned no parsed structured output');
  return { parsed, usage: usageFromCompletion(completion, MODEL) };
}

async function repairBlueprint(conversationText, lastErrors) {
  const repairPrompt = `Your previous output failed validation with these errors:
${lastErrors}

Regenerate a corrected Blueprint for this conversation:

${conversationText}`;

  const completion = await client.beta.chat.completions.parse({
    model: MODEL,
    ...temperatureFor(0),
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: repairPrompt },
    ],
    response_format: RESPONSE_FORMAT,
  });

  return { parsed: completion.choices[0].message.parsed, usage: usageFromCompletion(completion, MODEL) };
}

/**
 * Generate + validate with a bounded repair loop (Section 19). Returns
 * { blueprint, usage } — usage is the sum of every model call made (including
 * failed-then-repaired attempts, which still cost tokens).
 */
export async function generateAndValidate(conversationText, maxRepairs = 2) {
  let lastError = null;
  let usage = emptyUsage(MODEL);

  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    try {
      const { parsed, usage: attemptUsage } = attempt === 0
        ? await generateBlueprintDraft(conversationText)
        : await repairBlueprint(conversationText, lastError);
      usage = mergeUsage(usage, attemptUsage);

      return { blueprint: validateBlueprint(parsed), usage };
    } catch (err) {
      lastError = err.message;
    }
  }

  throw new Error(
    `Blueprint generation failed validation after ${maxRepairs + 1} attempts. ` +
    `Last error: ${lastError}. Caller should mark the Blueprint 'blocked', not complete.`
  );
}

/**
 * Incremental patch (Section 12) — apply ONE new conversation turn.
 *
 * `turn` is { question, answer }: the QUESTION Vyrade asked and the user's
 * ANSWER to it. Passing the question is essential — an answer like "Only on
 * failures" or "Sarah" is ambiguous without the question it responds to, and
 * the patch engine would otherwise guess which field to update. The caller
 * retrieves the question server-side from the conversation store (never trusts
 * the client to build it). A bare string is still accepted for back-compat.
 */
export async function patchBlueprintContent(currentBlueprint, turn, maxRepairs = 2) {
  const answer = typeof turn === 'string' ? turn : (turn?.answer ?? '');
  const question = typeof turn === 'string' ? null : (turn?.question ?? null);

  const turnBlock = question
    ? `Vyrade asked:\n"${question}"\n\nThe user answered:\n"${answer}"`
    : `New conversation turn:\n"${answer}"`;

  const patchPrompt = `Current Blueprint (draft JSON):
${JSON.stringify(currentBlueprint, null, 2)}

${turnBlock}

Task: update_blueprint

Interpret the user's answer IN THE CONTEXT of the question Vyrade asked, and
apply ONLY the change it implies. For example, if the question was about
notification timing and the answer is "Only on failures", update the
notification condition — do not touch unrelated fields. Do not regenerate
unrelated trigger, systems, or business rules unless validation finds a
dependency that requires it. Return the FULL corrected Blueprint object.
Every array field must be present, even if empty ([]).`;

  let lastError = null;
  let usage = emptyUsage(MODEL);

  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    try {
      const messages = attempt === 0
        ? [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: patchPrompt }]
        : [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: patchPrompt },
            { role: 'user', content: `Previous attempt failed validation: ${lastError}. Try again.` },
          ];

      const completion = await client.beta.chat.completions.parse({
        model: MODEL,
        ...temperatureFor(0),
        messages,
        response_format: RESPONSE_FORMAT,
      });
      usage = mergeUsage(usage, usageFromCompletion(completion, MODEL));

      return { blueprint: validateBlueprint(completion.choices[0].message.parsed), usage };
    } catch (err) {
      lastError = err.message;
    }
  }

  throw new Error(
    `Blueprint patch failed validation after ${maxRepairs + 1} attempts. Last error: ${lastError}`
  );
}
