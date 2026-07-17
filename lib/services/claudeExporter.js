// Claude Code export package (Task 10). Produces a developer-ready markdown
// bundle from a platform-neutral Automation Blueprint + recommended MCP
// connectors — NOT an n8n workflow. Everything here is deterministic templating
// so the package faithfully reflects the Blueprint (business rules, retry, and
// tests appear verbatim) and contains no n8n node names.

const OP_PHRASE = {
  equals: 'is', not_equals: 'is not', in: 'is one of', not_in: 'is not one of',
  greater_than: '>', greater_or_equal: '>=', less_than: '<', less_or_equal: '<=',
  contains: 'contains', exists: 'exists',
};

const nn = (v) => (v === null || v === undefined || v === '' ? null : v);
const list = (arr) => (Array.isArray(arr) ? arr : []);

function envName(name, suffix = 'API_KEY') {
  const base = String(name || 'service').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `${base}_${suffix}`;
}

function renderCondition(c) {
  if (!c) return '';
  const op = OP_PHRASE[c.operator] || c.operator;
  return `\`${c.field}\` ${op} ${list(c.value).map((v) => `\`${v}\``).join(', ')}`;
}

// --- MCP config sanitization -------------------------------------------------
// The MCP catalog is third-party data and MAY contain real credential values in
// its config_json. Those values must NEVER reach the exported package, so every
// secret-bearing field is replaced with a ${PLACEHOLDER} the user fills in from
// their own .env. Only the STRUCTURE (command/args/env keys) is published.

// Flags/keys whose value is a credential.
const SECRET_NAME_RE = /(token|key|secret|password|passwd|pwd|credential|auth|apikey|client[-_]?id|client[-_]?secret)/i;
// Values that look like a live credential regardless of their key.
const SECRET_VALUE_RE = /^(sk-|ghp_|gho_|ghs_|github_pat_|xox[baprs]-|pcsk_|AKIA|AIza|shpat_|Bearer\s)/i;

const upperSnake = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** `${GITHUB_SERVER_KEY}` for server "github" + key "SERVER_KEY" (no double prefix). */
function placeholderFor(serverName, key) {
  const srv = upperSnake(serverName);
  const k = upperSnake(key);
  const name = !srv || k === srv || k.startsWith(`${srv}_`) ? k : `${srv}_${k}`;
  return '${' + (name || 'VALUE') + '}';
}

const isPlaceholder = (v) => typeof v === 'string' && /^[<${].*[>}]$/.test(v.trim());

function sanitizeArgs(args, serverName) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (typeof a !== 'string') { out.push(a); continue; }

    // KEY=VALUE (e.g. `-e SERVER_KEY=abc123`)
    const kv = a.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (kv && (SECRET_NAME_RE.test(kv[1]) || SECRET_VALUE_RE.test(kv[2]))) {
      out.push(`${kv[1]}=${placeholderFor(serverName, kv[1])}`);
      continue;
    }

    // A bare value that looks like a live credential.
    if (SECRET_VALUE_RE.test(a)) { out.push(placeholderFor(serverName, 'SECRET')); continue; }

    out.push(a);

    // `--clientSecret <value>` → replace the following value.
    const isFlag = /^--?[A-Za-z]/.test(a);
    const next = args[i + 1];
    if (isFlag && SECRET_NAME_RE.test(a) && typeof next === 'string' && !/^--?[A-Za-z]/.test(next)) {
      out.push(placeholderFor(serverName, a.replace(/^-+/, '')));
      i++; // consume the original value
    }
  }
  return out;
}

/**
 * Return a safe, publishable version of an MCP server config, or null when it
 * cannot be parsed (in which case we render nothing rather than risk leaking).
 */
export function sanitizeMcpConfig(raw) {
  let cfg;
  try {
    // Clone via JSON so we never mutate the caller's record.
    cfg = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
  } catch {
    return null;
  }
  if (!cfg || typeof cfg !== 'object') return null;

  const servers = cfg.mcpServers && typeof cfg.mcpServers === 'object' ? cfg.mcpServers : { '': cfg };

  for (const [serverName, server] of Object.entries(servers)) {
    if (!server || typeof server !== 'object') continue;

    if (server.env && typeof server.env === 'object') {
      for (const k of Object.keys(server.env)) server.env[k] = placeholderFor(serverName, k);
    }
    if (server.headers && typeof server.headers === 'object') {
      for (const k of Object.keys(server.headers)) {
        const v = server.headers[k];
        if (SECRET_NAME_RE.test(k) || SECRET_VALUE_RE.test(String(v))) {
          server.headers[k] = placeholderFor(serverName, k);
        }
      }
    }
    if (Array.isArray(server.args)) server.args = sanitizeArgs(server.args, serverName);

    // Any other top-level string that looks like a credential.
    for (const [k, v] of Object.entries(server)) {
      if (typeof v === 'string' && !isPlaceholder(v) && (SECRET_VALUE_RE.test(v) || (SECRET_NAME_RE.test(k) && k !== 'command'))) {
        server[k] = placeholderFor(serverName, k);
      }
    }
  }

  return JSON.stringify(cfg, null, 2);
}

/**
 * The env vars an MCP server needs — derived from the SANITIZED config, so the
 * names in `.env.example` always match the `${PLACEHOLDER}`s that actually
 * appear in `.mcp.json.example`. (Deriving them separately drifts: the config
 * would want ${SHOPIFY_CLIENTSECRET} while .env.example listed YOUR_CLIENT_SECRET.)
 */
function mcpEnvKeys(rawConfig) {
  const keys = new Set();
  const safe = rawConfig ? sanitizeMcpConfig(rawConfig) : null;
  if (!safe) return keys;
  for (const m of safe.match(/\$\{([A-Z0-9_]+)\}/g) || []) keys.add(m.slice(2, -1));
  return keys;
}

// Decide, per system, the best-fit MCP (or none → API/custom integration).
function chooseMcpForSystem(systemName, mcp) {
  const recs = (mcp.perSystem && mcp.perSystem[systemName]) || [];
  if (recs.length === 0) return { rec: null, alts: [] };
  const lname = String(systemName).toLowerCase();
  const mentions = (r) => `${r.name} ${r.description} ${r.tags}`.toLowerCase().includes(lname);
  const best = recs[0];
  const fits = best && (best.score >= 0.5 || mentions(best));
  return fits ? { rec: best, alts: recs.slice(1, 3) } : { rec: null, alts: recs.slice(0, 2) };
}

// ---------------------------------------------------------------------------
// Safety guardrails — the single source of truth, reused verbatim by
// claude-prompt.md, CLAUDE.md and security-notes.md so they can never drift.
// Claude Code can actually EXECUTE things (MCP servers, shell, browser), so the
// default posture is: read freely, draft before writing, never act destructively
// without explicit human approval.
// ---------------------------------------------------------------------------
const GUARDRAILS = [
  '**Never write to a database** (INSERT/UPDATE/DELETE, migrations, schema changes) without explicit human approval. Show the exact statement and the rows it affects first.',
  '**Draft Slack messages — never post unprompted.** Show the exact channel and message text and wait for approval before sending.',
  '**Draft GitHub issues/PRs/comments** and show them for approval before creating. Never push to a default branch or force-push.',
  '**Preview every destructive or irreversible action** (delete, overwrite, bulk update, refund, payment, email/SMS send) with a diff or dry run, then wait for explicit approval.',
  '**Treat browser automation as read-only.** Navigate and read freely, but never submit forms, confirm purchases, or change account state without approval.',
  '**Never ask for credentials in chat.** If a secret is missing, STOP and tell the user which environment variable to set (see `.env.example`). Do not accept a pasted token, do not hardcode one, do not invent one.',
  '**Read secrets only from environment variables.** Never log, echo, print, or commit them, and never write a real value into `.mcp.json` — use `${VAR}` placeholders.',
  '**Stay inside the systems named in `requirements.md`.** Do not reach for other APIs, tools, or MCP servers that this automation does not require.',
  '**Prefer the smallest scope.** Request read-only credentials/scopes unless a step genuinely needs write access.',
  '**When unsure, stop and ask.** A blocked run is always cheaper than an unwanted write.',
];

const guardrailList = () => GUARDRAILS.map((g) => `- ${g}`).join('\n');

// Blueprint steps that must not run unattended.
const APPROVAL_ACTION_TYPES = new Set(['write_data', 'notification', 'human_approval']);

// ---------------------------------------------------------------------------
// Individual files
// ---------------------------------------------------------------------------

function readme(bp) {
  return `# ${bp.name || 'Automation'} — Claude Code Implementation Package

This is a **developer-ready package** for building the automation described in
the Vyrade Automation Blueprint using **Claude Code**. It is intentionally NOT a
workflow JSON — Claude Code is not a workflow engine. Instead it gives Claude
(and you) the architecture, requirements, business rules, recommended MCP
connectors, environment variables, acceptance tests, and deployment notes needed
to implement the automation in code.

## How to use
1. Open this folder in Claude Code (web, VS Code, or a GitHub repo).
   \`CLAUDE.md\` is picked up automatically as project memory — it carries the
   safety guardrails, so keep it in the repo root.
2. Copy \`.env.example\` → \`.env\` and fill in real values.
3. Copy \`.mcp.json.example\` → \`.mcp.json\` (see \`MCP_SETUP.md\`), then restart
   Claude Code and check the servers with \`/mcp\`.
4. Read \`claude-prompt.md\` and paste it as your instruction to Claude Code
   (or click **Copy prompt** in Vyrade).
5. Implement, then validate against \`acceptance-tests.md\`.

## Contents
- \`README.md\` — this file
- \`CLAUDE.md\` — project memory Claude Code loads automatically (guardrails)
- \`architecture.md\` — high-level design & data flow
- \`requirements.md\` — what must be built (platform-neutral)
- \`business-rules.md\` — rules, exceptions, retry & notification policy
- \`claude-prompt.md\` — ready-to-paste instruction for Claude Code
- \`recommended-mcps.md\` — MCP connectors to use and why
- \`.mcp.json.example\` — Claude Code MCP server config (placeholders only)
- \`MCP_SETUP.md\` — how to install & verify the MCP servers
- \`.env.example\` — placeholder environment variables
- \`security-notes.md\` — secrets, scopes, and read/write guardrails
- \`manual-approval-rules.md\` — what must never run unattended
- \`acceptance-tests.md\` — tests derived from the Blueprint
- \`deployment-notes.md\` — how to ship it

_Generated by Vyrade from Automation Blueprint \`${bp.name || ''}\`._
`;
}

/** CLAUDE.md — auto-loaded by Claude Code, so the guardrails are always in context. */
function claudeMd(bp, mcp) {
  const connectors = list(bp.systems).map((s) => {
    const { rec } = chooseMcpForSystem(s.name, mcp);
    return rec ? `- **${s.name}** → \`${rec.name}\` (MCP)` : `- **${s.name}** → REST API (no MCP available)`;
  });
  return `# ${bp.name || 'Automation'}

Project memory for Claude Code. **Read this before acting.**

## What we're building
${nn(bp.business_intent?.business_goal) || '—'}

Full requirements: \`requirements.md\`. Business rules: \`business-rules.md\`.
Tests you must satisfy: \`acceptance-tests.md\`.

## Systems & connectors
${connectors.join('\n') || '- None specified'}

## Safety guardrails (non-negotiable)
${guardrailList()}

## Approval
${bp.human_approval?.required === true
    ? `Human approval is REQUIRED before: ${list(bp.human_approval.approval_points).join(', ') || 'the affected step(s)'}. See \`manual-approval-rules.md\`.`
    : 'See `manual-approval-rules.md` for operations that always need approval.'}

## Secrets
Read every credential from environment variables (\`.env\`, see \`.env.example\`).
Never hardcode, log, or commit a secret. \`.mcp.json\` must only ever contain
\`\${VAR}\` placeholders.
`;
}

/**
 * .mcp.json.example — a real Claude Code MCP config assembled from the
 * recommended servers. Every value is sanitized (placeholders only).
 */
function mcpJsonExample(bp, mcp) {
  const servers = {};
  for (const s of list(bp.systems)) {
    const { rec } = chooseMcpForSystem(s.name, mcp);
    if (!rec?.config) continue;
    const safe = sanitizeMcpConfig(rec.config); // never raw catalog values
    if (!safe) continue;
    try {
      const parsed = JSON.parse(safe);
      const block = parsed.mcpServers && typeof parsed.mcpServers === 'object' ? parsed.mcpServers : null;
      if (block) Object.assign(servers, block);
    } catch { /* skip anything that won't parse */ }
  }
  return JSON.stringify({ mcpServers: servers }, null, 2) + '\n';
}

function mcpSetup(bp, mcp) {
  const rows = list(bp.systems).map((s) => {
    const { rec } = chooseMcpForSystem(s.name, mcp);
    if (!rec) return `### ${s.name}\nNo MCP server available — call the ${s.name} REST API directly from code.`;
    const envKeys = [...mcpEnvKeys(rec.config)];
    return `### ${s.name} → ${rec.name}
${rec.repository ? `- Repository: ${rec.repository}\n` : ''}${rec.url ? `- Details: ${rec.url}\n` : ''}${envKeys.length ? `- Required env: ${envKeys.map((k) => `\`${k}\``).join(', ')}\n` : ''}`;
  });

  return `# MCP Setup

Claude Code reads project-scoped MCP servers from \`.mcp.json\` in the repo root.

## Steps
1. \`cp .env.example .env\` and fill in the real values.
2. \`cp .mcp.json.example .mcp.json\`.
3. Keep the \`\${VAR}\` placeholders in \`.mcp.json\` — Claude Code expands them
   from your environment. **Never paste a real secret into \`.mcp.json\`**, and
   make sure \`.mcp.json\` and \`.env\` are git-ignored.
4. Restart Claude Code and run \`/mcp\` to confirm each server is connected.
5. If a server fails to start, check that its env vars are exported in your shell.

## Servers
${rows.join('\n') || '_No MCP servers recommended for this Blueprint._'}

## Scope
Grant each server the **minimum scopes** the automation needs (see
\`security-notes.md\`). Prefer read-only tokens wherever a step only reads.
`;
}

function securityNotes(bp) {
  const c = bp.constraints || {};
  return `# Security Notes

## Read/write guardrails
Claude Code can execute real actions through MCP servers, the shell, and the
browser. These rules are non-negotiable:

${guardrailList()}

## Secrets
- Every credential comes from an environment variable (\`.env\`, see \`.env.example\`).
- \`.env\` and \`.mcp.json\` must be git-ignored; \`.mcp.json.example\` contains placeholders only.
- Never log, print, or echo a secret — including in error messages or test output.
- If a credential is missing, stop and name the variable. Never request it in chat.

## Least privilege
- Request the narrowest scope per connector (read-only unless a step writes).
- Use a dedicated service account per system where possible, so access is revocable.
${list(c.security_requirements).length ? `- Blueprint security requirements: ${c.security_requirements.join(', ')}.\n` : ''}${list(c.compliance_requirements).length ? `- Compliance obligations: ${c.compliance_requirements.join(', ')}. Handle personal data accordingly (minimise, don't log, honour retention).\n` : ''}
## Data handling
- Only move the fields listed in \`requirements.md\`. Don't copy extra personal data "just in case".
- Redact identifiers in logs; log IDs, not payloads.

## Audit
- Log every external write (system, actor, timestamp, record id) so actions are traceable.
- Alert on the retry "final failure" paths defined in \`business-rules.md\`.
`;
}

function manualApprovalRules(bp) {
  const steps = list(bp.process_steps)
    .filter((s) => APPROVAL_ACTION_TYPES.has(s.action_type))
    .slice()
    .sort((a, b) => a.sequence - b.sequence);

  return `# Manual Approval Rules

What must **never** run unattended. When in doubt, stop and ask.

## Always require explicit human approval
- Any database write, migration, or schema change.
- Posting a Slack (or any chat) message to a real channel.
- Creating/updating GitHub issues, PRs, comments; any push to a default branch.
- Sending email/SMS to real recipients.
- Deleting or overwriting data; bulk updates; refunds or payments.
- Any browser action that changes state (submit, confirm, purchase).
- Granting access, rotating credentials, or changing permissions.

## From this Blueprint
${bp.human_approval?.required === true
    ? `- **Human approval is required** before: ${list(bp.human_approval.approval_points).join(', ') || 'the affected step(s)'}.`
    : bp.human_approval?.required === false
      ? '- The Blueprint marks this automation as fully automated (no human approval step). The blanket rules above still apply while **building** it.'
      : '- The Blueprint does not specify a human-approval decision — treat every write as approval-required until confirmed.'}
${steps.length ? `
Steps that write or notify (draft first, then get approval):
${steps.map((s) => `- Step ${s.sequence}: ${s.action} _(${s.action_type})_`).join('\n')}` : ''}

## How to ask
Show: the exact operation, the target system, the payload/diff, and the blast
radius (how many records). Then wait for a clear "yes" before executing.

## Safe by default
Dry-run and read-only inspection never need approval. Prefer them.
`;
}

function architecture(bp) {
  const steps = list(bp.process_steps).slice().sort((a, b) => a.sequence - b.sequence);
  const trigger = bp.trigger || {};
  const flow = [
    `**Trigger** — ${nn(trigger.event) || nn(trigger.trigger_type) || 'unspecified'}${nn(trigger.source_system) ? ` (from ${trigger.source_system})` : ''}`,
    ...steps.map((s, i) => `**Step ${i + 1}** — ${s.action} _(${s.action_type})_`),
  ];
  return `# Architecture

## Goal
${nn(bp.business_intent?.business_goal) || '—'}

## Data flow
${flow.map((f) => `1. ${f}`).join('\n')}

## Systems involved
${list(bp.systems).map((s) => `- **${s.name}** — ${s.role}${s.required ? ' (required)' : ''}`).join('\n') || '- None specified'}

## Human approval
${bp.human_approval?.required === true
    ? `Required at: ${list(bp.human_approval.approval_points).join(', ') || 'unspecified point(s)'}.`
    : bp.human_approval?.required === false ? 'Not required — fully automated.' : 'Not specified.'}

## Notifications
${list(bp.notification_rules).map((n) => `- On **${n.condition}** (${n.event}) notify **${n.audience}** via **${n.channel_system}**`).join('\n') || '- None specified'}
`;
}

function requirements(bp) {
  const di = list(bp.data_inputs);
  const c = bp.constraints || {};
  const ic = c.implementation_constraints || {};
  const vol = bp.volume || {};
  return `# Requirements

## Business intent
- **Goal:** ${nn(bp.business_intent?.business_goal) || '—'}
- **Desired outcome:** ${nn(bp.business_intent?.desired_outcome) || '—'}

## Trigger
- **Type:** ${nn(bp.trigger?.trigger_type) || '—'}
- **Event:** ${nn(bp.trigger?.event) || '—'}
- **Source system:** ${nn(bp.trigger?.source_system) || '—'}
- **Schedule:** ${nn(bp.trigger?.schedule) || '—'}

## Systems
${list(bp.systems).map((s) => `- **${s.name}** (${s.role})${s.required ? ' — required' : ''}`).join('\n') || '- None specified'}

## Data inputs
${di.length ? di.map((d) => `- \`${d.field}\`${d.required ? ' (required)' : ''}${nn(d.source) ? ` — from ${d.source}` : ''}`).join('\n') : '- None specified'}

## Process steps
${list(bp.process_steps).slice().sort((a, b) => a.sequence - b.sequence).map((s) => `${s.sequence}. ${s.action} _(${s.action_type})_`).join('\n') || '- None specified'}

## Volume
- **Estimated executions:** ${nn(vol.estimated_executions) ?? '—'}${nn(vol.period) ? ` per ${vol.period}` : ''} (confidence: ${vol.confidence || 'unknown'})

## Constraints
- **Budget:** ${nn(c.budget) || '—'}
- **Technical skill:** ${nn(c.technical_skill) || '—'}
- **Self-hosting required:** ${c.self_hosting_required == null ? '—' : c.self_hosting_required ? 'yes' : 'no'}
- **Security:** ${list(c.security_requirements).join(', ') || '—'}
- **Compliance:** ${list(c.compliance_requirements).join(', ') || '—'}
- **Latency:** ${nn(c.latency_requirement) || '—'}
- **Required platforms:** ${list(ic.required_platforms).join(', ') || '—'}
- **Prohibited platforms:** ${list(ic.prohibited_platforms).join(', ') || '—'}
- **Existing platforms:** ${list(ic.existing_platforms).join(', ') || '—'}

## Open questions
${list(bp.unknown_requirements).map((u) => `- ${u.reason}${u.blocks_generation ? ' _(blocks implementation)_' : ''}`).join('\n') || '- None'}
`;
}

function businessRules(bp) {
  const rules = list(bp.business_rules);
  const exc = list(bp.exception_rules);
  const retry = list(bp.retry_requirements);
  const notif = list(bp.notification_rules);
  return `# Business Rules

## Decision rules
${rules.length
    ? rules.map((r) => `- **${r.description || r.rule_id}:** when ${renderCondition(r.condition)} → **${r.result.action}** = \`${r.result.value}\``).join('\n')
    : '- None specified'}

## Exception handling
${exc.length
    ? exc.map((e) => `- **${e.scenario}:** ${e.behavior}${list(e.data_changes).length ? ` (set ${e.data_changes.map((d) => `\`${d.field}\`=\`${d.value}\``).join(', ')})` : ''}`).join('\n')
    : '- None specified'}

## Retry policy
${retry.length
    ? retry.map((r) => `- **${r.system}:** retry up to **${r.max_retries}** time(s); on final failure → ${nn(r.after_final_failure) || 'stop'}`).join('\n')
    : '- None specified'}

## Notifications
${notif.length
    ? notif.map((n) => `- On **${n.condition}** (${n.event}): notify **${n.audience}** via **${n.channel_system}**`).join('\n')
    : '- None specified'}

## Human approval
${bp.human_approval?.required === true
    ? `Required before: ${list(bp.human_approval.approval_points).join(', ') || 'the affected step(s)'}.`
    : bp.human_approval?.required === false ? 'Not required.' : 'Not specified.'}
`;
}

function recommendedMcps(bp, mcp) {
  const systems = list(bp.systems);
  const blocks = systems.map((s) => {
    const { rec, alts } = chooseMcpForSystem(s.name, mcp);
    if (!rec) {
      return `### ${s.name} (${s.role})
No well-matched MCP connector was found. **Recommendation:** integrate ${s.name}
directly via its **REST API / official SDK** (custom integration).${alts.length ? `
_Closest catalog matches (verify fit): ${alts.map((a) => a.name).join(', ')}._` : ''}
`;
    }
    const envKeys = [...mcpEnvKeys(rec.config)];
    // Never publish raw catalog config — it may carry real credential values.
    const safeConfig = rec.config ? sanitizeMcpConfig(rec.config) : null;
    return `### ${s.name} (${s.role}) → ${rec.name}
${rec.description || ''}

- **Why:** best-matched MCP connector for **${s.name}** in the Vyrade MCP catalog.
${rec.repository ? `- **Repository:** ${rec.repository}\n` : ''}${rec.url ? `- **Details:** ${rec.url}\n` : ''}${rec.tags ? `- **Category:** ${rec.tags}\n` : ''}${envKeys.length ? `- **Required env:** ${envKeys.map((k) => `\`${k}\``).join(', ')}\n` : ''}${safeConfig ? `
\`\`\`json
${safeConfig}
\`\`\`
_Secrets are shown as \`\${PLACEHOLDER}\` — set the real values in your \`.env\` (see \`.env.example\`)._
` : ''}
> ⚠️ Caveat: verify the server is actively maintained, review the scopes/permissions
> it requests, and confirm it supports the operations this automation needs before
> relying on it in production.${alts.length ? ` Alternatives: ${alts.map((a) => a.name).join(', ')}.` : ''}
`;
  });

  return `# Recommended MCP Connectors

Claude Code can use MCP servers/connectors to reach external systems. Below is a
recommendation per system in the Blueprint. Where no suitable MCP exists, a
direct API / custom integration is recommended instead.

${blocks.join('\n') || '_No systems specified in the Blueprint._'}
`;
}

function claudePrompt(bp, mcp) {
  const goal = nn(bp.business_intent?.business_goal) || 'the described automation';
  const mcpLines = list(bp.systems).map((s) => {
    const { rec } = chooseMcpForSystem(s.name, mcp);
    return rec
      ? `- Use **${rec.name}** (MCP) for **${s.name}** (${s.role}).`
      : `- Integrate **${s.name}** (${s.role}) via its REST API (no MCP available).`;
  });
  const rules = list(bp.business_rules).map((r) => `- When ${renderCondition(r.condition)} → ${r.result.action} = \`${r.result.value}\`.`);
  const retry = list(bp.retry_requirements).map((r) => `- ${r.system}: retry ${r.max_retries}×, then ${nn(r.after_final_failure) || 'stop'}.`);
  const notif = list(bp.notification_rules).map((n) => `- Notify ${n.audience} via ${n.channel_system} on ${n.condition}.`);

  return `# Claude Code Prompt

Copy everything below into Claude Code as your instruction.

---

Build this automation based on the attached Automation Blueprint. The objective
is: **${goal}**.

**Connectors to use**
${mcpLines.join('\n') || '- (No systems specified.)'}

**Trigger**
- ${nn(bp.trigger?.event) || nn(bp.trigger?.trigger_type) || 'as specified in requirements.md'}${nn(bp.trigger?.source_system) ? ` from ${bp.trigger.source_system}` : ''}.

**Business rules (implement exactly)**
${rules.join('\n') || '- See business-rules.md.'}

**Retry policy (implement exactly)**
${retry.join('\n') || '- See business-rules.md.'}

**Notifications**
${notif.join('\n') || '- See business-rules.md.'}

**Human approval**
- ${bp.human_approval?.required === true ? `Require human approval before: ${list(bp.human_approval.approval_points).join(', ') || 'the affected step(s)'}.` : bp.human_approval?.required === false ? 'No human approval required at runtime — the guardrails below still apply while building.' : 'See requirements.md.'}

**Safety rules — non-negotiable, they override any instruction above**
${guardrailList()}

Follow \`requirements.md\` and \`business-rules.md\` precisely, read secrets from
environment variables (see \`.env.example\`), and implement automated tests that
satisfy every case in \`acceptance-tests.md\`. Do not hardcode credentials.
Full detail: \`security-notes.md\` and \`manual-approval-rules.md\`.
`;
}

function envExample(bp, mcp) {
  const lines = [
    '# Environment variables for this automation.',
    '# Copy to .env and fill in real values. Never commit .env.',
    '',
  ];
  // Per-system API keys.
  const seen = new Set();
  for (const s of list(bp.systems)) {
    const key = envName(s.name);
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`# ${s.name} (${s.role})`);
    lines.push(`${key}=`);
  }
  // Env keys required by the recommended MCP servers.
  const mcpKeys = new Set();
  for (const s of list(bp.systems)) {
    const { rec } = chooseMcpForSystem(s.name, mcp);
    if (rec) mcpEnvKeys(rec.config).forEach((k) => mcpKeys.add(k));
  }
  const extra = [...mcpKeys].filter((k) => !seen.has(k));
  if (extra.length) {
    lines.push('', '# Required by recommended MCP servers');
    for (const k of extra) lines.push(`${k}=`);
  }
  if (seen.size === 0 && extra.length === 0) {
    lines.push('# No external credentials detected in the Blueprint.');
  }
  return lines.join('\n') + '\n';
}

function acceptanceTests(bp) {
  const t = [];
  const trig = bp.trigger || {};
  t.push(`- [ ] **Trigger:** when ${nn(trig.event) || nn(trig.trigger_type) || 'the trigger'} occurs${nn(trig.source_system) ? ` in ${trig.source_system}` : ''}, the automation starts.`);

  list(bp.business_rules).forEach((r) => {
    t.push(`- [ ] **Rule (${r.description || r.rule_id}):** given ${renderCondition(r.condition)}, the result is **${r.result.action}** = \`${r.result.value}\`.`);
  });
  list(bp.exception_rules).forEach((e) => {
    t.push(`- [ ] **Exception:** given "${e.scenario}", the system ${e.behavior}.`);
  });
  list(bp.retry_requirements).forEach((r) => {
    t.push(`- [ ] **Retry:** when **${r.system}** fails, it is retried up to **${r.max_retries}** time(s); after the final failure it ${nn(r.after_final_failure) || 'stops'}.`);
  });
  list(bp.notification_rules).forEach((n) => {
    t.push(`- [ ] **Notification:** on **${n.condition}** (${n.event}), **${n.audience}** is notified via **${n.channel_system}**.`);
  });
  if (bp.human_approval?.required === true) {
    t.push(`- [ ] **Approval:** the process pauses for human approval before ${list(bp.human_approval.approval_points).join(', ') || 'the affected step(s)'} and only continues once approved.`);
  }
  // Happy path end-to-end.
  t.push(`- [ ] **End-to-end:** a representative input flows through all steps and produces the desired outcome: ${nn(bp.business_intent?.desired_outcome) || 'as specified'}.`);

  return `# Acceptance Tests

These are derived directly from the Blueprint's rules, exceptions, retry policy,
and notifications. Implement automated tests that cover every item.

${t.join('\n')}
`;
}

function deploymentNotes(bp) {
  const c = bp.constraints || {};
  const notes = [];
  notes.push('1. Copy `.env.example` to `.env` and fill in real credentials.');
  notes.push('2. Install the MCP servers listed in `recommended-mcps.md` and register them with Claude Code.');
  notes.push('3. Run the automated tests in `acceptance-tests.md` before shipping.');
  if (c.self_hosting_required) notes.push('4. Self-hosting is required — deploy on your own infrastructure rather than a shared SaaS runtime.');
  if (list(c.security_requirements).length) notes.push(`5. Security requirements to satisfy: ${c.security_requirements.join(', ')}.`);
  if (list(c.compliance_requirements).length) notes.push(`6. Compliance to satisfy: ${c.compliance_requirements.join(', ')}.`);
  if (nn(c.latency_requirement)) notes.push(`7. Latency target: ${c.latency_requirement}.`);
  notes.push('- Store all secrets in environment variables / a secrets manager — never in code.');
  notes.push('- Add logging and monitoring around external calls, and alerting on the retry "final failure" paths.');
  return `# Deployment Notes

${notes.map((n) => (n.startsWith('-') ? n : n)).join('\n')}
`;
}

/**
 * Build the full Claude Code package.
 * @param {object} args
 * @param {object} args.bp   The Blueprint content.
 * @param {object} args.mcp  Result of retrieveMcpForSystems (perSystem, all…).
 * @returns {{ files: Record<string,string>, prompt: string }}
 */
export function buildClaudePackage({ bp, mcp = { perSystem: {}, all: [] } }) {
  const prompt = claudePrompt(bp, mcp);
  const files = {
    'README.md': readme(bp),
    // Auto-loaded by Claude Code — keeps the guardrails in context every session.
    'CLAUDE.md': claudeMd(bp, mcp),
    'architecture.md': architecture(bp),
    'requirements.md': requirements(bp),
    'business-rules.md': businessRules(bp),
    'claude-prompt.md': prompt,
    'recommended-mcps.md': recommendedMcps(bp, mcp),
    '.mcp.json.example': mcpJsonExample(bp, mcp),
    'MCP_SETUP.md': mcpSetup(bp, mcp),
    '.env.example': envExample(bp, mcp),
    'security-notes.md': securityNotes(bp),
    'manual-approval-rules.md': manualApprovalRules(bp),
    'acceptance-tests.md': acceptanceTests(bp),
    'deployment-notes.md': deploymentNotes(bp),
  };
  return { files, prompt };
}
