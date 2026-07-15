// Make / Zapier export foundation (Task 11). These platforms do NOT yet have a
// proven importable schema, so — per the task — we emit an honest, developer-
// ready IMPLEMENTATION GUIDE (markdown) grounded in the platform's own module
// catalog, never a hallucinated scenario/Zap JSON. Built only from the neutral
// Blueprint + the platform's isolated index, so no n8n node names appear.

const OP_PHRASE = {
  equals: 'is', not_equals: 'is not', in: 'is one of', not_in: 'is not one of',
  greater_than: '>', greater_or_equal: '>=', less_than: '<', less_or_equal: '<=',
  contains: 'contains', exists: 'exists',
};
const nn = (v) => (v === null || v === undefined || v === '' ? null : v);
const list = (a) => (Array.isArray(a) ? a : []);

function renderCondition(c) {
  if (!c) return '';
  const op = OP_PHRASE[c.operator] || c.operator;
  return `\`${c.field}\` ${op} ${list(c.value).map((v) => `\`${v}\``).join(', ')}`;
}

const modulesForSystem = (modules, systemName) => list(modules.perSystem?.[systemName]);

function moduleLine(rec) {
  const bits = [rec.app && `**${rec.app}**`, rec.action && `→ ${rec.action}`].filter(Boolean).join(' ');
  const extra = [rec.module && `\`${rec.module}\``, rec.type && `(${rec.type})`].filter(Boolean).join(' ');
  return `${bits}${extra ? ` — ${extra}` : ''}${rec.description ? `: ${rec.description}` : ''}`;
}

function readme(bp, platformName, grounded) {
  return `# ${bp.name || 'Automation'} — ${platformName} Implementation Guide

This is an **implementation guide** for building the automation in **${platformName}**.

> ⚠️ Vyrade does **not** yet emit an importable ${platformName} ${platformName === 'Make.com' ? 'scenario' : 'Zap'} file —
> ${platformName} export schema fidelity is not proven yet. This package is a
> platform-specific plan (recommended modules, data flow, rules, and tests), not
> a file you can import. Build the ${platformName === 'Make.com' ? 'scenario' : 'Zap'} by hand from this guide.

${grounded
    ? `Module recommendations below are drawn from the ${platformName} module catalog.`
    : `No ${platformName} module catalog is available, so module names are generic — replace them with the exact ${platformName} modules as you build.`}

## Contents
- \`README.md\` — this file
- \`implementation-guide.md\` — step-by-step ${platformName} build
- \`module-map.md\` — which ${platformName} app/module to use per system
- \`business-rules.md\` — rules, exceptions, retry, notifications
- \`connections.md\` — connections/credentials to set up
- \`acceptance-tests.md\` — tests derived from the Blueprint
`;
}

function implementationGuide(bp, platformName, modules) {
  const steps = list(bp.process_steps).slice().sort((a, b) => a.sequence - b.sequence);
  const systems = list(bp.systems).map((s) => s.name);
  const trig = bp.trigger || {};

  // Best-guess module for a step: match the step text to a system, use its top module.
  const pickModule = (text) => {
    const lower = String(text || '').toLowerCase();
    const sys = systems.find((n) => lower.includes(String(n).toLowerCase()));
    const rec = sys ? modulesForSystem(modules, sys)[0] : null;
    return rec ? ` → use ${rec.app ? `**${rec.app}**` : 'the relevant app'}${rec.action ? ` "${rec.action}"` : ''} module` : '';
  };

  const lines = [];
  lines.push(`1. **Trigger** — ${nn(trig.event) || nn(trig.trigger_type) || 'as specified'}${nn(trig.source_system) ? ` from ${trig.source_system}` : ''}.${pickModule(trig.source_system || trig.event)}`);
  steps.forEach((s, i) => {
    lines.push(`${i + 2}. ${s.action} _(${s.action_type})_${pickModule(s.action)}`);
  });

  return `# ${platformName} Implementation Guide

Build the ${platformName === 'Make.com' ? 'scenario' : 'Zap'} in this order:

${lines.join('\n')}

## Data mapping
Map fields between modules so each step receives what it needs:
${list(bp.data_inputs).map((d) => `- \`${d.field}\`${d.required ? ' (required)' : ''}${nn(d.source) ? ` — from ${d.source}` : ''}`).join('\n') || '- Map the trigger output fields into each downstream module.'}

## Human approval
${bp.human_approval?.required === true
    ? `Insert a manual approval / wait step before: ${list(bp.human_approval.approval_points).join(', ') || 'the affected step(s)'}.`
    : bp.human_approval?.required === false ? 'No human approval required — fully automated.' : 'Confirm whether human approval is needed.'}
`;
}

function moduleMap(bp, platformName, modules) {
  const blocks = list(bp.systems).map((s) => {
    const recs = modulesForSystem(modules, s.name).slice(0, 3);
    if (!modules.available || recs.length === 0) {
      return `### ${s.name} (${s.role})
No catalog entry available — use the **${s.name}** app's modules in ${platformName} directly, or a generic **HTTP / "Make an API call"** module against the ${s.name} API.`;
    }
    return `### ${s.name} (${s.role})
${recs.map((r) => `- ${moduleLine(r)}`).join('\n')}`;
  });
  return `# ${platformName} Module Map

Recommended ${platformName} modules per system in the Blueprint.

${blocks.join('\n\n') || '_No systems specified in the Blueprint._'}
`;
}

function businessRules(bp) {
  const rules = list(bp.business_rules);
  const exc = list(bp.exception_rules);
  const retry = list(bp.retry_requirements);
  const notif = list(bp.notification_rules);
  return `# Business Rules

## Decision rules
${rules.length ? rules.map((r) => `- When ${renderCondition(r.condition)} → **${r.result.action}** = \`${r.result.value}\``).join('\n') : '- None specified'}

## Exception handling
${exc.length ? exc.map((e) => `- **${e.scenario}:** ${e.behavior}`).join('\n') : '- None specified'}

## Retry policy
${retry.length ? retry.map((r) => `- **${r.system}:** retry up to **${r.max_retries}**×; on final failure → ${nn(r.after_final_failure) || 'stop'}`).join('\n') : '- None specified'}

## Notifications
${notif.length ? notif.map((n) => `- On **${n.condition}** (${n.event}): notify **${n.audience}** via **${n.channel_system}**`).join('\n') : '- None specified'}
`;
}

function connections(bp, platformName) {
  const systems = list(bp.systems);
  return `# Connections & Credentials

Create a ${platformName} connection for each app before running the ${platformName === 'Make.com' ? 'scenario' : 'Zap'}:

${systems.map((s) => `- **${s.name}** (${s.role}) — authorize ${platformName}'s ${s.name} connection with the required scopes.`).join('\n') || '- No external systems specified.'}

Store any API keys/tokens in the ${platformName} connection manager — never hard-code secrets.
`;
}

function acceptanceTests(bp, platformName) {
  const t = [];
  const trig = bp.trigger || {};
  t.push(`- [ ] **Trigger:** when ${nn(trig.event) || nn(trig.trigger_type) || 'the trigger'} occurs${nn(trig.source_system) ? ` in ${trig.source_system}` : ''}, the ${platformName === 'Make.com' ? 'scenario' : 'Zap'} runs.`);
  list(bp.business_rules).forEach((r) => t.push(`- [ ] **Rule:** given ${renderCondition(r.condition)}, the result is **${r.result.action}** = \`${r.result.value}\`.`));
  list(bp.exception_rules).forEach((e) => t.push(`- [ ] **Exception:** given "${e.scenario}", the system ${e.behavior}.`));
  list(bp.retry_requirements).forEach((r) => t.push(`- [ ] **Retry:** when **${r.system}** fails, it retries up to **${r.max_retries}**× then ${nn(r.after_final_failure) || 'stops'}.`));
  list(bp.notification_rules).forEach((n) => t.push(`- [ ] **Notification:** on **${n.condition}**, **${n.audience}** is notified via **${n.channel_system}**.`));
  if (bp.human_approval?.required === true) t.push(`- [ ] **Approval:** the ${platformName === 'Make.com' ? 'scenario' : 'Zap'} pauses for approval before ${list(bp.human_approval.approval_points).join(', ') || 'the affected step(s)'}.`);
  t.push(`- [ ] **End-to-end:** a representative input produces the desired outcome: ${nn(bp.business_intent?.desired_outcome) || 'as specified'}.`);
  return `# Acceptance Tests

Derived directly from the Blueprint's rules, exceptions, retry policy, and notifications.

${t.join('\n')}
`;
}

/**
 * Build the Make/Zapier implementation-guide package.
 * @returns {{ files: Record<string,string> }}
 */
export function buildPlatformGuide({ bp, platformName, modules = { perSystem: {}, all: [], available: false } }) {
  const grounded = !!modules.available;
  return {
    files: {
      'README.md': readme(bp, platformName, grounded),
      'implementation-guide.md': implementationGuide(bp, platformName, modules),
      'module-map.md': moduleMap(bp, platformName, modules),
      'business-rules.md': businessRules(bp),
      'connections.md': connections(bp, platformName),
      'acceptance-tests.md': acceptanceTests(bp, platformName),
    },
    grounded,
  };
}
