// Common exporter registry (Task 11). One place that describes every export
// target and the shape of its output, so n8n, Claude, Make, and Zapier all go
// through a shared interface instead of separate generation engines.
//
// Exporter contract (implemented in lib/services/exportService.js):
//   runPlatformExport({ blueprintId, version, platform }) -> {
//     platform, name, kind, readiness, files?, workflow?, prompt?, grounded?
//   }
//   kind:      'workflow' | 'package' | 'guide'
//   readiness: 'full' | 'guide' | 'coming_soon'
//
// This module is pure data (no server deps) so the UI can import it too.

export const READINESS = {
  FULL: 'full',            // real, importable export (n8n JSON, Claude package)
  GUIDE: 'guide',          // honest implementation guide (no importable file yet)
  COMING_SOON: 'coming_soon', // not available; do not run
};

export const EXPORT_PLATFORMS = {
  n8n:    { key: 'n8n',    name: 'n8n',         kind: 'workflow', baseReadiness: 'full' },
  claude: { key: 'claude', name: 'Claude Code', kind: 'package',  baseReadiness: 'full' },
  make:   { key: 'make',   name: 'Make.com',    kind: 'guide',    baseReadiness: 'guide' },
  zapier: { key: 'zapier', name: 'Zapier',      kind: 'guide',    baseReadiness: 'guide' },
};

export function isKnownPlatform(platform) {
  return Object.prototype.hasOwnProperty.call(EXPORT_PLATFORMS, platform);
}

// Human labels for the UI badge, per readiness.
export const READINESS_LABEL = {
  full: 'Full export',
  guide: 'Guide only',
  coming_soon: 'Coming soon',
};
