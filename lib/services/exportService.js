// Shared export dispatcher (Task 11). One entry point that routes an Automation
// Blueprint to the correct exporter — n8n workflow, Claude package, or a
// Make/Zapier implementation guide — through a common interface. Adding a
// platform here does NOT duplicate the generation engine.

import { EXPORT_PLATFORMS, isKnownPlatform } from '../exporters/registry.js';
import { isMakeIndexConfigured, isZapierIndexConfigured } from '../config/pinecone.js';
import { retrieveMakeModules, retrieveZapierModules } from './retrieval.js';
import { buildPlatformGuide } from './makeExporter.js';
import { generateWorkflow, generateClaudePackage } from './blueprintService.js';
import { checkReadiness } from './readiness.js';
import { BlueprintNotReadyError, StaleVersionError } from './blueprintErrors.js';
import * as repo from './blueprintRepository.js';

export class UnsupportedPlatformError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsupportedPlatformError';
    this.statusCode = 400;
  }
}

/** A known platform that isn't available yet (no catalog/index configured). */
export class PlatformUnavailableError extends Error {
  constructor(platform, name) {
    super(
      `${name} export is not available yet — no ${name} catalog is configured. ` +
      `Pass allow_generic=true to get a generic (uncatalogued) implementation guide instead.`
    );
    this.name = 'PlatformUnavailableError';
    this.statusCode = 409;
    this.platform = platform;
    this.readiness = 'coming_soon';
  }
}

/**
 * One rule for platform availability, so the UI and the API can never disagree:
 *   readiness 'full'/'guide' → export runs.
 *   readiness 'coming_soon'  → refuse, UNLESS the caller explicitly opts into a
 *                              generic guide with allow_generic=true.
 * Exported (and pure) so it can be unit-tested without a database.
 */
export function assertPlatformAvailable({ platform, name, readiness, allowGeneric = false }) {
  if (readiness === 'coming_soon' && !allowGeneric) {
    throw new PlatformUnavailableError(platform, name);
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
export async function runPlatformExport({
  blueprintId, version = null, platform, allowHistorical = false, allowGeneric = false,
}) {
  if (!platform || !isKnownPlatform(platform)) {
    throw new UnsupportedPlatformError(`Select a valid export platform. Got: ${platform ?? '(none)'}`);
  }
  const meta = EXPORT_PLATFORMS[platform];
  const readiness = platformReadiness()[platform];

  // A "coming soon" platform must refuse here — otherwise the UI would disable
  // it while the API happily produced a guide. Fail fast, before any DB/LLM work.
  assertPlatformAvailable({ platform, name: meta.name, readiness, allowGeneric });

  // ---- Shared gate: identical rules for EVERY platform -------------------
  // Previously only n8n was gated (inside generateWorkflow), so a Claude/Make/
  // Zapier export could be produced from an incomplete or superseded Blueprint.
  const current = version ? await repo.getVersion(blueprintId, version) : await repo.getLatest(blueprintId);
  if (!current) throw new Error(`Blueprint not found: ${blueprintId}`);

  // 1) Must be the current version unless historical export is explicitly asked for.
  if (!current.is_current && !allowHistorical) {
    throw new StaleVersionError(current.version, current.current_version);
  }

  // 2) Re-derive readiness from the content — never trust a stored snapshot.
  const check = checkReadiness(current.blueprint);
  if (check.status !== 'requirements_complete') {
    throw new BlueprintNotReadyError(check.status, check.blocking_unknowns);
  }
  // -----------------------------------------------------------------------

  if (platform === 'n8n') {
    const { workflow } = await generateWorkflow({ blueprintId, version: current.version });
    return { platform, name: meta.name, kind: 'workflow', readiness, workflow };
  }

  if (platform === 'claude') {
    const pkg = await generateClaudePackage({ blueprintId, version: current.version });
    return { platform, name: pkg.name, kind: 'package', readiness, files: pkg.files, prompt: pkg.prompt };
  }

  // Make / Zapier — always an implementation guide (grounded when the platform
  // index exists, generic otherwise). Never a hallucinated scenario/Zap file.
  const modules = platform === 'make'
    ? await retrieveMakeModules(current.blueprint)
    : await retrieveZapierModules(current.blueprint);

  const { files, grounded } = buildPlatformGuide({
    bp: current.blueprint,
    platform,
    platformName: meta.name,
    modules,
  });

  return { platform, name: current.blueprint?.name || 'automation', kind: 'guide', readiness, grounded, files };
}
