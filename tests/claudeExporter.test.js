import { describe, it, expect } from 'vitest';
import { baseBlueprint } from './fixtures.js';
import { buildClaudePackage, sanitizeMcpConfig } from '../lib/services/claudeExporter.js';

// An MCP catalog record whose config carries a REAL secret value.
function mcpWith(config, app = 'Slack') {
  return {
    perSystem: {
      [app]: [{
        id: 'mcp-1', score: 0.9, name: 'GitHub MCP Server',
        description: 'Access repositories', repository: 'https://github.com/x/y',
        url: 'https://mcp.so/x', tags: 'Version Control', config,
      }],
    },
    all: [],
  };
}

describe('P0 — MCP config must never leak real secrets into the Claude package', () => {
  const LEAKY = JSON.stringify({
    mcpServers: {
      github: {
        command: 'npx',
        args: ['-y', 'mcprouter'],
        env: { SERVER_KEY: 'abc123' },
      },
    },
  });

  it('sanitizeMcpConfig replaces env values with ${SERVER_KEY} placeholders', () => {
    const out = sanitizeMcpConfig(LEAKY);
    expect(out).not.toContain('abc123');
    expect(out).toContain('${GITHUB_SERVER_KEY}');
    // Structure is preserved so the config stays useful.
    expect(out).toContain('"command": "npx"');
    expect(out).toContain('mcprouter');
  });

  it('the exported package contains the placeholder and NOT the secret', () => {
    const { files } = buildClaudePackage({ bp: baseBlueprint(), mcp: mcpWith(LEAKY) });
    const whole = Object.values(files).join('\n');
    expect(whole).not.toContain('abc123');
    expect(files['recommended-mcps.md']).toContain('${GITHUB_SERVER_KEY}');
  });

  it('redacts secret-looking values passed as args (KEY=VALUE and --flag value)', () => {
    const cfg = JSON.stringify({
      mcpServers: {
        shopify: {
          command: 'docker',
          args: ['run', '-e', 'API_TOKEN='+'shpat'+'_livesecret', '--clientSecret', 'super-secret-value', '--domain', 'shop.myshopify.com'],
        },
      },
    });
    const out = sanitizeMcpConfig(cfg);
    expect(out).not.toContain('shpat'+'_livesecret');
    expect(out).not.toContain('super-secret-value');
    // Non-secret args survive.
    expect(out).toContain('shop.myshopify.com');
    expect(out).toContain('run');
  });

  it('redacts a bare live-looking token and auth headers', () => {
    const cfg = JSON.stringify({
      mcpServers: { svc: { command: 'x', args: ['ghp'+'_realtokenvalue'], headers: { Authorization: 'Bearer '+'realtoken' } } },
    });
    const out = sanitizeMcpConfig(cfg);
    expect(out).not.toContain('ghp'+'_realtokenvalue');
    expect(out).not.toContain('Bearer '+'realtoken');
  });

  it('unparseable config is dropped entirely rather than rendered raw', () => {
    expect(sanitizeMcpConfig('not json { SERVER_KEY: abc123')).toBeNull();
    const { files } = buildClaudePackage({ bp: baseBlueprint(), mcp: mcpWith('not json { SERVER_KEY: abc123') });
    expect(Object.values(files).join('\n')).not.toContain('abc123');
  });

  it('.mcp.json.example is valid JSON with placeholders, never real secrets', () => {
    const { files } = buildClaudePackage({ bp: baseBlueprint(), mcp: mcpWith(LEAKY) });
    const raw = files['.mcp.json.example'];
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('abc123');
    const parsed = JSON.parse(raw); // must be valid JSON Claude Code can read
    expect(parsed.mcpServers.github.env.SERVER_KEY).toBe('${GITHUB_SERVER_KEY}');
    expect(parsed.mcpServers.github.command).toBe('npx');
  });

  it('does not double-prefix an env key that already names its server', () => {
    const cfg = JSON.stringify({ mcpServers: { github: { env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp'+'_secret' } } } });
    const out = sanitizeMcpConfig(cfg);
    expect(out).toContain('${GITHUB_PERSONAL_ACCESS_TOKEN}');
    expect(out).not.toContain('GITHUB_GITHUB_');
    expect(out).not.toContain('ghp'+'_secret');
  });
});

describe('P1 — package completeness & safety guardrails', () => {
  const pkg = () => buildClaudePackage({ bp: baseBlueprint(), mcp: { perSystem: {}, all: [] } });

  it('includes every required file', () => {
    const names = Object.keys(pkg().files);
    for (const f of [
      'README.md', 'CLAUDE.md', 'architecture.md', 'requirements.md', 'business-rules.md',
      'claude-prompt.md', 'recommended-mcps.md', '.mcp.json.example', 'MCP_SETUP.md',
      '.env.example', 'security-notes.md', 'manual-approval-rules.md',
      'acceptance-tests.md', 'deployment-notes.md',
    ]) expect(names).toContain(f);
  });

  it('claude-prompt.md carries the read/write guardrails', () => {
    const p = pkg().files['claude-prompt.md'];
    expect(p).toMatch(/Never write to a database/i);
    expect(p).toMatch(/Draft Slack messages/i);
    expect(p).toMatch(/GitHub issues/i);
    expect(p).toMatch(/destructive/i);
    expect(p).toMatch(/browser automation as read-only/i);
    expect(p).toMatch(/Never ask for credentials/i);
  });

  it('CLAUDE.md (auto-loaded memory) repeats the guardrails', () => {
    const c = pkg().files['CLAUDE.md'];
    expect(c).toMatch(/Safety guardrails/i);
    expect(c).toMatch(/Never write to a database/i);
    expect(c).toMatch(/browser automation as read-only/i);
  });

  it('security-notes.md and manual-approval-rules.md cover the key rules', () => {
    const { files } = pkg();
    expect(files['security-notes.md']).toMatch(/Read\/write guardrails/i);
    expect(files['security-notes.md']).toMatch(/Least privilege/i);
    expect(files['manual-approval-rules.md']).toMatch(/database write/i);
    expect(files['manual-approval-rules.md']).toMatch(/approval/i);
  });

  it('the returned prompt matches claude-prompt.md (Copy prompt = the file)', () => {
    const { files, prompt } = pkg();
    expect(prompt).toBe(files['claude-prompt.md']);
  });
});

describe('.env.example must match .mcp.json.example placeholders', () => {
  const CFG = JSON.stringify({
    mcpServers: {
      shopify: {
        command: 'npx',
        args: ['shopify-mcp', '--clientId', '<YOUR_CLIENT_ID>', '--clientSecret', '<YOUR_CLIENT_SECRET>'],
      },
    },
  });

  it('every ${VAR} in .mcp.json.example is declared in .env.example', () => {
    const { files } = buildClaudePackage({ bp: baseBlueprint(), mcp: mcpWith(CFG) });
    const placeholders = [...files['.mcp.json.example'].matchAll(/\$\{([A-Z0-9_]+)\}/g)].map((m) => m[1]);
    expect(placeholders.length).toBeGreaterThan(0);
    const env = files['.env.example'];
    for (const name of placeholders) {
      expect(env, `${name} missing from .env.example`).toContain(`${name}=`);
    }
  });
});

describe('P0 — sanitizer is RECURSIVE (nested secrets outside env/headers/args)', () => {
  it("redacts the reviewer's exact case: nested auth.client_secret", () => {
    const cfg = JSON.stringify({
      mcpServers: { github: { command: 'npx', auth: { client_secret: 'real-secret-here' } } },
    });
    const out = sanitizeMcpConfig(cfg);
    expect(out).not.toContain('real-secret-here');
    expect(out).toContain('${GITHUB_CLIENT_SECRET}');
    expect(out).toContain('"command": "npx"'); // structure preserved
  });

  it('redacts deeply nested secrets (4+ levels) by key name', () => {
    const cfg = JSON.stringify({
      mcpServers: {
        svc: {
          command: 'node',
          options: { remote: { connection: { credentials: { apiKey: 'deep-live-key' } } } },
        },
      },
    });
    const out = sanitizeMcpConfig(cfg);
    expect(out).not.toContain('deep-live-key');
    expect(out).toMatch(/\$\{SVC_API_?KEY\}/i);
  });

  it('redacts token-shaped values even when the key looks innocent', () => {
    const cfg = JSON.stringify({
      mcpServers: { svc: { setup: { note: 'ghp'+'_liveGithubTokenValue' } } },
    });
    const out = sanitizeMcpConfig(cfg);
    expect(out).not.toContain('ghp'+'_liveGithubTokenValue');
  });

  it('redacts secrets inside arrays of objects and arrays of strings', () => {
    const cfg = JSON.stringify({
      mcpServers: {
        svc: {
          endpoints: [{ url: 'https://api.example.com', password: 'hunter2' }],
          tokens: ['xox'+'b-live-slack-token'],
          scopes: ['repo', 'read:user'], // non-secret values survive
        },
      },
    });
    const out = sanitizeMcpConfig(cfg);
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('xox'+'b-live-slack-token');
    expect(out).toContain('https://api.example.com');
    expect(out).toContain('repo');
  });

  it('still handles a bare server object with no mcpServers wrapper', () => {
    const out = sanitizeMcpConfig(JSON.stringify({ command: 'npx', auth: { token: 'sk'+'-livevalue' } }));
    expect(out).not.toContain('sk'+'-livevalue');
    expect(out).toContain('"command": "npx"');
  });

  it('survives pathological nesting without blowing the stack', () => {
    let deep = { secret: 'leaked-at-the-bottom' };
    for (let i = 0; i < 60; i++) deep = { nested: deep };
    const out = sanitizeMcpConfig(JSON.stringify({ mcpServers: { svc: deep } }));
    expect(out).toBeTruthy();
    expect(out).not.toContain('leaked-at-the-bottom');
  });

  it('preserves non-secret structure (regression on the previous behaviour)', () => {
    const cfg = JSON.stringify({
      mcpServers: {
        shopify: {
          command: 'npx',
          args: ['shopify-mcp', '--clientSecret', '<YOUR_CLIENT_SECRET>', '--domain', 'shop.myshopify.com'],
          env: { SERVER_KEY: 'abc123' },
        },
      },
    });
    const out = sanitizeMcpConfig(cfg);
    expect(out).not.toContain('abc123');
    expect(out).toContain('${SHOPIFY_SERVER_KEY}');
    expect(out).toContain('shop.myshopify.com');
    expect(out).toContain('shopify-mcp');
  });
});
