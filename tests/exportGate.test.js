/**
 * The shared export gate — deterministic, DB-free. Mocks the blueprint
 * repository so runPlatformExport() sees a known blueprint, proving the gate
 * blocks incomplete/stale exports BEFORE any LLM/retrieval work runs, for
 * every platform including Make/Zapier.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { baseBlueprint } from './fixtures.js';

// Treat Make/Zapier as CONFIGURED so this suite isolates the *readiness* gate
// regardless of the CI environment. (When an index is missing, the separate
// "coming soon" availability check fires first — that path is proven in
// exportAvailability.test.js.) Both are 409 blocks; here we pin the readiness one.
process.env.PINECONE_MAKE_API_KEY = 'test-key';
process.env.PINECONE_MAKE_INDEX = 'makenodes';
process.env.PINECONE_ZAPIER_API_KEY = 'test-key';
process.env.PINECONE_ZAPIER_INDEX = 'zapiernodes';

let current; // what the mocked repo returns

vi.mock('../lib/services/blueprintRepository.js', () => ({
  getLatest: vi.fn(async () => current),
  getVersion: vi.fn(async () => current),
}));

// Guard: these must never be reached when the gate blocks.
const genWorkflow = vi.fn();
const genClaude = vi.fn();
vi.mock('../lib/services/blueprintService.js', () => ({
  generateWorkflow: (...a) => genWorkflow(...a),
  generateClaudePackage: (...a) => genClaude(...a),
}));

const { runPlatformExport } = await import('../lib/services/exportService.js');

const versioned = (bp, { is_current = true, version = 3, current_version = 3 } = {}) => ({
  blueprint: bp, version, is_current, current_version, status: 'x',
});

beforeEach(() => { genWorkflow.mockReset(); genClaude.mockReset(); });

describe('export gate — incomplete blueprint is blocked for ALL platforms', () => {
  const incomplete = baseBlueprint({ process_steps: [], systems: [] }); // missing essentials

  for (const platform of ['n8n', 'claude', 'make', 'zapier']) {
    it(`${platform} → 409 BlueprintNotReadyError, no generation attempted`, async () => {
      current = versioned(incomplete);
      const err = await runPlatformExport({ blueprintId: 'b1', platform }).catch((e) => e);
      expect(err?.name).toBe('BlueprintNotReadyError');
      expect(err?.statusCode).toBe(409);
      expect(genWorkflow).not.toHaveBeenCalled();
      expect(genClaude).not.toHaveBeenCalled();
    });
  }
});

describe('export gate — superseded version is blocked', () => {
  it('claude on a non-current version → 409 StaleVersionError', async () => {
    current = versioned(baseBlueprint(), { is_current: false, version: 2, current_version: 5 });
    const err = await runPlatformExport({ blueprintId: 'b1', version: 2, platform: 'claude' }).catch((e) => e);
    expect(err?.name).toBe('StaleVersionError');
    expect(err?.statusCode).toBe(409);
    expect(genClaude).not.toHaveBeenCalled();
  });
});

describe('export gate — complete + current passes the gate', () => {
  it('reaches generation for claude', async () => {
    current = versioned(baseBlueprint()); // baseBlueprint() is requirements_complete
    genClaude.mockResolvedValueOnce({ name: 'x', files: { 'README.md': '#' }, prompt: 'p' });

    const res = await runPlatformExport({ blueprintId: 'b1', platform: 'claude' });
    expect(genClaude).toHaveBeenCalledOnce();
    expect(res.kind).toBe('package');
  });
});
