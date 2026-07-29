import { describe, it, expect } from 'vitest';
import { scrubEvent, baseSentryOptions } from '../lib/monitoring/sentryScrub.js';

describe('scrubEvent — no PII reaches Sentry', () => {
  const dirtyEvent = () => ({
    request: {
      method: 'POST',
      url: 'https://app.vyrade.com/api/blueprints/bp_1?token=secret&email=a@b.com',
      data: { blueprint: { name: 'Acme payroll', business_goal: 'sensitive text' } }, // body
      cookies: { session: 'abc123' },
      query_string: 'token=secret&email=a@b.com',
      headers: { cookie: 'session=abc', authorization: 'Bearer xyz', 'user-agent': 'Chrome', 'content-type': 'application/json' },
    },
    user: { id: 'user-123', email: 'victim@example.com', ip_address: '8.8.8.8', username: 'victim' },
    breadcrumbs: [
      { category: 'console', message: 'Blueprint dump: {secret...}' },
      { category: 'navigation', data: { from: '/x?token=abc', to: '/y?email=a@b.com' } },
      { category: 'fetch', data: { url: 'https://api/thing?key=leak' } },
    ],
  });

  it('drops request body, cookies, query string and sensitive headers', () => {
    const e = scrubEvent(dirtyEvent());
    expect(e.request.data).toBeUndefined();
    expect(e.request.cookies).toBeUndefined();
    expect(e.request.query_string).toBeUndefined();
    expect(e.request.url).toBe('https://app.vyrade.com/api/blueprints/bp_1'); // query stripped
    expect(e.request.headers).not.toHaveProperty('cookie');
    expect(e.request.headers).not.toHaveProperty('authorization');
    expect(e.request.headers['user-agent']).toBe('Chrome'); // safe header kept
  });

  it('keeps only the user id — never email / ip / username', () => {
    const e = scrubEvent(dirtyEvent());
    expect(e.user).toEqual({ id: 'user-123', ip_address: null });
    expect(JSON.stringify(e.user)).not.toContain('victim');
  });

  it('drops console breadcrumbs and strips query strings from the rest', () => {
    const e = scrubEvent(dirtyEvent());
    expect(e.breadcrumbs.some((b) => b.category === 'console')).toBe(false);
    const nav = e.breadcrumbs.find((b) => b.category === 'navigation');
    expect(nav.data.from).toBe('/x');
    expect(nav.data.to).toBe('/y');
    const fetchB = e.breadcrumbs.find((b) => b.category === 'fetch');
    expect(fetchB.data.url).toBe('https://api/thing');
  });

  it('no PII substring survives anywhere in the scrubbed event', () => {
    const serialized = JSON.stringify(scrubEvent(dirtyEvent()));
    for (const leak of ['victim@example.com', 'a@b.com', 'session=abc', 'Bearer xyz', 'Acme payroll', 'token=secret', '8.8.8.8']) {
      expect(serialized).not.toContain(leak);
    }
  });

  it('handles empty / malformed events without throwing', () => {
    expect(scrubEvent(null)).toBeNull();
    expect(scrubEvent({})).toEqual({ user: { ip_address: null } });
  });
});

describe('baseSentryOptions — safe production defaults', () => {
  it('disables PII, console logs, and installs the scrubber', () => {
    const o = baseSentryOptions();
    expect(o.sendDefaultPii).toBe(false);
    expect(o.enableLogs).toBe(false);
    expect(typeof o.beforeSend).toBe('function');
    // beforeSend actually scrubs.
    const scrubbed = o.beforeSend({ user: { id: 'u1', email: 'a@b.com' } });
    expect(scrubbed.user).toEqual({ id: 'u1', ip_address: null });
  });

  it('does not enable in dev unless SENTRY_ENABLE_DEV=1', () => {
    const prev = process.env.SENTRY_ENABLE_DEV;
    delete process.env.SENTRY_ENABLE_DEV;
    expect(baseSentryOptions().enabled).toBe(false); // NODE_ENV=test → not prod
    process.env.SENTRY_ENABLE_DEV = '1';
    expect(baseSentryOptions().enabled).toBe(true);
    if (prev === undefined) delete process.env.SENTRY_ENABLE_DEV; else process.env.SENTRY_ENABLE_DEV = prev;
  });
});
