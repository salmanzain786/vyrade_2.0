/**
 * Progression-stage taxonomy (Phase 1.3) — the 9 stages a workflow idea moves
 * through, from first sighting to measured impact. Pure definitions; recording
 * lives in adoptionRepository.js (same append-only, best-effort pattern as
 * operational_events).
 *
 * Stages 1–6 are driven by real product events wired in Phase 1. Stages 7–9
 * (Implemented / Active / Measured) require explicit confirmation and are
 * advanced by Phase 3 (Implementation Tracking) — until then they stay at 0,
 * which the dashboard states honestly rather than inferring.
 */
export const STAGES = {
  DISCOVERED: 'discovered',
  CONSIDERED: 'considered',
  BLUEPRINT_STARTED: 'blueprint_started',
  BLUEPRINT_COMPLETE: 'blueprint_complete',
  ARCHITECTURE_SELECTED: 'architecture_selected',
  IMPLEMENTATION_PREPARED: 'implementation_prepared',
  IMPLEMENTED: 'implemented',
  ACTIVE: 'active',
  MEASURED: 'measured',
};

// Ordered — index = how far along the journey. Used for "furthest stage reached".
export const STAGE_ORDER = [
  STAGES.DISCOVERED, STAGES.CONSIDERED, STAGES.BLUEPRINT_STARTED, STAGES.BLUEPRINT_COMPLETE,
  STAGES.ARCHITECTURE_SELECTED, STAGES.IMPLEMENTATION_PREPARED, STAGES.IMPLEMENTED,
  STAGES.ACTIVE, STAGES.MEASURED,
];

export const STAGE_LABEL = {
  discovered: 'Discovered',
  considered: 'Considered',
  blueprint_started: 'Blueprint started',
  blueprint_complete: 'Blueprint complete',
  architecture_selected: 'Architecture selected',
  implementation_prepared: 'Implementation prepared',
  implemented: 'Implemented',
  active: 'Active',
  measured: 'Measured',
};

// Which stages are confirmation-only (Phase 3), so the UI can mark them.
export const CONFIRMATION_STAGES = new Set([STAGES.IMPLEMENTED, STAGES.ACTIVE, STAGES.MEASURED]);

export const stageIndex = (s) => STAGE_ORDER.indexOf(s);
export const isValidStage = (s) => STAGE_ORDER.includes(s);

export default { STAGES, STAGE_ORDER, STAGE_LABEL, CONFIRMATION_STAGES, stageIndex, isValidStage };
