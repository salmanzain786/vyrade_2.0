/**
 * Operational Insights — retrieval (moat layer 3, the read side).
 *
 * Given a Blueprint, return the operational cautions the n8n specialist should
 * heed. Two sources, merged:
 *   1. CURATED seed  — hand-authored, useful on day 1 (operationalCautions.js).
 *   2. TELEMETRY     — real run/failure signals from operational_events:
 *                        • docGaps()        → tools that repeatedly lack docs
 *                        • topFailingNodes()→ node types that fail import a lot
 * The telemetry half is what makes this a learning loop — it grows sharper as
 * the system generates more workflows. Never throws: cautions are an
 * enhancement, so any DB hiccup degrades to the curated seed (or nothing).
 */
import { selectCautions, formatCautions } from './operationalCautions.js';
import { docGaps, topFailingNodes } from './operationalInsightsRepository.js';

const norm = (s) => String(s || '').toLowerCase().trim();
const short = (t) => norm(t).replace(/^n8n-nodes-base\./, '').replace(/^@n8n\/n8n-nodes-langchain\./, 'langchain.');

/** The integrations + action types a Blueprint touches. */
function blueprintSignals(bp) {
  const tools = (bp?.systems || []).map((s) => s?.name).filter(Boolean);
  const actionTypes = [...new Set((bp?.process_steps || []).map((s) => s?.action_type).filter(Boolean))];
  return { tools, actionTypes };
}

/**
 * @returns {Promise<{cautions: Array, block: string, curatedCount: number,
 *                    telemetryCount: number, available: boolean}>}
 */
export async function retrieveOperationalCautions(bp, { days = 30, max = 12 } = {}) {
  const { tools, actionTypes } = blueprintSignals(bp);

  // 1. Curated seed (pure, always available).
  const curated = selectCautions({ tools, actionTypes });

  // 2. Telemetry overlay (best-effort — the loop). Only surface signals that
  //    relate to THIS Blueprint's tools, plus the globally worst failing nodes.
  const telemetry = [];
  try {
    const toolSet = new Set(tools.map(norm));
    const [gaps, failing] = await Promise.all([
      docGaps({ days, limit: 20 }).catch(() => []),
      topFailingNodes({ days, limit: 8 }).catch(() => []),
    ]);

    for (const g of gaps) {
      if (g.gaps >= 2 && [...toolSet].some((t) => t && (norm(g.tool).includes(t) || t.includes(norm(g.tool))))) {
        telemetry.push({
          id: `telemetry:docgap:${norm(g.tool)}`, severity: 'info', category: 'doc_gap',
          caution: `Retrieval has repeatedly lacked complete docs for "${g.tool}" (${g.gaps} recent gaps).`,
          fix: `Verify ${g.tool} endpoints/auth explicitly rather than assuming a first-class node exists.`,
          source: 'telemetry',
        });
      }
    }
    for (const f of failing) {
      if (f.failures >= 3) {
        telemetry.push({
          id: `telemetry:failnode:${short(f.node_type)}`, severity: 'warning', category: 'import_failure',
          caution: `The "${short(f.node_type)}" node has failed n8n import ${f.failures} times recently.`,
          fix: `Double-check ${short(f.node_type)} required parameters and connections before finalising.`,
          source: 'telemetry',
        });
      }
    }
  } catch { /* telemetry is optional — fall through to curated only */ }

  // Merge (curated first — highest precision), dedupe by id, cap.
  const merged = [];
  const seen = new Set();
  for (const c of [...curated, ...telemetry]) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    merged.push(c);
    if (merged.length >= max) break;
  }

  return {
    cautions: merged,
    block: formatCautions(merged),
    curatedCount: curated.length,
    telemetryCount: telemetry.length,
    available: true,
  };
}

export default { retrieveOperationalCautions };
