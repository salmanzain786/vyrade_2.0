/**
 * Real-import smoke test, exercised against a MOCKED n8n instance so the
 * generate → import → repair → verified pipeline is covered deterministically
 * (CI never talks to a real n8n).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { baseWorkflow } from './fixtures.js';

const parseMock = vi.fn();          // not used here, but the module is imported
const createMock = vi.fn();

vi.mock('../lib/config/openai.js', () => ({
  client: {
    beta: { chat: { completions: { parse: (...a) => parseMock(...a) } } },
    chat: { completions: { create: (...a) => createMock(...a) } },
    embeddings: { create: vi.fn(async () => ({ data: [{ embedding: [0] }] })) },
  },
  MODEL: 'gpt-test',
  temperatureFor: () => ({}),
}));

// No Pinecone in these tests — retrieval returns nothing.
vi.mock('../lib/services/retrieval.js', () => ({
  retrieveNodeContext: vi.fn(async () => ({ chunks: [], matchCount: 0, queryCount: 0 })),
  retrieveToolContext: vi.fn(async () => ({ chunks: [], matchCount: 0, queryCount: 0 })),
  retrieveWorkflowExamples: vi.fn(async () => ({ examples: [], matchCount: 0, queryCount: 0, available: false })),
}));

const { generateN8nWorkflow } = await import('../lib/services/n8nSpecialist.js');
const { verifyN8nImport, isImportVerifierConfigured } = await import('../lib/services/n8nImportVerifier.js');

const completion = (obj) => ({
  model: 'gpt-test',
  choices: [{ message: { content: JSON.stringify(obj) } }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
});

const configure = (on) => {
  if (on) {
    process.env.N8N_TEST_URL = 'https://n8n.test';
    process.env.N8N_TEST_API_KEY = 'test-key';
  } else {
    delete process.env.N8N_TEST_URL;
    delete process.env.N8N_TEST_API_KEY;
  }
};

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

beforeEach(() => { createMock.mockReset(); vi.restoreAllMocks(); });
afterEach(() => configure(false));

describe('verifyN8nImport', () => {
  it('is skipped when no test instance is configured', async () => {
    configure(false);
    expect(isImportVerifierConfigured()).toBe(false);
    await expect(verifyN8nImport(baseWorkflow())).resolves.toMatchObject({ ok: true, skipped: true });
  });

  it('posts only n8n-accepted fields (never our own meta)', async () => {
    configure(true);
    const fetchMock = vi.fn(async () => jsonResponse(200, { id: 'wf_1' }));
    vi.stubGlobal('fetch', fetchMock);

    const wf = { ...baseWorkflow(), meta: { generated_by: 'vyrade', retrieved_doc_count: 9 } };
    const res = await verifyN8nImport(wf);

    expect(res.ok).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(Object.keys(body).sort()).toEqual(['connections', 'name', 'nodes', 'settings']);
    expect(body.meta).toBeUndefined();
    expect(fetchMock.mock.calls[0][1].headers['X-N8N-API-KEY']).toBe('test-key');
  });

  it('deletes the smoke-test workflow afterwards', async () => {
    configure(true);
    const fetchMock = vi.fn(async () => jsonResponse(200, { id: 'wf_42' }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await verifyN8nImport(baseWorkflow());
    expect(res.cleanedUp).toBe(true);
    const del = fetchMock.mock.calls[1];
    expect(del[0]).toContain('/api/v1/workflows/wf_42');
    expect(del[1].method).toBe('DELETE');
  });

  it('surfaces n8n\'s rejection message', async () => {
    configure(true);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(400, { message: 'request/body/nodes/0 must have required property "typeVersion"' })));
    const res = await verifyN8nImport(baseWorkflow());
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(res.error).toMatch(/typeVersion/);
  });

  it('treats an unreachable instance as "could not verify", not "bad workflow"', async () => {
    configure(true);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    const res = await verifyN8nImport(baseWorkflow());
    expect(res).toMatchObject({ ok: true, skipped: true });
  });
});

describe('generate → import → repair → verified', () => {
  it('marks import_check=verified when n8n accepts it', async () => {
    configure(true);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { id: 'wf_1' })));
    createMock.mockResolvedValueOnce(completion(baseWorkflow()));

    const { workflow } = await generateN8nWorkflow({ systems: [], process_steps: [] });
    expect(workflow.meta.import_check).toBe('verified');
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('REPAIRS using n8n\'s own error, then verifies', async () => {
    configure(true);
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      call += 1;
      // First import rejected; after the repair, accepted.
      return call === 1
        ? jsonResponse(400, { message: 'nodes/1 has an unknown node type' })
        : jsonResponse(200, { id: 'wf_2' });
    }));
    createMock
      .mockResolvedValueOnce(completion(baseWorkflow()))
      .mockResolvedValueOnce(completion(baseWorkflow()));

    const { workflow, usage } = await generateN8nWorkflow({ systems: [], process_steps: [] });

    expect(createMock).toHaveBeenCalledTimes(2);              // it repaired
    expect(workflow.meta.import_check).toBe('verified');
    expect(workflow.meta.repair_attempts).toBe(1);
    expect(usage.totalTokens).toBe(30);                       // both calls billed
    // The repair prompt carried n8n's actual message.
    const repairPrompt = createMock.mock.calls[1][0].messages.map((m) => m.content).join('\n');
    expect(repairPrompt).toMatch(/unknown node type/);
  });

  it('returns the workflow marked FAILED (not an exception) when n8n keeps rejecting', async () => {
    configure(true);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(400, { message: 'still invalid' })));
    createMock.mockResolvedValue(completion(baseWorkflow()));

    const { workflow } = await generateN8nWorkflow({ systems: [], process_steps: [] });
    // A flaky/strict test instance must not block the user entirely.
    expect(workflow.meta.import_check).toBe('failed');
    expect(workflow.meta.import_error).toMatch(/still invalid/);
    expect(workflow.nodes.length).toBeGreaterThan(0);
  });

  it('marks import_check=skipped when no instance is configured', async () => {
    configure(false);
    createMock.mockResolvedValueOnce(completion(baseWorkflow()));
    const { workflow } = await generateN8nWorkflow({ systems: [], process_steps: [] });
    expect(workflow.meta.import_check).toBe('skipped');
  });
});

describe('shared-instance safety', () => {
  it('names the smoke-test workflow with an identifiable prefix', async () => {
    configure(true);
    const fetchMock = vi.fn(async () => jsonResponse(200, { id: 'wf_9' }));
    vi.stubGlobal('fetch', fetchMock);
    await verifyN8nImport({ ...baseWorkflow(), name: 'Shopify order sync' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.name).toBe('[vyrade-smoke-test] Shopify order sync');
  });

  it('never sends an active/enabled flag (import must not run anything)', async () => {
    configure(true);
    const fetchMock = vi.fn(async () => jsonResponse(200, { id: 'wf_9' }));
    vi.stubGlobal('fetch', fetchMock);
    await verifyN8nImport({ ...baseWorkflow(), active: true });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.active).toBeUndefined();
  });
});
