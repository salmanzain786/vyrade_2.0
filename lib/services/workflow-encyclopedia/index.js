/**
 * Workflow Encyclopedia — orchestrator.
 *
 * `curateWorkflow` turns one raw DB row into a full curated record (analysis +
 * category + quality + fingerprint) — the unit the batch pipeline writes to the
 * curated table and the /technology/[platform] + workflow-detail pages read.
 *
 * `dedupeWorkflows` groups a set by structural fingerprint (exact duplicates)
 * and by near-duplicate similarity, so the encyclopedia shows one canonical
 * version of each pattern instead of thousands of copies.
 */
import { analyzeWorkflow, structuralSimilarity } from './workflowAnalyzer.js';
import { categorizeWorkflow } from './workflowCategorizer.js';
import { scoreWorkflowQuality } from './workflowQuality.js';

/**
 * @param {object} row  { id, name?, description?, workflow_json | workflowJson | WORKFLOW_JSON }
 * @param {string} [platform='n8n']
 * @returns {object} curated record ({ valid:false } if unusable)
 */
export function curateWorkflow(row, platform = 'n8n') {
  const id = row?.id ?? row?.ID ?? null;
  const name = row?.name ?? row?.NAME ?? '';
  const description = row?.description ?? row?.DESCRIPTION ?? '';
  const json = row?.workflow_json ?? row?.workflowJson ?? row?.WORKFLOW_JSON ?? null;

  const analysis = analyzeWorkflow(json, { name });
  if (!analysis) {
    return { id, platform, name, valid: false, reason: 'unparseable_or_empty' };
  }
  const category = categorizeWorkflow(analysis);
  const quality = scoreWorkflowQuality(analysis, { name });

  return {
    id,
    platform,
    name,
    description,
    valid: true,
    fingerprint: analysis.fingerprint,
    signature: analysis.structure_signature,
    category: category.category,
    category_label: category.category_label,
    categories: category.categories,
    tags: category.tags,
    integrations: analysis.integrations,
    trigger_type: analysis.trigger_type,
    complexity: analysis.complexity,
    node_count: analysis.node_count,
    quality_score: quality.score,
    quality_tier: quality.tier,
    is_low_quality: quality.is_low_quality,
    is_trivial: quality.is_trivial,
    quality_reasons: quality.reasons,
    blueprint_pattern: analysis.blueprint_pattern,
    analysis,
  };
}

/**
 * Group curated records into duplicate clusters.
 *  - exact duplicates: same fingerprint
 *  - within each remaining group, near-duplicates by structural similarity
 * The highest-quality record in a cluster is the `canonical`.
 *
 * @returns {{ canonical: object[], duplicates: object[], clusters: object[] }}
 */
export function dedupeWorkflows(records, { similarityThreshold = 0.9 } = {}) {
  const valid = records.filter((r) => r?.valid);

  // 1) Exact structural duplicates by fingerprint.
  const byFingerprint = new Map();
  for (const r of valid) {
    if (!byFingerprint.has(r.fingerprint)) byFingerprint.set(r.fingerprint, []);
    byFingerprint.get(r.fingerprint).push(r);
  }

  const clusters = [];
  const seeds = [];
  for (const group of byFingerprint.values()) {
    const canonical = group.slice().sort((a, b) => b.quality_score - a.quality_score)[0];
    clusters.push({ canonical, members: group, kind: group.length > 1 ? 'exact' : 'unique' });
    seeds.push(canonical);
  }

  // 2) Near-duplicate merge across fingerprint seeds (same category only, to
  // keep it cheap and meaningful).
  const merged = [];
  const used = new Set();
  for (let i = 0; i < seeds.length; i++) {
    if (used.has(i)) continue;
    const cluster = { canonical: seeds[i], near: [] };
    for (let j = i + 1; j < seeds.length; j++) {
      if (used.has(j)) continue;
      if (seeds[i].category !== seeds[j].category) continue;
      if (structuralSimilarity(seeds[i].analysis, seeds[j].analysis) >= similarityThreshold) {
        used.add(j);
        cluster.near.push(seeds[j]);
      }
    }
    // The best-quality record becomes canonical for the merged cluster.
    const all = [cluster.canonical, ...cluster.near].sort((a, b) => b.quality_score - a.quality_score);
    cluster.canonical = all[0];
    merged.push(cluster);
  }

  const canonical = merged.map((m) => m.canonical);
  const canonicalIds = new Set(canonical.map((c) => c.id));
  const duplicates = valid.filter((r) => !canonicalIds.has(r.id));

  return { canonical, duplicates, clusters };
}

export { analyzeWorkflow, categorizeWorkflow, scoreWorkflowQuality, structuralSimilarity };
export default { curateWorkflow, dedupeWorkflows };
