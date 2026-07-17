/**
 * Fixture RECORDER — not a test. Skipped unless you opt in:
 *
 *   RECORD_LLM=1 npx vitest run tests/_record.test.js
 *
 * It calls the REAL OpenAI API once per scenario and writes the responses to
 * tests/fixtures/llm/. The recorded files are committed, so the replay suite
 * (llmFixtures.test.js) is deterministic, free, and offline — CI never calls an
 * LLM. Re-record only when a prompt/schema change makes a fixture stale.
 *
 * It lives under tests/ because the lib/* modules are ESM and vitest is what
 * transpiles them; the RECORD_LLM guard keeps it inert in CI.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const RECORD = process.env.RECORD_LLM === '1';
const DIR = join(process.cwd(), 'tests', 'fixtures', 'llm');

const BASE_CONVO =
  'User: When a new Shopify order is created, append it to a Google Sheet and post a message to the #sales Slack channel. ' +
  'If the Google Sheet write fails, retry twice and then alert us on Slack. Notify Slack for every order. ' +
  'A person does not need to approve anything. We get about 500 orders a month.';

// A different phrasing of the SAME requirement — used to check equivalence.
const EQUIVALENT_CONVO =
  'User: Every time Shopify records a new order, add a row to our Google Sheet and send a note to the #sales channel in Slack. ' +
  'Should the sheet write fail, try it two more times, then let us know in Slack. Post to Slack on every order. ' +
  'No human sign-off is needed. Volume is roughly 500 orders per month.';

function save(name, data) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, `${name}.json`), JSON.stringify(data, null, 2) + '\n');
  console.log(`recorded → tests/fixtures/llm/${name}.json`);
}

describe.skipIf(!RECORD)('record LLM fixtures', () => {
  it('records blueprint + patch responses', { timeout: 300000 }, async () => {
    const { generateAndValidate, patchBlueprintContent } = await import('../lib/services/blueprintGenerator.js');

    // 1) Base blueprint — "retry twice".
    const base = await generateAndValidate(BASE_CONVO);
    save('blueprint-retry-2', base.blueprint);

    // 2) Patch it to five retries.
    const five = await patchBlueprintContent(base.blueprint, {
      question: 'How many times should we retry the Google Sheets write before giving up?',
      answer: 'Make it retry five times.',
    });
    save('blueprint-retry-5', five.blueprint);

    // 3) Patch the notification rule with an answer that is meaningless without
    //    its question — the exact P0 ambiguity case.
    const onlyFailures = await patchBlueprintContent(base.blueprint, {
      question: 'Should Slack notifications be sent on success, or only when something fails?',
      answer: 'Only on failures.',
    });
    save('blueprint-notify-on-failures', onlyFailures.blueprint);

    // 4) An equivalent phrasing of the base requirement.
    const equivalent = await generateAndValidate(EQUIVALENT_CONVO);
    save('blueprint-equivalent-phrasing', equivalent.blueprint);

    expect(base.blueprint).toBeTruthy();
  });
});
