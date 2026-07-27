/**
 * Curate the raw workflow DB into the Workflow Encyclopedia.
 *
 *   npm run curate:workflows
 *
 * Reads every row from n8n_node_workflows, runs it through the analysis engine
 * (categorize + quality-score + fingerprint), de-duplicates by structural
 * fingerprint (highest-quality wins as canonical), and upserts the curated
 * records into `workflow_encyclopedia`. Idempotent — safe to re-run.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { curateWorkflow } from '../lib/services/workflow-encyclopedia/index.js';

const SOURCE_TABLE = process.env.WORKFLOW_EXAMPLE_TABLE || 'n8n_node_workflows';
const CHUNK = 400;

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });

  console.log(`Reading ${SOURCE_TABLE}…`);
  const [rows] = await conn.query(
    `SELECT ID, NAME, DESCRIPTION, WORKFLOW_JSON FROM \`${SOURCE_TABLE}\`
      WHERE WORKFLOW_JSON IS NOT NULL AND LENGTH(WORKFLOW_JSON) > 100`
  );
  console.log(`  ${rows.length} candidate workflows.`);

  // 1) Analyze + categorize + quality-score.
  const curated = [];
  let invalid = 0;
  for (const r of rows) {
    const rec = curateWorkflow(r, 'n8n');
    if (rec.valid) curated.push(rec);
    else invalid += 1;
  }

  // 2) De-duplicate by structural fingerprint: the highest-quality row in each
  // fingerprint group is canonical; the rest point at it.
  const byFp = new Map();
  for (const r of curated) {
    if (!byFp.has(r.fingerprint)) byFp.set(r.fingerprint, []);
    byFp.get(r.fingerprint).push(r);
  }
  let canonicalCount = 0, duplicateCount = 0;
  for (const group of byFp.values()) {
    group.sort((a, b) => b.quality_score - a.quality_score);
    const canonical = group[0];
    for (const r of group) {
      r.is_canonical = r === canonical ? 1 : 0;
      r.duplicate_of = r === canonical ? null : canonical.id;
    }
    canonicalCount += 1;
    duplicateCount += group.length - 1;
  }

  // 3) Batch upsert.
  console.log('Writing workflow_encyclopedia…');
  const cols = [
    'source_id', 'platform', 'name', 'description', 'fingerprint', 'category',
    'category_label', 'categories', 'tags', 'integrations', 'integration_count',
    'trigger_type', 'complexity', 'node_count', 'quality_score', 'quality_tier',
    'is_low_quality', 'is_canonical', 'duplicate_of', 'blueprint_pattern',
  ];
  const j = (v) => JSON.stringify(v ?? null);
  const rowValues = (r) => [
    r.id, r.platform, (r.name || '').slice(0, 500), (r.description || '').slice(0, 4000),
    r.fingerprint, r.category, r.category_label, j(r.categories), j(r.tags),
    j(r.integrations), r.integrations.length, r.trigger_type, r.complexity, r.node_count,
    r.quality_score, r.quality_tier, r.is_low_quality ? 1 : 0, r.is_canonical,
    r.duplicate_of, j(r.blueprint_pattern),
  ];
  const updates = cols.filter((c) => c !== 'source_id').map((c) => `${c}=VALUES(${c})`).join(', ');

  let written = 0;
  for (let i = 0; i < curated.length; i += CHUNK) {
    const batch = curated.slice(i, i + CHUNK);
    const placeholders = batch.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
    const params = batch.flatMap(rowValues);
    await conn.query(
      `INSERT INTO workflow_encyclopedia (${cols.join(',')}) VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE ${updates}`,
      params
    );
    written += batch.length;
    process.stdout.write(`\r  ${written}/${curated.length}`);
  }
  process.stdout.write('\n');

  const lowQ = curated.filter((r) => r.is_low_quality).length;
  console.log('Done.');
  console.log(`  curated: ${curated.length} · invalid/skipped: ${invalid}`);
  console.log(`  distinct patterns: ${canonicalCount} · duplicates: ${duplicateCount}`);
  console.log(`  low-quality flagged: ${lowQ}`);
  await conn.end();
}

run().catch((err) => { console.error('Curation failed:', err); process.exit(1); });
