import { zodResponseFormat } from 'openai/helpers/zod';
import { client, MODEL, temperatureFor } from '../config/openai.js';
import { AutomationBlueprintContent, validateBlueprint } from '../schema/blueprintSchema.js';

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

For a business rule condition, express the comparison as {field, operator,
value} where value is ALWAYS a list of strings: a single-value comparison
(operator "equals") uses a one-element list; a set comparison (operator
"not_in") lists every value. Represent exception data_changes as a list of
{field, value} entries.

Every array field must be present, even if empty ([]).`;

const RESPONSE_FORMAT = zodResponseFormat(AutomationBlueprintContent, 'automation_blueprint');

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
  return parsed;
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

  return completion.choices[0].message.parsed;
}

/**
 * Generate + validate with a bounded repair loop (Section 19).
 */
export async function generateAndValidate(conversationText, maxRepairs = 2) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    try {
      const draft = attempt === 0
        ? await generateBlueprintDraft(conversationText)
        : await repairBlueprint(conversationText, lastError);

      return validateBlueprint(draft);
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
 */
export async function patchBlueprintContent(currentBlueprint, newTurnText, maxRepairs = 2) {
  const patchPrompt = `Current Blueprint (draft JSON):
${JSON.stringify(currentBlueprint, null, 2)}

New conversation turn:
"${newTurnText}"

Task: update_blueprint

Apply ONLY the change implied by the new turn. Do not regenerate unrelated
trigger, systems, or business rules unless validation finds a dependency
that requires it. Return the FULL corrected Blueprint object.
Every array field must be present, even if empty ([]).`;

  let lastError = null;

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

      return validateBlueprint(completion.choices[0].message.parsed);
    } catch (err) {
      lastError = err.message;
    }
  }

  throw new Error(
    `Blueprint patch failed validation after ${maxRepairs + 1} attempts. Last error: ${lastError}`
  );
}
