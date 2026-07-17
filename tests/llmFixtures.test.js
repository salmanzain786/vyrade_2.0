/**
 * Recorded-LLM tests. The fixtures in tests/fixtures/llm/ are REAL OpenAI
 * responses captured by tests/_record.test.js (RECORD_LLM=1). Here we replay
 * them through the real services with the OpenAI client mocked, so the
 * LLM-dependent paths — patching, validation/repair, readiness, export gates —
 * are covered deterministically, offline, and for free in CI.
 *
 * What this proves that a live call cannot: the exact prompt we send, that a
 * failed validation really is repaired, and that token usage is summed across
 * retries.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import retry2 from './fixtures/llm/blueprint-retry-2.json';
import retry5 from './fixtures/llm/blueprint-retry-5.json';
import notifyFailures from './fixtures/llm/blueprint-notify-on-failures.json';
import equivalent from './fixtures/llm/blueprint-equivalent-phrasing.json';

const parseMock = vi.fn();

vi.mock('../lib/config/openai.js', () => ({
  client: {
    beta: { chat: { completions: { parse: (...args) => parseMock(...args) } } },
    chat: { completions: { create: vi.fn() } },
    embeddings: { create: vi.fn() },
  },
  MODEL: 'gpt-test',
  temperatureFor: () => ({}),
}));

const { generateAndValidate, patchBlueprintContent } = await import('../lib/services/blueprintGenerator.js');
const { checkReadiness } = await import('../lib/services/readiness.js');

/** Shape of an OpenAI structured-output completion. */
const completion = (parsed) => ({
  model: 'gpt-test',
  choices: [{ message: { parsed } }],
  usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
});

const clone = (o) => JSON.parse(JSON.stringify(o));
const promptOf = (callIndex) =>
  parseMock.mock.calls[callIndex][0].messages.map((m) => m.content).join('\n---\n');
const retryOf = (bp) => bp.retry_requirements.find((r) => /sheet/i.test(r.system))?.max_retries;

beforeEach(() => parseMock.mockReset());

describe('QA — "Retry twice" → retries = 2', () => {
  it('generates, validates, and reports a complete blueprint', async () => {
    parseMock.mockResolvedValueOnce(completion(clone(retry2)));

    const { blueprint, usage } = await generateAndValidate('User: …retry twice…');

    expect(retryOf(blueprint)).toBe(2);
    expect(checkReadiness(blueprint).status).toBe('requirements_complete');
    expect(usage.totalTokens).toBe(150);
  });
});

describe('QA — user changes to "five times" → new blueprint retries = 5', () => {
  it('applies the change and leaves everything else alone', async () => {
    parseMock.mockResolvedValueOnce(completion(clone(retry5)));

    const { blueprint } = await patchBlueprintContent(clone(retry2), {
      question: 'How many times should we retry the Google Sheets write before giving up?',
      answer: 'Make it retry five times.',
    });

    expect(retryOf(blueprint)).toBe(5);
    // Surgical: the notification rules were not collateral damage.
    expect(blueprint.notification_rules).toHaveLength(retry2.notification_rules.length);
  });

  it('P0 regression — the patch prompt carries the QUESTION, not just the answer', async () => {
    parseMock.mockResolvedValueOnce(completion(clone(retry5)));
    await patchBlueprintContent(clone(retry2), {
      question: 'How many times should we retry the Google Sheets write before giving up?',
      answer: 'Make it retry five times.',
    });

    const sent = promptOf(0);
    expect(sent).toContain('How many times should we retry the Google Sheets write');
    expect(sent).toContain('Make it retry five times.');
  });
});

describe('QA — "Only on failures" updates the notification rule correctly', () => {
  it('drops the every-order rule, keeps the failure rule, and leaves retry untouched', async () => {
    parseMock.mockResolvedValueOnce(completion(clone(notifyFailures)));

    const { blueprint } = await patchBlueprintContent(clone(retry2), {
      question: 'Should Slack notifications be sent on success, or only when something fails?',
      answer: 'Only on failures.',
    });

    // The recorded response narrowed 2 rules → 1, and that one is failure-only.
    expect(blueprint.notification_rules.length).toBeLessThan(retry2.notification_rules.length);
    expect(blueprint.notification_rules.every((n) => /fail/i.test(n.condition))).toBe(true);
    expect(retryOf(blueprint)).toBe(2); // unrelated field untouched
  });
});

describe('QA — equivalent phrasings produce an equivalent blueprint', () => {
  // What holds across phrasings is the MATERIAL requirement — the same systems,
  // trigger source, retry policy, approval decision, and volume. What does NOT
  // reliably hold is the model's discretionary `blocks_generation` flagging, so
  // the readiness *status* can legitimately differ (base → complete, equivalent
  // → still collecting because it flagged a different unknown as blocking).
  // Asserting status equality would be a false claim; see the explicit check.
  it('agrees on all material requirements', async () => {
    parseMock
      .mockResolvedValueOnce(completion(clone(retry2)))
      .mockResolvedValueOnce(completion(clone(equivalent)));

    const a = (await generateAndValidate('User: …retry twice…')).blueprint;
    const b = (await generateAndValidate('User: …try it two more times…')).blueprint;

    expect(b.systems.map((s) => s.name).sort()).toEqual(a.systems.map((s) => s.name).sort());
    expect(retryOf(b)).toBe(retryOf(a));                          // both 2
    expect(b.trigger.source_system).toBe(a.trigger.source_system); // both Shopify
    expect(b.trigger.trigger_type).toBe(a.trigger.trigger_type);   // both event
    expect(b.human_approval.required).toBe(a.human_approval.required); // both false
    expect(b.volume.estimated_executions).toBe(a.volume.estimated_executions); // both 500
    // Both are grounded automations with the core structure filled in.
    for (const bp of [a, b]) {
      expect(bp.business_intent.business_goal).toBeTruthy();
      expect(bp.process_steps.length).toBeGreaterThan(0);
    }
  });

  it('documents that readiness status is NOT guaranteed equal across phrasings', async () => {
    parseMock
      .mockResolvedValueOnce(completion(clone(retry2)))
      .mockResolvedValueOnce(completion(clone(equivalent)));
    const a = (await generateAndValidate('x')).blueprint;
    const b = (await generateAndValidate('y')).blueprint;
    // This asymmetry is expected (see comment above). If a prompt change ever
    // makes them agree, that's an improvement — update this test then.
    expect(checkReadiness(a).status).toBe('requirements_complete');
    expect(checkReadiness(b).status).toBe('collecting_requirements');
  });
});

describe('QA — invalid LLM output is repaired', () => {
  it('retries with the validation error, returns the fixed blueprint, and bills both calls', async () => {
    // Referential break: a retry rule pointing at a system that isn't declared.
    const broken = clone(retry2);
    broken.retry_requirements = [{ system: 'Totally Unknown System', max_retries: 2, after_final_failure: null }];

    parseMock
      .mockResolvedValueOnce(completion(broken))
      .mockResolvedValueOnce(completion(clone(retry2)));

    const { blueprint, usage } = await generateAndValidate('User: …retry twice…');

    expect(parseMock).toHaveBeenCalledTimes(2);           // it repaired
    expect(retryOf(blueprint)).toBe(2);                   // with the valid output
    expect(usage.totalTokens).toBe(300);                  // both attempts are paid for
    expect(promptOf(1)).toMatch(/failed validation/i);    // the error was fed back
    expect(promptOf(1)).toMatch(/referential|unknown system/i);
  });

  it('gives up after the repair budget and never returns an invalid blueprint', async () => {
    const broken = clone(retry2);
    broken.retry_requirements = [{ system: 'Totally Unknown System', max_retries: 2, after_final_failure: null }];
    parseMock.mockResolvedValue(completion(broken));

    await expect(generateAndValidate('User: …')).rejects.toThrow(/failed validation/i);
  });
});
