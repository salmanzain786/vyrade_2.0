// Shared export dispatcher (Task 11). One entry point that routes an Automation
// Blueprint to the correct exporter — n8n workflow, Claude package, or a
// Make/Zapier implementation guide — through a common interface. Adding a
// platform here does NOT duplicate the generation engine.

import { EXPORT_PLATFORMS, isKnownPlatform } from '../exporters/registry.js';
import { isMakeIndexConfigured, isZapierIndexConfigured } from '../config/pinecone.js';
import { retrieveMakeModules, retrieveZapierModules } from './retrieval.js';
import { buildPlatformGuide } from './makeExporter.js';
import { generateWorkflow, generateClaudePackage } from './blueprintService.js';
import * as repo from './blueprintRepository.js';

export class UnsupportedPlatformError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsupportedPlatformError';
    this.statusCode = 400;
  }
}

/** Current readiness per platform — depends on which isolated indexes exist. */
export function platformReadiness() {
  return {
    n8n: 'full',
    claude: 'full',
    make: isMakeIndexConfigured() ? 'guide' : 'coming_soon',
    zapier: isZapierIndexConfigured() ? 'guide' : 'coming_soon',
  };
}

/**
 * Run an export for the SELECTED platform. Make/Zapier can never run without an
 * explicit, known platform (enforced here). When a platform's importable schema
 * isn't available, an honest implementation guide is returned — never fake JSON.
 *
 * @returns { platform, name, kind, readiness, grounded?, files?, prompt?, workflow? }
 */
export async function runPlatformExport({ blueprintId, version = null, platform }) {
  if (!platform || !isKnownPlatform(platform)) {
    throw new UnsupportedPlatformError(`Select a valid export platform. Got: ${platform ?? '(none)'}`);
  }
  const meta = EXPORT_PLATFORMS[platform];
  const readiness = platformReadiness()[platform];

  if (platform === 'n8n') {
    const latest = version ? { version } : await repo.getLatest(blueprintId);
    if (!latest) throw new Error(`Blueprint not found: ${blueprintId}`);
    const { workflow } = await generateWorkflow({ blueprintId, version: latest.version });
    return { platform, name: meta.name, kind: 'workflow', readiness, workflow };
  }

  if (platform === 'claude') {
    const pkg = await generateClaudePackage({ blueprintId, version });
    return { platform, name: pkg.name, kind: 'package', readiness, files: pkg.files, prompt: pkg.prompt };
  }

  // Make / Zapier — always an implementation guide (grounded when the platform
  // index exists, generic otherwise). Never a hallucinated scenario/Zap file.
  const current = version ? await repo.getVersion(blueprintId, version) : await repo.getLatest(blueprintId);
  if (!current) throw new Error(`Blueprint not found: ${blueprintId}`);

  const modules = platform === 'make'
    ? await retrieveMakeModules(current.blueprint)
    : await retrieveZapierModules(current.blueprint);

  const { files, grounded } = buildPlatformGuide({
    bp: current.blueprint,
    platformName: meta.name,
    modules,
  });

  return { platform, name: current.blueprint?.name || 'automation', kind: 'guide', readiness, grounded, files };
}
