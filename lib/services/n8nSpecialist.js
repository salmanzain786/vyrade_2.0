import { client, MODEL, temperatureFor } from '../config/openai.js';
import { retrieveNodeContext } from './retrieval.js';

const SYSTEM_PROMPT = `You are Vyrade's n8n Specialist.

You convert a platform-neutral Automation Blueprint into a COMPLETE, valid,
importable n8n workflow. The Blueprint describes WHAT must happen; you decide
HOW to build it in n8n.

You are given RETRIEVED n8n NODE KNOWLEDGE (real nodes with their exact "type",
"typeVersion", and "parameters"). Treat it as your source of truth. Prefer node
types that appear in it and copy their parameter structure. Do not invent node
types n8n does not have. If a required capability is not covered, use the
closest standard node (e.g. n8n-nodes-base.httpRequest for an unlisted API,
n8n-nodes-base.if or n8n-nodes-base.switch for branching).

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

  for (const n of wf.nodes) {
    if (!n || !n.name) errors.push('every node must have a "name"');
    else if (!n.type) errors.push(`node "${n.name}" is missing a "type"`);
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
  return completion.choices[0].message.content;
}

/**
 * Section 24.1 — n8n Specialist. Retrieves node knowledge from Pinecone for
 * this Blueprint, asks the model to synthesize an importable n8n workflow
 * grounded in that knowledge, then validates structure and connections with a
 * bounded repair loop so the result is complete and correctly wired.
 */
export async function generateN8nWorkflow(bp, { maxRepairs = 2 } = {}) {
  const { chunks, matchCount, queryCount } = await retrieveNodeContext(bp, {
    topK: 6,
    maxChars: 18000,
  });

  const context = chunks.length > 0
    ? chunks.map((c, i) => `[node knowledge ${i + 1}]\n${c}`).join('\n\n')
    : '(no matching node documentation was retrieved from Pinecone)';

  const userPrompt = `AUTOMATION BLUEPRINT:
${JSON.stringify(bp, null, 2)}

RETRIEVED n8n NODE KNOWLEDGE:
${context}

Produce the complete, correctly-connected n8n workflow JSON for this Blueprint.`;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  let lastRaw = null;
  let lastErrors = null;

  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    if (attempt > 0) {
      messages.push({ role: 'assistant', content: lastRaw });
      messages.push({
        role: 'user',
        content: `The workflow you produced has these structural problems:\n- ${lastErrors.join('\n- ')}\n\nReturn a corrected COMPLETE workflow JSON that fixes every problem. Keep all valid nodes and connections; only fix what is broken.`,
      });
    }

    lastRaw = await callSpecialist(messages);
    const wf = parseWorkflow(lastRaw);
    const errors = validateWorkflow(wf);

    if (errors.length === 0) {
      wf.meta = {
        ...(wf.meta || {}),
        generated_by: 'vyrade-n8n-specialist',
        retrieved_doc_count: matchCount,
        retrieval_query_count: queryCount,
        repair_attempts: attempt,
      };
      return wf;
    }

    lastErrors = errors;
  }

  throw new Error(
    `n8n workflow failed structural validation after ${maxRepairs + 1} attempts. ` +
    `Last errors: ${lastErrors.join('; ')}`
  );
}
