import { describe, it, expect } from 'vitest';
import { redactSecrets } from '../lib/security/redact.js';

/**
 * Sample credentials are ASSEMBLED AT RUNTIME rather than written as literals.
 * They are entirely fake, but they are shaped like the real thing on purpose —
 * which is exactly what a secret scanner looks for. Splitting the prefix from
 * the body means this file contains no complete token-shaped string, so GitHub
 * Push Protection (and any similar scanner) has nothing to flag, while the
 * redactor still sees a fully-formed credential at test time.
 */
const tok = (...parts) => parts.join('');

const red = (s) => redactSecrets(s).text;
/** Nothing that looks like a live credential may survive. */
const clean = (s) => expect(red(s)).not.toMatch(/shpat_|ghp_|sk-|xoxb-|pcsk_|AKIA|AIza|eyJ|SG\./);

describe('P1 — secrets are redacted before reaching the LLM / storage', () => {
  it("handles the reviewer's example verbatim", () => {
    const secret = tok('shpat', '_abc123def456ghi789jkl012');
    const out = red(`Here is my Shopify token: ${secret}\nBuild an automation...`);
    expect(out).not.toContain(secret);
    expect(out).toContain('[REDACTED_SHOPIFY_TOKEN]');
    // Surrounding intent survives so the Blueprint still makes sense.
    expect(out).toContain('Build an automation');
    expect(out).toContain('Shopify token');
  });

  it.each([
    ['OpenAI',      `key ${tok('sk', '-abcdefghijklmnopqrstuvwxyz012345')}`, 'OPENAI_KEY'],
    ['Anthropic',   `use ${tok('sk', '-ant-api03-abcdefghijklmnop')}`, 'ANTHROPIC_KEY'],
    ['GitHub PAT',  `token ${tok('ghp', '_abcdefghijklmnopqrstuvwxyz0123')}`, 'GITHUB_TOKEN'],
    ['GitHub fine', tok('github', '_pat_11ABCDEFG0abcdefghijklmnop'), 'GITHUB_TOKEN'],
    ['GitLab',      tok('glpat', '-abcdefghijklmnopqrst'), 'GITLAB_TOKEN'],
    ['Slack bot',   tok('xox', 'b-123456789012-abcdefghijkl'), 'SLACK_TOKEN'],
    ['Stripe',      tok('sk', '_live_abcdefghijklmnopqrst'), 'STRIPE_KEY'],
    ['AWS',         tok('AKIA', 'IOSFODNN7EXAMPLE'), 'AWS_ACCESS_KEY_ID'],
    ['Google',      tok('AIza', 'SyA1234567890abcdefghijklmnopqrs'), 'GOOGLE_API_KEY'],
    ['Pinecone',    tok('pcsk', '_1234567890abcdefghijklmnopqrstuvwxyz'), 'PINECONE_KEY'],
    ['SendGrid',    tok('SG', '.abcdefghijklmnop.qrstuvwxyz0123456789'), 'SENDGRID_KEY'],
    ['npm',         tok('npm', '_abcdefghijklmnopqrstuvwxyz0123456789'), 'NPM_TOKEN'],
    ['JWT',         tok('eyJ', 'hbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N'), 'JWT'],
  ])('redacts a %s credential', (_label, text, type) => {
    const out = red(text);
    expect(out).toContain(`[REDACTED_${type}]`);
    clean(text);
  });

  it('redacts Bearer / Basic authorization headers', () => {
    const value = 'abcdefghijklmnopqrstuvwxyz123456';
    const out = red(`Authorization: Bearer ${value}`);
    expect(out).toContain('[REDACTED_AUTH_TOKEN]');
    expect(out).not.toContain(value);
    expect(out).toContain('Bearer'); // scheme kept for readability
  });

  it('redacts PEM private keys, including multi-line blocks', () => {
    const out = red('key:\n-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA1234\nabcd\n-----END RSA PRIVATE KEY-----\nthanks');
    expect(out).toContain('[REDACTED_PRIVATE_KEY]');
    expect(out).not.toContain('MIIEowIBAAKCAQEA1234');
    expect(out).toContain('thanks');
  });

  it('redacts Slack webhook URLs', () => {
    // Assembled at runtime — a literal here is what tripped GitHub's scanner.
    const hook = tok('https://hooks.slack.com/', 'services/T00000000/B00000000/', 'AAAABBBBCCCCDDDDEEEEFFFF');
    const out = red(`post to ${hook}`);
    expect(out).toContain('[REDACTED_SLACK_WEBHOOK]');
    expect(out).not.toContain('AAAABBBBCCCCDDDDEEEEFFFF');
  });

  it('redacts passwords in database / SMTP URLs but keeps the topology', () => {
    const out = red('db is mysql://appuser:s3cr3tP4ss@db.internal:3306/orders and smtp://mailer:hunter2@smtp.example.com');
    expect(out).not.toContain('s3cr3tP4ss');
    expect(out).not.toContain('hunter2');
    // Scheme, user, host and database are still described.
    expect(out).toContain('mysql://appuser:');
    expect(out).toContain('@db.internal:3306/orders');
    expect(out).toContain('smtp://mailer:');
  });

  it('redacts generic key:value secret assignments', () => {
    const out = red('api_key: A1b2C3d4E5f6G7h8 and password=hunter2 and client_secret = "9f8e7d6c5b4a3210"');
    expect(out).not.toContain('A1b2C3d4E5f6G7h8');
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('9f8e7d6c5b4a3210');
    expect(out).toContain('api_key');   // the field name is preserved
  });

  it('reports the TYPES found without echoing any value', () => {
    const gh = tok('ghp', '_abcdefghijklmnopqrstuvwxyz0123');
    const oa = tok('sk', '-abcdefghijklmnopqrstuvwxyz012345');
    const r = redactSecrets(`${gh} and ${oa}`);
    expect(r.count).toBe(2);
    expect(r.redactions).toEqual(expect.arrayContaining(['GITHUB_TOKEN', 'OPENAI_KEY']));
    expect(r.redactions.join()).not.toMatch(/ghp|sk-/);
  });
});

describe('no false positives on ordinary automation text', () => {
  const SAFE = [
    'When a new Shopify order is created, add it to Google Sheets and notify Slack.',
    'Retry twice, then alert us. Only notify on failures.',
    'The password field should be required and validated.',
    'Send a token of appreciation to the customer.',
    'Read the API key from an environment variable, never hardcode it.',
    'Use https://api.example.com/v1/orders as the endpoint.',
    'Set api_key: ${SHOPIFY_API_KEY} in your env file.',
    'password: <YOUR_PASSWORD>',
    'token: your_token_here',
  ];

  it.each(SAFE)('leaves %s unchanged', (text) => {
    expect(red(text)).toBe(text);
  });

  it('leaves a plain URL without credentials alone', () => {
    const u = 'https://hooks.example.com/path/to/thing';
    expect(red(u)).toBe(u);
  });

  it('is safe on empty/non-string input', () => {
    expect(redactSecrets('').text).toBe('');
    expect(redactSecrets(null).text).toBe('');
    expect(redactSecrets(undefined).count).toBe(0);
  });
});
