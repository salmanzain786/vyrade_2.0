import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the collaborators so we test the WIRING of createBlueprintFromDiscovery
// without a real (billed) LLM call or DB — narrative.js stays real (pure).
const addMessage = vi.fn();
const createInitialBlueprint = vi.fn();
const attachBlueprint = vi.fn();
vi.mock('../lib/services/conversationRepository.js', () => ({ addMessage: (...a) => addMessage(...a) }));
vi.mock('../lib/services/blueprintService.js', () => ({ createInitialBlueprint: (...a) => createInitialBlueprint(...a) }));
vi.mock('../lib/services/work-intelligence/discovery/discoveryRepository.js', () => ({ attachBlueprint: (...a) => attachBlueprint(...a) }));

const { createBlueprintFromDiscovery } = await import('../lib/services/work-intelligence/discovery/generate.js');

const discovery = {
  id: 'd1', task_name: 'Monthly SEO reporting',
  context: { name: 'Monthly SEO reporting', project: 'Client A', signals: [] },
  questions: [
    { id: 'data_sources', question: 'Where does the data come from?' },
    { id: 'format', question: 'How must the output be formatted?' },
  ],
  answers: { data_sources: 'GA4 + Search Console API' }, // 'format' intentionally blank
};

describe('createBlueprintFromDiscovery (2.4) — reuse wiring', () => {
  beforeEach(() => { addMessage.mockReset(); createInitialBlueprint.mockReset(); attachBlueprint.mockReset(); createInitialBlueprint.mockResolvedValue({ blueprintId: 'bp1', status: 'requirements_complete', readiness: { score: 60 } }); });

  it('feeds the task+answers narrative to the EXISTING engine and links the Blueprint', async () => {
    const r = await createBlueprintFromDiscovery({ discovery, userId: 'u1' });
    expect(r).toMatchObject({ blueprintId: 'bp1', status: 'requirements_complete' });

    // 1) it called the existing generator, not a parallel one
    expect(createInitialBlueprint).toHaveBeenCalledTimes(1);
    const arg = createInitialBlueprint.mock.calls[0][0];
    expect(arg.userId).toBe('u1');
    expect(arg.sessionId).toBeTruthy();

    // 2) the narrative embeds the task + the answer, and marks the BLANK as uncertain (never guessed)
    expect(arg.conversationText).toMatch(/Monthly SEO reporting/);
    expect(arg.conversationText).toMatch(/GA4 \+ Search Console API/);
    expect(arg.conversationText).toMatch(/UNCERTAIN|needs clarification/);
    expect(arg.conversationText).toMatch(/do NOT invent/i);

    // 3) it seeded the conversation on the SAME session it generated into
    expect(addMessage).toHaveBeenCalledWith(arg.sessionId, 'user', expect.stringContaining('Explore Automation'), 'u1');

    // 4) it persisted the bidirectional link (discovery ↔ blueprint/session)
    expect(attachBlueprint).toHaveBeenCalledWith('d1', { blueprintId: 'bp1', sessionId: arg.sessionId });
  });

  it('propagates a generator failure (does not silently swallow)', async () => {
    createInitialBlueprint.mockRejectedValueOnce(new Error('LLM unavailable'));
    await expect(createBlueprintFromDiscovery({ discovery, userId: 'u1' })).rejects.toThrow(/LLM unavailable/);
    expect(attachBlueprint).not.toHaveBeenCalled(); // no link written on failure
  });
});
