/**
 * Security detectors (Phase 1, milestones 1.3–1.6) over the shared WorkflowModel.
 * Platform-neutral: they read the normalized model, so the same checks apply to
 * n8n today and Make (1.2) once its parser lands.
 */
import { redactSecrets } from '../../security/redact.js';
import { SEVERITY, finding } from './model.js';

/** Collect every string value in an object tree (bounded). */
function collectStrings(obj, out = [], depth = 0) {
  if (depth > 8 || out.length > 500) return out;
  if (typeof obj === 'string') out.push(obj);
  else if (Array.isArray(obj)) for (const v of obj) collectStrings(v, out, depth + 1);
  else if (obj && typeof obj === 'object') for (const v of Object.values(obj)) collectStrings(v, out, depth + 1);
  return out;
}

const CREDENTIAL_SEVERITY = { PRIVATE_KEY: SEVERITY.CRITICAL, URL_PASSWORD: SEVERITY.HIGH };

// ── 1.3 Credentials / secrets ────────────────────────────────────────────────
export function detectCredentials(model) {
  const out = [];
  for (const node of model.nodes) {
    const json = safeStringify(node.parameters);
    const { redactions } = redactSecrets(json);
    const types = [...new Set(redactions)];

    for (const t of types) {
      if (t === 'URL_PASSWORD') {
        out.push(finding({
          type: 'embedded_url_password', severity: SEVERITY.HIGH,
          title: 'Password embedded in a connection URL',
          detail: `Node "${node.name}" hardcodes a password inside a connection string.`,
          node: node.name,
          remediation: 'Move the credential into the platform’s credential store and reference it, rather than inlining it in the URL.',
        }));
      } else if (t === 'SLACK_WEBHOOK') {
        out.push(finding({
          type: 'hardcoded_webhook_secret', severity: SEVERITY.MEDIUM,
          title: 'Incoming Slack webhook URL hardcoded',
          detail: `Node "${node.name}" contains a Slack webhook URL (itself a secret).`,
          node: node.name, manualReview: true,
          remediation: 'Store the webhook URL as a credential/secret rather than in the node parameters.',
        }));
      } else {
        out.push(finding({
          type: 'hardcoded_credential', severity: CREDENTIAL_SEVERITY[t] || SEVERITY.HIGH,
          title: `Hardcoded ${t.replace(/_/g, ' ').toLowerCase()} in a node`,
          detail: `Node "${node.name}" appears to contain a hardcoded ${t} secret in its parameters.`,
          node: node.name,
          remediation: 'Remove the literal secret and reference a stored credential instead.',
        }));
      }
    }

    // Insecure transport: any plain http:// URL in the parameters.
    const insecure = collectStrings(node.parameters).some((s) => /\bhttp:\/\/(?!localhost|127\.0\.0\.1)/i.test(s));
    if (insecure) {
      out.push(finding({
        type: 'insecure_http', severity: SEVERITY.MEDIUM,
        title: 'Insecure http:// endpoint',
        detail: `Node "${node.name}" calls a non-HTTPS (http://) endpoint — traffic (and any credentials) is unencrypted in transit.`,
        node: node.name,
        remediation: 'Use https:// for all external endpoints.',
      }));
    }
  }
  return out;
}

// ── 1.4 Access / exposure ────────────────────────────────────────────────────
export function detectAccess(model) {
  const out = [];
  for (const node of model.nodes) {
    if (!node.isWebhook) continue;
    const auth = String(node.parameters?.authentication ?? 'none').toLowerCase();
    if (auth === 'none' || auth === '') {
      out.push(finding({
        type: 'public_webhook_no_auth', severity: SEVERITY.HIGH,
        title: 'Public webhook without authentication',
        detail: `Webhook "${node.name}" accepts requests with no authentication — anyone who learns the URL can trigger the workflow.`,
        node: node.name,
        remediation: 'Enable header/basic/JWT auth on the webhook, or validate a shared secret before processing.',
      }));
    }
  }
  return out;
}

// ── 1.5 AI-specific risk ─────────────────────────────────────────────────────
export function detectAiRisk(model) {
  const out = [];
  const externalTrigger = model.nodes.some((n) => n.isWebhook || (n.isTrigger && n.isHttp));
  for (const node of model.nodes) {
    if (!node.isAI) continue;
    // Prompt-injection exposure: external input flows into an AI prompt (heuristic).
    const usesExpressions = collectStrings(node.parameters).some((s) => s.includes('{{') || s.includes('$json'));
    if (externalTrigger && usesExpressions) {
      out.push(finding({
        type: 'prompt_injection_exposure', severity: SEVERITY.MEDIUM,
        title: 'Untrusted input flows into an AI prompt',
        detail: `AI node "${node.name}" interpolates upstream data while the workflow has an external (webhook/HTTP) trigger — a prompt-injection vector.`,
        node: node.name, manualReview: true,
        remediation: 'Constrain/sanitize external input before the prompt, and prefer structured fields over free-text passthrough.',
      }));
    }
    // Unsafe tool/agent permissions (LangChain agents/tools).
    if (/agent|toolWorkflow|toolCode|mcp/i.test(node.type)) {
      out.push(finding({
        type: 'unsafe_ai_tool_permissions', severity: SEVERITY.MEDIUM,
        title: 'AI agent/tool permissions need review',
        detail: `Node "${node.name}" grants an AI agent tool access; overly broad tool/MCP permissions can let the model take unintended actions.`,
        node: node.name, manualReview: true,
        remediation: 'Scope the agent to the minimum tools required and review any code/HTTP tools it can call.',
      }));
    }
  }
  return out;
}

// ── 1.6 Remaining structural / security checks ───────────────────────────────
export function detectStructural(model) {
  const out = [];

  // Missing error handling on a workflow that has fail-prone nodes.
  const hasRiskyNode = model.nodes.some((n) => n.isHttp || n.isAI || n.app);
  if (hasRiskyNode && !model.hasErrorHandling) {
    out.push(finding({
      type: 'missing_error_handling', severity: SEVERITY.MEDIUM,
      title: 'No error handling configured',
      detail: 'The workflow calls external services but has no error trigger, error workflow, or continue-on-fail — failures pass silently.',
      node: null,
      remediation: 'Add an error workflow / error trigger, or set continue-on-fail with an explicit failure branch on risky nodes.',
    }));
  }

  for (const node of model.nodes) {
    if (node.isBrowser) {
      out.push(finding({
        type: 'browser_automation_risk', severity: SEVERITY.MEDIUM,
        title: 'Browser-automation node',
        detail: `Node "${node.name}" drives a headless browser — brittle, high-privilege, and often runs with a personal session.`,
        node: node.name, manualReview: true,
        remediation: 'Prefer an official API over browser automation; if unavoidable, isolate credentials and run in a sandboxed environment.',
      }));
    }
    // Personal-account credential dependency (conservative / manual-review).
    for (const cred of Object.values(node.credentials)) {
      const name = String(cred?.name || '');
      if (/personal|\bmy\b|@gmail\.|@yahoo\.|@outlook\.|@hotmail\./i.test(name)) {
        out.push(finding({
          type: 'personal_credential_dependency', severity: SEVERITY.LOW,
          title: 'Possible personal-account credential',
          detail: `Node "${node.name}" uses credential "${name}", which looks like a personal (not org-owned) account.`,
          node: node.name, manualReview: true,
          remediation: 'Move to an organisation-owned service account so the automation survives staff changes.',
        }));
      }
    }
  }
  return out;
}

export const DETECTORS = [detectCredentials, detectAccess, detectAiRisk, detectStructural];

function safeStringify(v) {
  try { return JSON.stringify(v); } catch { return ''; }
}
