import { describe, it, expect } from 'vitest';
import { scanWorkflow } from '../lib/services/scanner/scan.js';
import { parseN8n } from '../lib/services/scanner/n8nParser.js';

const clean = {
  name: 'Nightly cleanup',
  nodes: [
    { id: '1', name: 'Schedule', type: 'n8n-nodes-base.scheduleTrigger', parameters: {} },
    { id: '2', name: 'Set', type: 'n8n-nodes-base.set', parameters: { value: 'ok' } },
  ],
  connections: { Schedule: { main: [[{ node: 'Set' }]] } },
};

const vulnerable = {
  name: 'Lead intake',
  nodes: [
    { id: '1', name: 'Hook', type: 'n8n-nodes-base.webhook', parameters: { authentication: 'none' } },
    { id: '2', name: 'Call', type: 'n8n-nodes-base.httpRequest',
      parameters: { url: 'http://api.example.com/x', headerParameters: { Authorization: 'Bearer sk-ant-ABCDEFGHIJ1234567890' } } },
    { id: '3', name: 'AI', type: '@n8n/n8n-nodes-langchain.openAi', parameters: { prompt: 'Summarize {{$json.body}}' } },
    { id: '4', name: 'Scrape', type: 'n8n-nodes-base.puppeteer', parameters: {} },
  ],
  connections: { Hook: { main: [[{ node: 'Call' }]] }, Call: { main: [[{ node: 'AI' }]] }, AI: { main: [[{ node: 'Scrape' }]] } },
};

describe('scanWorkflow — n8n (Phase 1)', () => {
  it('a clean, internal-only workflow yields no findings', () => {
    const r = scanWorkflow({ workflow: clean });
    expect(r.findings).toHaveLength(0);
    expect(r.summary.risk_level).toBe('Low');
    expect(r.node_count).toBe(2);
  });

  it('flags every category on a vulnerable workflow', () => {
    const r = scanWorkflow({ workflow: vulnerable });
    const types = new Set(r.findings.map((f) => f.type));
    expect(types).toContain('public_webhook_no_auth');   // 1.4
    expect(types).toContain('hardcoded_credential');     // 1.3 (sk-ant key)
    expect(types).toContain('insecure_http');            // 1.3 (http://)
    expect(types).toContain('prompt_injection_exposure');// 1.5
    expect(types).toContain('browser_automation_risk');  // 1.6
    expect(types).toContain('missing_error_handling');   // 1.6
    expect(r.summary.risk_level).toBe('High');
    expect(r.summary.worst_severity).toBe('high');
  });

  it('ranks most-severe findings first', () => {
    const r = scanWorkflow({ workflow: vulnerable });
    const rank = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
    for (let i = 1; i < r.findings.length; i++) {
      expect(rank[r.findings[i - 1].severity]).toBeGreaterThanOrEqual(rank[r.findings[i].severity]);
    }
  });

  it('flags AI agent/tool permissions', () => {
    const wf = { name: 'Agent', nodes: [{ id: '1', name: 'Agent', type: '@n8n/n8n-nodes-langchain.agent', parameters: {} }], connections: {} };
    const r = scanWorkflow({ workflow: wf });
    expect(r.findings.map((f) => f.type)).toContain('unsafe_ai_tool_permissions');
  });

  it('flags a personal-account credential (manual review)', () => {
    const wf = {
      name: 'Personal', nodes: [{ id: '1', name: 'Gmail', type: 'n8n-nodes-base.gmail',
        parameters: {}, credentials: { gmailOAuth2: { id: 'x', name: 'my.name@gmail.com' } } }],
      connections: {},
    };
    const f = scanWorkflow({ workflow: wf }).findings.find((x) => x.type === 'personal_credential_dependency');
    expect(f).toBeTruthy();
    expect(f.manual_review).toBe(true);
  });

  it('flags weak webhook auth (basic) as review, not a hard fail', () => {
    const wf = { name: 'x', nodes: [{ id: '1', name: 'Hook', type: 'n8n-nodes-base.webhook', parameters: { authentication: 'basicAuth' } }], connections: {} };
    const f = scanWorkflow({ workflow: wf }).findings.find((x) => x.type === 'weak_webhook_auth');
    expect(f).toBeTruthy();
    expect(f.severity).toBe('medium');
    expect(f.manual_review).toBe(true);
  });

  it('does NOT flag strong (header/JWT) webhook auth', () => {
    const wf = { name: 'x', nodes: [{ id: '1', name: 'Hook', type: 'n8n-nodes-base.webhook', parameters: { authentication: 'headerAuth' } }], connections: {} };
    const types = scanWorkflow({ workflow: wf }).findings.map((f) => f.type);
    expect(types).not.toContain('weak_webhook_auth');
    expect(types).not.toContain('public_webhook_no_auth');
  });

  it('flags excessive OAuth scopes for review', () => {
    const wf = { name: 'x', nodes: [{ id: '1', name: 'G', type: 'n8n-nodes-base.googleSheets',
      parameters: { scope: ['a', 'b', 'c', 'd', 'e', 'f'] } }], connections: {} };
    expect(scanWorkflow({ workflow: wf }).findings.map((f) => f.type)).toContain('excessive_permissions');
  });

  it('flags external calls with no retry configured (distinct check)', () => {
    const types = scanWorkflow({ workflow: vulnerable }).findings.map((f) => f.type);
    expect(types).toContain('no_retry_configured');
  });

  it('rejects a genuinely unsupported platform (zapier)', () => {
    expect(() => scanWorkflow({ workflow: clean, platform: 'zapier' })).toThrow(/out of scope/i);
  });
});

describe('scanWorkflow — Make.com (milestone 1.2, upload-only)', () => {
  const makeScenario = {
    name: 'Make lead intake',
    flow: [
      { id: 1, module: 'gateway:CustomWebHook', parameters: {}, mapper: {}, metadata: { designer: { name: 'Webhook' } } },
      { id: 2, module: 'http:ActionSendData', parameters: {}, metadata: { designer: { name: 'HTTP call' } },
        mapper: { url: 'http://api.example.com/x', apiKey: 'sk-ant-ABCDEFGHIJ1234567890' } },
      { id: 3, module: 'openai-gpt-3:CreateCompletion', parameters: {}, metadata: { designer: { name: 'OpenAI' } },
        mapper: { prompt: 'Summarize {{1.body}}' } },
      { id: 4, module: 'builtin:BasicRouter', routes: [{ flow: [{ id: 5, module: 'slack:CreateMessage', mapper: { text: '{{3.result}}' } }] }] },
    ],
  };

  it('parses the flow (incl. router routes) and applies the shared detectors', () => {
    const r = scanWorkflow({ workflow: makeScenario, platform: 'make' });
    expect(r.platform).toBe('make');
    expect(r.node_count).toBe(5);                 // 4 top-level + 1 in the router route
    const types = new Set(r.findings.map((f) => f.type));
    expect(types).toContain('public_webhook_no_auth');    // Make webhook is public by default
    expect(types).toContain('hardcoded_credential');      // secret in the mapper
    expect(types).toContain('insecure_http');             // http:// in the mapper
    expect(types).toContain('prompt_injection_exposure'); // external input → AI prompt
    expect(types).toContain('missing_error_handling');    // no onerror handlers
    expect(r.summary.risk_level).toBe('High');
  });

  it('rejects non-Make JSON on the make platform', () => {
    expect(() => scanWorkflow({ workflow: { nodes: [] }, platform: 'make' })).toThrow(/Make scenario/);
  });
});

describe('parseN8n — robustness', () => {
  it('does not throw on malformed connections', () => {
    const wf = { name: 'x', nodes: [{ id: '1', name: 'A', type: 'n8n-nodes-base.set' }], connections: { A: { main: 'not-an-array' } } };
    expect(() => parseN8n(wf)).not.toThrow();
    expect(parseN8n(wf).connections).toEqual([]);
  });
  it('throws on non-object input', () => {
    expect(() => parseN8n('not json')).toThrow(/Invalid/);
  });
});
