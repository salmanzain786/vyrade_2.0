/**
 * Reassessment / before-after (Phase 7.3).
 *
 * Diffs two persisted scan snapshots (from governance_scans) by finding identity
 * so the loop can PROVE it closed: what got resolved, what's new, what persists —
 * not just "a recommendation was made". A finding's identity is its type + node,
 * so the same issue on the same node is tracked across re-scans.
 */

export const findingKey = (f) => `${f.type}::${f.node || ''}`;

/**
 * @param {{current:{findings,readiness_pct,security_risk_level}, previous:same|null}} args
 */
export function diffScans({ current, previous } = {}) {
  const cur = Array.isArray(current?.findings) ? current.findings : [];
  const prev = Array.isArray(previous?.findings) ? previous.findings : [];
  const curMap = new Map(cur.map((f) => [findingKey(f), f]));
  const prevMap = new Map(prev.map((f) => [findingKey(f), f]));

  const resolved = [...prevMap].filter(([k]) => !curMap.has(k)).map(([, f]) => f);
  const added = [...curMap].filter(([k]) => !prevMap.has(k)).map(([, f]) => f);
  const persisting = [...curMap].filter(([k]) => prevMap.has(k)).map(([, f]) => f);

  const rd = Number.isFinite(current?.readiness_pct) && Number.isFinite(previous?.readiness_pct)
    ? current.readiness_pct - previous.readiness_pct : null;
  const risk_change = previous?.security_risk_level && current?.security_risk_level && previous.security_risk_level !== current.security_risk_level
    ? { from: previous.security_risk_level, to: current.security_risk_level } : null;

  return {
    has_previous: !!previous,
    resolved, new: added, persisting,
    counts: { resolved: resolved.length, new: added.length, persisting: persisting.length },
    readiness_delta: rd,
    risk_change,
    improved: rd != null ? rd > 0 : resolved.length > added.length,
  };
}

/**
 * Regression detection (ties 7.2 resolution tracking to 7.3 reassessment): a
 * finding a human marked `resolved` that reappears in the current scan.
 * @param {Array} currentFindings
 * @param {Record<string,{status:string}>} resolutions  keyed by findingKey
 */
export function detectRegressions(currentFindings = [], resolutions = {}) {
  return currentFindings.filter((f) => resolutions[findingKey(f)]?.status === 'resolved');
}

export default { findingKey, diffScans, detectRegressions };
