/**
 * Connector registry (Work Intelligence, Phase 1.1). The pluggable seam: every
 * platform implements the same interface, so OAuth/scope/ingest code is written
 * once. ClickUp is the pilot (Phase 1.2); Asana/Monday/Jira/Trello are Phase 6
 * additions that only need a new entry here.
 */
import { clickupConnector } from './clickup.js';

export const CONNECTORS = { clickup: clickupConnector };
export const SUPPORTED_PLATFORMS = Object.keys(CONNECTORS);

export function getConnector(platform) {
  return CONNECTORS[platform] || null;
}

export default { CONNECTORS, SUPPORTED_PLATFORMS, getConnector };
