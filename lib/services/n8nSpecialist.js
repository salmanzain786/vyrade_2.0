import { client, MODEL, temperatureFor } from '../config/openai.js';
import { retrieveNodeContext, retrieveToolContext, retrieveWorkflowExamples } from './retrieval.js';
import { usageFromCompletion, mergeUsage, emptyUsage } from '../config/pricing.js';
import { verifyN8nImport } from './n8nImportVerifier.js';

const SYSTEM_PROMPT = `You are Vyrade's n8n Specialist.

You convert a platform-neutral Automation Blueprint into a COMPLETE, valid,
importable n8n workflow. The Blueprint describes WHAT must happen; you decide
HOW to build it in n8n.

You may be given RETRIEVED WORKFLOW EXAMPLES — real, working n8n workflows that
solved a similar problem, reduced to their structure (the nodes they use and how
they are wired). Use them as STRUCTURAL TEMPLATES: they show which node types
experienced builders pick for this kind of job, and how the graph is normally
shaped (trigger → fetch → branch → act → notify). Follow their patterns when
they fit the Blueprint. Do NOT copy an example wholesale, do not carry over
steps the Blueprint doesn't ask for, and never reuse their credentials, IDs, or
hardcoded values. The Blueprint always wins where the two disagree.

You are given RETRIEVED n8n NODE KNOWLEDGE (real nodes with their exact "type",
"typeVersion", and "parameters"). Treat it as your source of truth. Prefer node
types that appear in it and copy their parameter structure. Do not invent node
types n8n does not have. If a required capability is not covered, use the
closest standard node (e.g. n8n-nodes-base.httpRequest for an unlisted API,
n8n-nodes-base.if or n8n-nodes-base.switch for branching).

You may ALSO be given RETRIEVED VYRADE TOOLS — external tools exposed via an
HTTP API, each with its API documentation (endpoint/URL, method, auth, and
request parameters). When a retrieved tool is genuinely relevant to a required
step AND no first-class n8n node covers it well, add that tool to the workflow
as an "n8n-nodes-base.httpRequest" node configured FROM the tool's API docs:
- set the node's method and url to the tool's documented endpoint,
- add the documented headers/authentication (never invent secret values — use
  a placeholder credential/expression the user can fill, e.g.
  "={{ $credentials.apiKey }}" or "YOUR_API_KEY"),
- build the query/body parameters from the tool's documented request schema.
Prefer a native n8n node when one exists; use tool HTTP-request nodes only to
fill gaps the node knowledge does not cover. Never add a tool that isn't
relevant to a step in the Blueprint.

BUILD A DETAILED WORKFLOW:
- Start with exactly one trigger node that matches the Blueprint trigger
  (e.g. n8n-nodes-base.manualTrigger, webhook, scheduleTrigger, or a service
  *Trigger node). Trigger nodes have no incoming connection.
- Create one or more nodes for EVERY process step, business rule (branching),
  exception path, retry requirement, and notification in the Blueprint. Do not
  collapse distinct steps into one node.
- Represent routing/decisions with a Switch (multiple branches) or IF (two
  branches) node, wiring each branch to the correct downstream node.
- Model exception/failure paths as real branches, not comments.
- Give every node: a UNIQUE "name", a stable "id", a "type", a numeric
  "typeVersion", a "position" [x, y], and a "parameters" object. Lay nodes out
  left-to-right by increasing x (about 220 px apart) so the graph is readable.

CONNECTIONS FORMAT (critical — this is how n8n wires nodes):
"connections" is an object keyed by the SOURCE node's NAME. Each maps to:
  { "main": [ [ { "node": "<TARGET NODE NAME>", "type": "main", "index": 0 } ] ] }
- The outer "main" array is indexed by OUTPUT: an IF node uses index 0 = true,
  1 = false; a Switch uses one entry per output.
- Every node except the trigger MUST have at least one incoming connection, and
  every referenced node name MUST exactly match a node in "nodes".

Return ONLY a single JSON object with exactly these top-level keys:
  "name" (string), "nodes" (array), "connections" (object).
No markdown, no commentary — JSON only.

Minimal shape example (structure only — use real node types from the knowledge):
{
  "name": "Example",
  "nodes": [
    { "id": "1", "name": "On new lead", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [0,0], "parameters": {} },
    { "id": "2", "name": "Route by state", "type": "n8n-nodes-base.switch", "typeVersion": 3, "position": [220,0], "parameters": {} },
    { "id": "3", "name": "Assign Sarah", "type": "n8n-nodes-base.set", "typeVersion": 3, "position": [440,-80], "parameters": {} }
  ],
  "connections": {
    "On new lead": { "main": [[{ "node": "Route by state", "type": "main", "index": 0 }]] },
    "Route by state": { "main": [[{ "node": "Assign Sarah", "type": "main", "index": 0 }]] }
  }
}`;

const TRIGGER_RE = /trigger|webhook|cron|schedule/i;

/**
 * Structural validation of the generated workflow. Catches the failure modes
 * that make an n8n import broken or incomplete: missing metadata, duplicate
 * names, connections that reference non-existent nodes, no trigger, and orphan
 * nodes with no incoming wiring.
 */
export function validateWorkflow(wf) {
  const errors = [];

  if (!wf || !Array.isArray(wf.nodes) || wf.nodes.length === 0) {
    return ['workflow must have a non-empty "nodes" array'];
  }

  const names = wf.nodes.map((n) => n && n.name);
  const nameSet = new Set(names);
  if (nameSet.size !== names.length) errors.push('node "name" values must be unique');

  // Per-node field checks — the Specialist's own prompt promises all of these,
  // and n8n import rejects a node that is missing any of them.
  for (const n of wf.nodes) {
    if (!n || !n.name) { errors.push('every node must have a "name"'); continue; }
    if (!n.type) errors.push(`node "${n.name}" is missing a "type"`);
    if (typeof n.typeVersion !== 'number' || Number.isNaN(n.typeVersion)) {
      errors.push(`node "${n.name}" must have a numeric "typeVersion"`);
    }
    if (!Array.isArray(n.position) || n.position.length !== 2 ||
        !n.position.every((c) => typeof c === 'number' && !Number.isNaN(c))) {
      errors.push(`node "${n.name}" must have a "position" of [x, y] numbers`);
    }
    if (n.parameters === null || typeof n.parameters !== 'object' || Array.isArray(n.parameters)) {
      errors.push(`node "${n.name}" must have a "parameters" object`);
    }
  }

  const connections = wf.connections || {};
  const incoming = new Set();
  for (const [src, outputs] of Object.entries(connections)) {
    if (!nameSet.has(src)) errors.push(`connections reference unknown source node "${src}"`);
    const main = (outputs && outputs.main) || [];
    for (const branch of main) {
      for (const link of branch || []) {
        if (link && link.node) {
          if (!nameSet.has(link.node)) {
            errors.push(`connection from "${src}" targets unknown node "${link.node}"`);
          } else {
            incoming.add(link.node);
          }
        }
      }
    }
  }

  const triggers = wf.nodes.filter((n) => n && TRIGGER_RE.test(n.type || ''));
  if (triggers.length === 0) {
    errors.push('workflow has no trigger node (expected a *Trigger / webhook / schedule node)');
  } else if (triggers.length > 1) {
    // The prompt requires exactly one entry trigger; multiple entry points make
    // the graph ambiguous on import.
    errors.push(`workflow must have exactly one trigger node, found ${triggers.length}: ${triggers.map((n) => n.name).join(', ')}`);
  }

  for (const n of wf.nodes) {
    if (!n || !n.name) continue;
    const isTrigger = TRIGGER_RE.test(n.type || '');
    if (!isTrigger && !incoming.has(n.name)) {
      errors.push(`node "${n.name}" has no incoming connection (it is orphaned)`);
    }
  }

  return errors;
}

function parseWorkflow(raw) {
  let wf;
  try {
    wf = JSON.parse(raw);
  } catch (err) {
    throw new Error(`n8n Specialist returned invalid JSON: ${err.message}`);
  }
  return wf;
}

async function callSpecialist(messages) {
  const completion = await client.chat.completions.create({
    model: MODEL,
    ...temperatureFor(0),
    response_format: { type: 'json_object' },
    messages,
  });
  return {
    content: completion.choices[0].message.content,
    usage: usageFromCompletion(completion, MODEL),
  };
}

/**
 * Section 24.1 — n8n Specialist. Retrieves node knowledge from Pinecone for
 * this Blueprint, asks the model to synthesize an importable n8n workflow
 * grounded in that knowledge, then validates structure and connections with a
 * bounded repair loop so the result is complete and correctly wired.
 */
export async function generateN8nWorkflow(bp, { maxRepairs = 2 } = {}) {
  // Retrieve from all three sources in parallel: real workflow examples
  // (structure), n8n node knowledge (exact node specs), and Vyrade tools
  // (APIs to wire as HTTP nodes). Each is an isolated index.
  const [exampleCtx, nodeCtx, toolCtx] = await Promise.all([
    retrieveWorkflowExamples(bp, { limit: 3, maxChars: 5000 }),
    retrieveNodeContext(bp, { topK: 6, maxChars: 18000 }),
    retrieveToolContext(bp, { topK: 5, maxChars: 9000 }),
  ]);
  const { chunks, matchCount, queryCount } = nodeCtx;

  const context = chunks.length > 0
    ? chunks.map((c, i) => `[node knowledge ${i + 1}]\n${c}`).join('\n\n')
    : '(no matching node documentation was retrieved from Pinecone)';

  const toolContext = toolCtx.chunks.length > 0
    ? toolCtx.chunks.map((c, i) => `[tool ${i + 1}]\n${c}`).join('\n\n')
    : '(no matching Vyrade tools were retrieved)';

  const exampleContext = exampleCtx.examples.length > 0
    ? exampleCtx.examples
        .map((e, i) => `[example ${i + 1}] ${e.name}${e.description ? `\n${e.description}` : ''}\n${e.skeleton}`)
        .join('\n\n')
    : '(no similar workflow examples were retrieved)';

  // Examples come first: structure should inform node choice, not the reverse.
  const userPrompt = `AUTOMATION BLUEPRINT:
${JSON.stringify(bp, null, 2)}

RETRIEVED WORKFLOW EXAMPLES (real workflows for similar problems — use as structural templates, never copy verbatim):
${exampleContext}

RETRIEVED n8n NODE KNOWLEDGE:
${context}

RETRIEVED VYRADE TOOLS (external APIs — wire a relevant one as an httpRequest node):
${toolContext}

Produce the complete, correctly-connected n8n workflow JSON for this Blueprint.`;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  let lastRaw = null;
  let lastErrors = null;
  let usage = emptyUsage(MODEL);
  let lastWorkflow = null;      // structurally valid but rejected by n8n
  let lastImportError = null;

  const stampMeta = (wf, attempt, verdict) => ({
    ...(wf.meta || {}),
    generated_by: 'vyrade-n8n-specialist',
    retrieved_doc_count: matchCount,
    retrieval_query_count: queryCount,
    retrieved_tool_count: toolCtx.matchCount,
    retrieved_example_count: exampleCtx.examples.length,
    repair_attempts: attempt,
    // 'verified' = a real n8n accepted the import; 'skipped' = no test instance
    // configured (or it was unreachable); 'failed' = n8n rejected it.
    import_check: verdict.skipped ? 'skipped' : verdict.ok ? 'verified' : 'failed',
    ...(verdict.error && !verdict.ok ? { import_error: verdict.error } : {}),
  });

  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    if (attempt > 0) {
      messages.push({ role: 'assistant', content: lastRaw });
      messages.push({
        role: 'user',
        content: `The workflow you produced has these problems:\n- ${lastErrors.join('\n- ')}\n\nReturn a corrected COMPLETE workflow JSON that fixes every problem. Keep all valid nodes and connections; only fix what is broken.`,
      });
    }

    const call = await callSpecialist(messages);
    lastRaw = call.content;
    usage = mergeUsage(usage, call.usage);
    const wf = parseWorkflow(lastRaw);
    const errors = validateWorkflow(wf);

    if (errors.length > 0) {
      lastErrors = errors;
      continue;
    }

    // Structure is sound — now let a REAL n8n try to import it. Only n8n can
    // prove importability; structural rules are a proxy.
    const verdict = await verifyN8nImport(wf);
    if (verdict.ok) {
      wf.meta = stampMeta(wf, attempt, verdict);
      return { workflow: wf, usage };
    }

    // n8n rejected it — repair against the instance's own error message.
    lastWorkflow = wf;
    lastImportError = verdict.error;
    lastErrors = [`n8n rejected the import (HTTP ${verdict.status}): ${verdict.error}`];
  }

  // Out of attempts. A structurally valid workflow that n8n keeps rejecting is
  // still returned — clearly marked unverified — rather than failing the whole
  // request, so a strict/flaky test instance can't block the user.
  if (lastWorkflow) {
    lastWorkflow.meta = stampMeta(lastWorkflow, maxRepairs, { ok: false, error: lastImportError });
    return { workflow: lastWorkflow, usage };
  }

  throw new Error(
    `n8n workflow failed structural validation after ${maxRepairs + 1} attempts. ` +
    `Last errors: ${lastErrors.join('; ')}`
  );
}
