/**
 * Workflow Encyclopedia — read repository for the public pages.
 *
 * Serves the /technology/[platform] and /workflows/[id] pages from the curated
 * `workflow_encyclopedia` table (canonical, non-low-quality by default), and
 * pulls the compact skeleton from the source table for detail pages.
 */
import { pool } from '../../config/db.js';
import { compactWorkflow } from '../workflowExampleRepository.js';

const SOURCE_TABLE = process.env.WORKFLOW_EXAMPLE_TABLE || 'n8n_node_workflows';
const asJson = (v) => {
  if (v == null) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return v;
};

const PLATFORM_LABELS = { n8n: 'n8n', make: 'Make.com', zapier: 'Zapier', claude: 'Claude Code' };
export const isKnownEncyclopediaPlatform = (p) => Object.prototype.hasOwnProperty.call(PLATFORM_LABELS, p);
export const platformLabel = (p) => PLATFORM_LABELS[p] || p;

function mapRow(r) {
  return {
    source_id: r.source_id,
    platform: r.platform,
    name: r.name || `Workflow ${r.source_id}`,
    category: r.category,
    category_label: r.category_label,
    integrations: asJson(r.integrations) || [],
    tags: asJson(r.tags) || [],
    trigger_type: r.trigger_type,
    complexity: r.complexity,
    node_count: r.node_count,
    quality_score: r.quality_score,
    quality_tier: r.quality_tier,
  };
}

/** Category counts for a platform (canonical, good-quality only). */
export async function getCategoryCounts(platform) {
  const [rows] = await pool.query(
    `SELECT category, category_label, COUNT(*) AS count
       FROM workflow_encyclopedia
      WHERE platform = ? AND is_canonical = 1 AND is_low_quality = 0
      GROUP BY category, category_label
      ORDER BY count DESC`,
    [platform]
  );
  return rows.map((r) => ({ category: r.category, label: r.category_label || r.category, count: Number(r.count) }));
}

/** Top ready-made workflows, optionally within a category. */
export async function getTopWorkflows(platform, { category = null, limit = 12, offset = 0 } = {}) {
  const where = ['platform = ?', 'is_canonical = 1', 'is_low_quality = 0'];
  const params = [platform];
  if (category) { where.push('category = ?'); params.push(category); }
  const [rows] = await pool.query(
    `SELECT source_id, platform, name, category, category_label, integrations, tags,
            trigger_type, complexity, node_count, quality_score, quality_tier
       FROM workflow_encyclopedia
      WHERE ${where.join(' AND ')}
      ORDER BY quality_score DESC, node_count DESC
      LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  return rows.map(mapRow);
}

/** Everything the /technology/[platform] landing page needs. */
export async function getTechnologyOverview(platform) {
  const [[stats]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(is_canonical = 1 AND is_low_quality = 0) AS ready
       FROM workflow_encyclopedia WHERE platform = ?`,
    [platform]
  );
  const [categories, top] = await Promise.all([
    getCategoryCounts(platform),
    getTopWorkflows(platform, { limit: 12 }),
  ]);
  return {
    platform,
    platform_label: platformLabel(platform),
    total_indexed: Number(stats?.total || 0),
    ready_count: Number(stats?.ready || 0),
    categories,
    top_workflows: top,
  };
}

/** One workflow's detail page: curated record + compact skeleton + siblings. */
export async function getWorkflowDetail(sourceId) {
  const id = Number(sourceId);
  if (!Number.isFinite(id)) return null;

  const [[row]] = await pool.query('SELECT * FROM workflow_encyclopedia WHERE source_id = ?', [id]);
  if (!row) return null;

  const [[src]] = await pool.query(
    `SELECT NAME, DESCRIPTION, WORKFLOW_JSON FROM \`${SOURCE_TABLE}\` WHERE ID = ?`,
    [id]
  );
  const skeleton = src?.WORKFLOW_JSON ? compactWorkflow(src.WORKFLOW_JSON, { maxChars: 3000 }) : null;

  const [similar] = await pool.query(
    `SELECT source_id, platform, name, category, category_label, integrations, tags,
            trigger_type, complexity, node_count, quality_score, quality_tier
       FROM workflow_encyclopedia
      WHERE platform = ? AND category = ? AND is_canonical = 1 AND is_low_quality = 0 AND source_id <> ?
      ORDER BY quality_score DESC LIMIT 6`,
    [row.platform, row.category, id]
  );

  return {
    ...mapRow(row),
    description: src?.DESCRIPTION || row.description || '',
    categories: asJson(row.categories) || [],
    blueprint_pattern: asJson(row.blueprint_pattern) || null,
    is_low_quality: !!row.is_low_quality,
    skeleton,
    similar: similar.map(mapRow),
  };
}

/** All platforms that actually have curated rows (for the index page). */
export async function getIndexedPlatforms() {
  const [rows] = await pool.query(
    `SELECT platform, COUNT(*) AS total,
            SUM(is_canonical = 1 AND is_low_quality = 0) AS ready
       FROM workflow_encyclopedia GROUP BY platform ORDER BY total DESC`
  );
  return rows.map((r) => ({ platform: r.platform, label: platformLabel(r.platform), total: Number(r.total), ready: Number(r.ready) }));
}

export default {
  getCategoryCounts, getTopWorkflows, getTechnologyOverview, getWorkflowDetail,
  getIndexedPlatforms, isKnownEncyclopediaPlatform, platformLabel,
};
