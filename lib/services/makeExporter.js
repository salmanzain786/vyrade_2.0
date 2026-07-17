// Make / Zapier export foundation (Task 11). Neither platform has a proven
// importable schema in Vyrade yet, so we emit an honest, developer-ready
// IMPLEMENTATION GUIDE (markdown) grounded in that platform's own isolated
// catalog — never a hallucinated scenario/Zap JSON.
//
// The two catalogs differ, and the guide reflects exactly what each one knows:
//   Make   → APP + ACTION rows (a real module catalog) → name the modules.
//   Zapier → APP records only (no actions/triggers)    → name the app, flag
//            premium/beta, and tell the builder to pick the trigger/action in
//            the Zap editor. We never invent Zapier action names.
//
// Built only from the neutral Blueprint + the platform catalog, so no n8n node
// names can appear.

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

const TERMS = {
  make: { flow: 'scenario', unit: 'module', mapFile: 'module-map.md', mapTitle: 'Module Map', catalog: 'module catalog' },
  zapier: { flow: 'Zap', unit: 'app', mapFile: 'app-map.md', mapTitle: 'App Map', catalog: 'app directory' },
};

/** Best catalog record for a system: needs a decent score or a name match. */
function bestFor(modules, systemName) {
  const recs = list(modules.perSystem?.[systemName]);
  if (recs.length === 0) return null;
  const lower = String(systemName).toLowerCase();
  const top = recs[0];
  const mentions = `${top.app || ''}`.toLowerCase().includes(lower) || lower.includes(`${top.app || ''}`.toLowerCase());
  return (top.score >= 0.55 || mentions) ? top : null;
}

function renderRecord(platform, rec) {
  if (platform === 'zapier') {
    const flags = [
      rec.premium && '**Premium app** (requires a paid Zapier plan)',
      rec.beta && 'Beta',
      rec.upcoming && 'Upcoming — not generally available yet',
    ].filter(Boolean);
    return `**${rec.app}**${rec.url ? ` — ${rec.url}` : ''}${flags.length ? `\n  - ⚠️ ${flags.join('; ')}` : ''}`;
  }
  const head = [rec.app && `**${rec.app}**`, rec.action && `→ ${rec.action}`].filter(Boolean).join(' ');
  const extra = [rec.module && `\`${rec.module}\``, rec.type && `(${rec.type})`].filter(Boolean).join(' ');
  return `${head}${extra ? ` — ${extra}` : ''}${rec.description ? `: ${rec.description}` : ''}`;
}

function readme(bp, platform, platformName, grounded) {
  const t = TERMS[platform];
  const catalogNote = grounded
    ? platform === 'zapier'
      ? `App recommendations come from the Zapier app directory. That directory lists **apps, not actions**, so this guide names the app to use and leaves the exact trigger/action for you to pick in the Zap editor.`
      : `Module recommendations are drawn from the Make.com ${t.catalog}.`
    : `No ${platformName} ${t.catalog} is available, so ${t.unit} names are generic — replace them with the exact ${platformName} ${t.unit}s as you build.`;

  return `# ${bp.name || 'Automation'} — ${platformName} Implementation Guide

This is an **implementation guide** for building the automation in **${platformName}**.

> ⚠️ Vyrade does **not** yet emit an importable ${platformName} ${t.flow} file —
> ${platformName} export schema fidelity is not proven yet. This package is a
> platform-specific plan (recommended ${t.unit}s, data flow, rules, and tests),
> not a file you can import. Build the ${t.flow} by hand from this guide.

${catalogNote}

## Contents
- \`README.md\` — this file
- \`implementation-guide.md\` — step-by-step ${platformName} build
- \`${t.mapFile}\` — which ${platformName} ${t.unit} to use per system
- \`business-rules.md\` — rules, exceptions, retry, notifications
- \`connections.md\` — connections/credentials to set up
- \`acceptance-tests.md\` — tests derived from the Blueprint
`;
}

function implementationGuide(bp, platform, platformName, modules) {
  const t = TERMS[platform];
  const steps = list(bp.process_steps).slice().sort((a, b) => a.sequence - b.sequence);
  const systems = list(bp.systems).map((s) => s.name);
  const trig = bp.trigger || {};

  // Best-guess catalog entry for a step: match its text to a system.
  const hint = (text) => {
    const lower = String(text || '').toLowerCase();
    const sys = systems.find((n) => lower.includes(String(n).toLowerCase()));
    const rec = sys ? bestFor(modules, sys) : null;
    if (!rec) return '';
    if (platform === 'zapier') return ` → use the **${rec.app}** app (choose the matching trigger/action in the Zap editor)`;
    return ` → use ${rec.app ? `**${rec.app}**` : 'the relevant app'}${rec.action ? ` "${rec.action}"` : ''} module`;
  };

  const lines = [];
  lines.push(`1. **Trigger** — ${nn(trig.event) || nn(trig.trigger_type) || 'as specified'}${nn(trig.source_system) ? ` from ${trig.source_system}` : ''}.${hint(trig.source_system || trig.event)}`);
  steps.forEach((s, i) => lines.push(`${i + 2}. ${s.action} _(${s.action_type})_${hint(s.action)}`));

  return `# ${platformName} Implementation Guide

Build the ${t.flow} in this order:

${lines.join('\n')}

## Data mapping
Map fields between ${t.unit}s so each step receives what it needs:
${list(bp.data_inputs).map((d) => `- \`${d.field}\`${d.required ? ' (required)' : ''}${nn(d.source) ? ` — from ${d.source}` : ''}`).join('\n') || `- Map the trigger output fields into each downstream ${t.unit}.`}

## Human approval
${bp.human_approval?.required === true
    ? `Insert a manual approval / wait step before: ${list(bp.human_approval.approval_points).join(', ') || 'the affected step(s)'}.`
    : bp.human_approval?.required === false ? 'No human approval required — fully automated.' : 'Confirm whether human approval is needed.'}
`;
}

function unitMap(bp, platform, platformName, modules) {
  const t = TERMS[platform];
  const blocks = list(bp.systems).map((s) => {
    const recs = list(modules.perSystem?.[s.name]);
    const best = bestFor(modules, s.name);
    if (!modules.available || !best) {
      return `### ${s.name} (${s.role})
No catalog match — search the ${platformName} ${t.catalog} for **${s.name}**, or use a generic **${platform === 'zapier' ? 'Webhooks by Zapier' : 'HTTP / "Make an API call"'}** ${t.unit} against the ${s.name} API.`;
    }
    if (platform === 'zapier') {
      return `### ${s.name} (${s.role})
- ${renderRecord(platform, best)}
  - Pick the trigger/action inside the Zap editor — the directory does not expose action names.`;
    }
    return `### ${s.name} (${s.role})
${recs.slice(0, 3).map((r) => `- ${renderRecord(platform, r)}`).join('\n')}`;
  });

  return `# ${platformName} ${t.mapTitle}

Recommended ${platformName} ${t.unit}s per system in the Blueprint.

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

function connections(bp, platform, platformName, modules) {
  const t = TERMS[platform];
  const systems = list(bp.systems);
  const premium = platform === 'zapier'
    ? systems.map((s) => bestFor(modules, s.name)).filter((r) => r?.premium)
    : [];
  return `# Connections & Credentials

Create a ${platformName} connection for each app before running the ${t.flow}:

${systems.map((s) => `- **${s.name}** (${s.role}) — authorize ${platformName}'s ${s.name} connection with the required scopes.`).join('\n') || '- No external systems specified.'}
${premium.length ? `
> ⚠️ **Paid plan required:** ${premium.map((r) => r.app).join(', ')} ${premium.length > 1 ? 'are Premium Zapier apps' : 'is a Premium Zapier app'} — a paid Zapier plan is needed to use ${premium.length > 1 ? 'them' : 'it'}.
` : ''}
Store any API keys/tokens in the ${platformName} connection manager — never hard-code secrets.
`;
}

function acceptanceTests(bp, platform, platformName) {
  const t = TERMS[platform];
  const tests = [];
  const trig = bp.trigger || {};
  tests.push(`- [ ] **Trigger:** when ${nn(trig.event) || nn(trig.trigger_type) || 'the trigger'} occurs${nn(trig.source_system) ? ` in ${trig.source_system}` : ''}, the ${t.flow} runs.`);
  list(bp.business_rules).forEach((r) => tests.push(`- [ ] **Rule:** given ${renderCondition(r.condition)}, the result is **${r.result.action}** = \`${r.result.value}\`.`));
  list(bp.exception_rules).forEach((e) => tests.push(`- [ ] **Exception:** given "${e.scenario}", the system ${e.behavior}.`));
  list(bp.retry_requirements).forEach((r) => tests.push(`- [ ] **Retry:** when **${r.system}** fails, it retries up to **${r.max_retries}**× then ${nn(r.after_final_failure) || 'stops'}.`));
  list(bp.notification_rules).forEach((n) => tests.push(`- [ ] **Notification:** on **${n.condition}**, **${n.audience}** is notified via **${n.channel_system}**.`));
  if (bp.human_approval?.required === true) tests.push(`- [ ] **Approval:** the ${t.flow} pauses for approval before ${list(bp.human_approval.approval_points).join(', ') || 'the affected step(s)'}.`);
  tests.push(`- [ ] **End-to-end:** a representative input produces the desired outcome: ${nn(bp.business_intent?.desired_outcome) || 'as specified'}.`);
  return `# Acceptance Tests

Derived directly from the Blueprint's rules, exceptions, retry policy, and notifications.

${tests.join('\n')}
`;
}

/**
 * Build the Make/Zapier implementation-guide package.
 * @param {object} args
 * @param {object} args.bp            Blueprint content.
 * @param {'make'|'zapier'} args.platform
 * @param {string} args.platformName  Display name.
 * @param {object} args.modules       Result of retrieveMake/ZapierModules.
 * @returns {{ files: Record<string,string>, grounded: boolean }}
 */
export function buildPlatformGuide({ bp, platform = 'make', platformName, modules = { perSystem: {}, all: [], available: false } }) {
  const t = TERMS[platform] || TERMS.make;
  const grounded = !!modules.available;
  return {
    files: {
      'README.md': readme(bp, platform, platformName, grounded),
      'implementation-guide.md': implementationGuide(bp, platform, platformName, modules),
      [t.mapFile]: unitMap(bp, platform, platformName, modules),
      'business-rules.md': businessRules(bp),
      'connections.md': connections(bp, platform, platformName, modules),
      'acceptance-tests.md': acceptanceTests(bp, platform, platformName),
    },
    grounded,
  };
}
