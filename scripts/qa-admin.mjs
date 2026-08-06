/**
 * Admin dashboard QA pass (milestone 3.8).
 *
 * Seeds KNOWN-BAD rows (a blocked/low-readiness blueprint, a failed generation +
 * import failure, a failing node, a doc gap, a blocked user, a cost spike, a
 * recommendation override, and a low-readiness/high-risk governance scan that
 * trips every Risk & Governance rollup row), then runs each REAL admin view
 * function and asserts the seeded rows surface. Prints evidence, cleans up,
 * exits non-zero on any miss.
 *
 *   node scripts/qa-admin.mjs            # seed → verify → clean up
 *   node scripts/qa-admin.mjs --keep     # leave the seed data in place
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const ID = {
  user: 'qa000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  bp: 'qa000000-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  session: 'qa000000-cccc-4ccc-8ccc-cccccccccccc',
  ver: 'qa000000-dddd-4ddd-8ddd-dddddddddddd',
  wf: 'qa000000-eeee-4eee-8eee-eeeeeeeeeeee',
  msg: 'qa000000-ffff-4fff-8fff-ffffffffffff',
  exp: 'qa000000-1111-4111-8111-111111111111',
};
const EMAIL = 'qa-admin-check@vyrade.test';
const NAME = 'QA — Broken Blueprint';
const NODE = 'n8n-nodes-base.qaFailNode';
const TOOL = 'QAFakeTool';

// Low-cost baseline users seeded ALONGSIDE the $9.99 spike so the spike check is
// self-contained on a CLEAN database. Without them the single spike row is the
// whole average and can never be ≥ 2× itself. With N baselines at ~$0.05 the
// window mean stays low, so $9.99 clears spikeFloor = max($0.50, 2×mean)
// deterministically no matter what else is (or isn't) in the DB.
const SPIKE_COST = 9.99;
const BASELINE_COST = 0.05;
const BASELINES = [1, 2, 3].map((i) => ({
  user: `qa000000-2222-4222-8222-00000000000${i}`,
  session: `qa000000-3333-4333-8333-00000000000${i}`,
  msg: `qa000000-4444-4444-8444-00000000000${i}`,
  email: `qa-baseline-${i}@vyrade.test`,
}));

const cfg = {
  host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
};

async function cleanup(c) {
  await c.query('DELETE FROM governance_scans WHERE blueprint_id = ?', [ID.bp]);
  await c.query('DELETE FROM export_runs WHERE blueprint_id = ?', [ID.bp]);
  await c.query('DELETE FROM operational_events WHERE blueprint_id = ? OR tool = ?', [ID.bp, TOOL]);
  await c.query('DELETE FROM conversation_messages WHERE session_id = ?', [ID.session]);
  await c.query('DELETE FROM conversations WHERE session_id = ?', [ID.session]);
  await c.query('DELETE FROM blueprint_workflows WHERE blueprint_id = ?', [ID.bp]);
  await c.query('DELETE FROM automation_blueprint_versions WHERE blueprint_id = ?', [ID.bp]);
  await c.query('DELETE FROM automation_blueprints WHERE id = ?', [ID.bp]);
  await c.query('DELETE FROM auth_attempts WHERE email = ?', [EMAIL]);
  await c.query('DELETE FROM users WHERE id = ?', [ID.user]);
  for (const b of BASELINES) {
    await c.query('DELETE FROM conversation_messages WHERE session_id = ?', [b.session]);
    await c.query('DELETE FROM conversations WHERE session_id = ?', [b.session]);
    await c.query('DELETE FROM users WHERE id = ?', [b.user]);
  }
}

async function seed(c) {
  await c.query('INSERT INTO users (id, name, email, password_hash, email_verified, is_admin) VALUES (?,?,?,?,1,0)',
    [ID.user, 'QA Admin Check', EMAIL, 'x']);
  await c.query('INSERT INTO automation_blueprints (id, session_id, user_id, current_version, status) VALUES (?,?,?,1,?)',
    [ID.bp, ID.session, ID.user, 'blocked']);
  await c.query('INSERT INTO automation_blueprint_versions (id, blueprint_id, version, schema_version, blueprint_json, readiness_json, created_by) VALUES (?,?,1,1,?,?,?)',
    [ID.ver, ID.bp, JSON.stringify({ name: NAME, systems: [{ name: TOOL }] }), JSON.stringify({ score: 12, status: 'blocked', blocking_unknowns: ['a', 'b'] }), 'qa']);
  await c.query('INSERT INTO blueprint_workflows (id, blueprint_id, blueprint_version, target, workflow_json) VALUES (?,?,1,?,?)',
    [ID.wf, ID.bp, 'n8n', JSON.stringify({ nodes: [], meta: { import_check: 'failed' } })]);
  // Known-bad operational events
  const oe = 'INSERT INTO operational_events (event_type, platform, blueprint_id, node_type, tool, error_category, severity) VALUES (?,?,?,?,?,?,?)';
  await c.query(oe, ['generation_failed', 'n8n', ID.bp, null, null, 'generation_error', 'error']);
  await c.query(oe, ['import_failed', 'n8n', ID.bp, NODE, null, 'qa_test', 'error']);
  await c.query(oe, ['doc_gap', 'n8n', ID.bp, null, TOOL, null, 'info']);
  // Blocked user (rate limit)
  await c.query('INSERT INTO auth_attempts (event, email, ip, user_id, outcome, reason) VALUES (?,?,?,?,?,?)',
    ['login', EMAIL, '203.0.113.99', ID.user, 'blocked', 'qa rate limit test']);
  // Cost spike — plus low-cost baseline users so the spike is a spike relative
  // to a real average on a clean database (not just relative to itself).
  await c.query('INSERT INTO conversations (session_id, user_id, title, total_tokens, total_cost_usd) VALUES (?,?,?,?,?)',
    [ID.session, ID.user, 'QA cost spike', 500000, SPIKE_COST]);
  await c.query('INSERT INTO conversation_messages (id, session_id, role, content, model, prompt_tokens, completion_tokens, total_tokens, cost_usd) VALUES (?,?,?,?,?,?,?,?,?)',
    [ID.msg, ID.session, 'assistant', 'qa', 'gpt-4o', 100000, 400000, 500000, SPIKE_COST]);
  for (const b of BASELINES) {
    await c.query('INSERT INTO users (id, name, email, password_hash, email_verified, is_admin) VALUES (?,?,?,?,1,0)',
      [b.user, 'QA Baseline', b.email, 'x']);
    await c.query('INSERT INTO conversations (session_id, user_id, title, total_tokens, total_cost_usd) VALUES (?,?,?,?,?)',
      [b.session, b.user, 'QA baseline', 1000, BASELINE_COST]);
    await c.query('INSERT INTO conversation_messages (id, session_id, role, content, model, prompt_tokens, completion_tokens, total_tokens, cost_usd) VALUES (?,?,?,?,?,?,?,?,?)',
      [b.msg, b.session, 'assistant', 'qa', 'gpt-4o', 500, 500, 1000, BASELINE_COST]);
  }
  // Recommendation override
  await c.query('INSERT INTO export_runs (id, blueprint_id, blueprint_version, user_id, selected_platform, kind, recommended_platform, followed_recommendation, is_recommendation_override, override_reason) VALUES (?,?,1,?,?,?,?,0,1,?)',
    [ID.exp, ID.bp, ID.user, 'zapier', 'workflow', 'n8n', 'user_selected_platform']);
  // Governance scan (Phase 8) — a low-readiness, high-risk scan whose findings
  // trip EVERY Risk & Governance rollup row (ownerless, sensitive data, missing
  // approval, outdated version, third-party processor).
  const govFindings = [
    { type: 'no_owner_assigned', severity: 'medium', title: 'No owner assigned', detail: 'qa', node: null },
    { type: 'pii_detected', severity: 'high', title: 'PII detected', detail: 'qa', node: 'Email node' },
    { type: 'policy_approval_missing', severity: 'high', title: 'Approval missing', detail: 'qa', node: null },
    { type: 'workflow_version_drift', severity: 'medium', title: 'Outdated Blueprint version', detail: 'qa', node: null },
    { type: 'third_party_processor', severity: 'low', title: 'Third-party processor', detail: 'qa', node: 'HTTP node' },
  ];
  await c.query(
    `INSERT INTO governance_scans (blueprint_id, user_id, platform, workflow_name, node_count, version_count, had_workflow,
       readiness_pct, readiness_band, security_risk_level, findings_total, worst_severity, manual_review_count,
       summary_json, findings_json, report_json, framework_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [ID.bp, ID.user, 'n8n', NAME, 5, 1, 1, 30, 'Weak', 'High', govFindings.length, 'high', 3,
     JSON.stringify({ total: 5 }), JSON.stringify(govFindings),
     JSON.stringify({ overall: { governance_readiness_pct: 30 } }), JSON.stringify({ frameworks: [] })]
  );
}

async function verify(c) {
  const B = await import('../lib/services/admin/adminBlueprintsRepository.js');
  const F = await import('../lib/services/admin/adminFailuresRepository.js');
  const K = await import('../lib/services/admin/adminCostRepository.js');
  const I = await import('../lib/services/insights/operationalInsightsRepository.js');
  const G = await import('../lib/services/admin/adminGovernanceRepository.js');

  const results = [];
  const check = (name, pass, detail) => results.push({ name, pass, detail });

  // 3.3 Blueprints — the blocked, low-readiness blueprint
  const bl = await B.listBlueprints({ search: 'QA — Broken' });
  const qbp = bl.rows.find((r) => r.name === NAME);
  check('Blueprints: blocked blueprint surfaces', !!qbp && qbp.status === 'blocked',
    qbp ? `status=${qbp.status} readiness=${qbp.readiness_score}%` : 'not found');
  check('Blueprints: low readiness score', qbp?.readiness_score === 12, `score=${qbp?.readiness_score}`);
  // 8.3 Governance column on the blueprints list
  check('Blueprints: governance column populated', qbp?.gov_readiness === 30 && qbp?.gov_risk === 'High',
    `gov=${qbp?.gov_readiness}% risk=${qbp?.gov_risk}`);

  // 8.2 Governance rollup — each Risk & Governance row surfaces the seeded scan
  const gv = await G.governanceRollup();
  const inRow = (key) => (gv.risk_items[key]?.blueprints || []).some((b) => b.id === ID.bp);
  check('Governance: QA blueprint counted as scanned', gv.scanned >= 1, `scanned=${gv.scanned}/${gv.total_blueprints}`);
  check('Governance: no-owner row surfaces QA', inRow('no_owner'), `count=${gv.risk_items.no_owner.count}`);
  check('Governance: sensitive-data row surfaces QA', inRow('sensitive_data'), `count=${gv.risk_items.sensitive_data.count}`);
  check('Governance: missing-approvals row surfaces QA', inRow('missing_approvals'), `count=${gv.risk_items.missing_approvals.count}`);
  check('Governance: outdated-outputs row surfaces QA', inRow('outdated_outputs'), `count=${gv.risk_items.outdated_outputs.count}`);
  check('Governance: processors-to-review row surfaces QA', inRow('processors_to_review'), `count=${gv.risk_items.processors_to_review.count}`);
  check('Governance: worst list includes low-readiness QA', gv.worst.some((w) => w.id === ID.bp && w.readiness_pct === 30),
    `worst has QA=${gv.worst.some((w) => w.id === ID.bp)}`);

  // 3.4 Failures — failed generation + import + failing node + failed verdict
  const fv = await F.getFailuresView({ days: 2 });
  check('Failures: generation_failed counted', fv.summary.generation_failed >= 1, `generation_failed=${fv.summary.generation_failed}`);
  check('Failures: import_failed counted', fv.summary.import_failed >= 1, `import_failed=${fv.summary.import_failed}`);
  check('Failures: import_check=failed verdict', fv.verdicts.failed >= 1, `failed verdicts=${fv.verdicts.failed}`);
  check('Failures: failing node in top list', fv.topFailingNodes.some((n) => n.node_type === NODE), `nodes=${fv.topFailingNodes.map((n) => n.node_type).join('|')}`);
  check('Failures: QA rows in recent feed', fv.recent.rows.some((r) => r.blueprint_name === NAME), `recent has QA=${fv.recent.rows.some((r) => r.blueprint_name === NAME)}`);

  // 3.5 Cost — spike user + blocked auth
  const cv = await K.getCostView({ days: 90 });
  const qu = cv.perUser.rows.find((u) => u.email === EMAIL);
  check('Cost: spike user flagged', !!qu && qu.spike === true, qu ? `cost=$${qu.cost.toFixed(2)} spike=${qu.spike}` : 'user not found');
  check('Cost: rate-limit block counted', cv.auth.blocked >= 1, `blocked=${cv.auth.blocked}`);

  // 3.6 Insights — doc gap + failing node
  const iv = await I.getInsightsSummary({ days: 2 });
  check('Insights: doc gap surfaces', iv.doc_gaps.some((g) => g.tool === TOOL), `gaps=${iv.doc_gaps.map((g) => g.tool).join('|')}`);
  check('Insights: failing node surfaces', iv.top_failing_nodes.some((n) => n.node_type === NODE), `nodes=${iv.top_failing_nodes.map((n) => n.node_type).join('|')}`);

  // Recommendation override — data present (queryable; overview tile TBD)
  const [[ov]] = await c.query('SELECT COUNT(*) n FROM export_runs WHERE is_recommendation_override = 1 AND blueprint_id = ?', [ID.bp]);
  check('Override: recorded in export_runs', Number(ov.n) >= 1, `override rows=${ov.n}`);

  return results;
}

async function main() {
  const keep = process.argv.includes('--keep');
  const c = await mysql.createConnection(cfg);
  let failed = 0;
  try {
    await cleanup(c);            // start clean
    await seed(c);
    const results = await verify(c);
    console.log('\nAdmin dashboard QA — seeded known-bad rows, verified each view:\n');
    for (const r of results) {
      console.log(`  ${r.pass ? '✓' : '✗'} ${r.name.padEnd(46)} ${r.detail}`);
      if (!r.pass) failed++;
    }
    console.log('');
  } finally {
    if (!keep) { await cleanup(c); console.log('Cleaned up QA seed data.'); }
    else console.log('Left QA seed data in place (--keep).');
    await c.end();
  }
  if (failed) { console.error(`\n✗ QA FAILED — ${failed} view(s) did not surface the seeded rows.`); process.exit(1); }
  console.log('\n✓ QA PASSED — every admin view surfaced its known-bad rows.');
  process.exit(0);
}

main().catch((err) => { console.error('qa-admin error:', err.message); process.exit(1); });
