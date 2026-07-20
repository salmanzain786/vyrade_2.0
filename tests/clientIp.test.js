import { describe, it, expect, afterEach } from 'vitest';
import { clientIp, trustProxyHops, UNKNOWN_IP } from '../lib/auth/clientIp.js';

const req = (headers = {}, extra = {}) => ({
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  ...extra,
});

const withTrust = (value, fn) => {
  const prev = process.env.TRUST_PROXY;
  if (value === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = value;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = prev;
  }
};

afterEach(() => { delete process.env.TRUST_PROXY; });

describe('P1 — X-Forwarded-For is not trusted by default', () => {
  it('IGNORES a spoofed XFF when TRUST_PROXY is unset', () => {
    // Direct exposure: a client could otherwise rotate this header to defeat
    // every per-IP limit.
    const ip = withTrust(undefined, () => clientIp(req({ 'x-forwarded-for': '6.6.6.6' })));
    expect(ip).toBe(UNKNOWN_IP);
  });

  it('also ignores x-real-ip when untrusted (equally forgeable)', () => {
    expect(withTrust(undefined, () => clientIp(req({ 'x-real-ip': '6.6.6.6' })))).toBe(UNKNOWN_IP);
  });

  it('TRUST_PROXY=false / 0 keeps it untrusted', () => {
    for (const v of ['false', '0', 'no', '']) {
      expect(withTrust(v, () => clientIp(req({ 'x-forwarded-for': '6.6.6.6' })))).toBe(UNKNOWN_IP);
    }
  });
});

describe('trusted-proxy hop handling', () => {
  it('with one proxy, takes the RIGHTMOST entry (the one the proxy appended)', () => {
    // Client spoofs "6.6.6.6"; the proxy appends the real peer on the right.
    const ip = withTrust('1', () => clientIp(req({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' })));
    expect(ip).toBe('203.0.113.9');   // spoof defeated
  });

  it('TRUST_PROXY=true behaves as one proxy', () => {
    expect(withTrust('true', () => clientIp(req({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }))))
      .toBe('203.0.113.9');
  });

  it('with two proxies, takes the second entry from the right', () => {
    // client, edge, nginx → the client IP is 2 from the right.
    const ip = withTrust('2', () => clientIp(req({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1, 10.0.0.2' })));
    expect(ip).toBe('10.0.0.1');
  });

  it('does not read past the start of the list', () => {
    const ip = withTrust('5', () => clientIp(req({ 'x-forwarded-for': '203.0.113.9' })));
    expect(ip).toBe('203.0.113.9');
  });

  it('falls back to x-real-ip when trusted and XFF is absent', () => {
    expect(withTrust('1', () => clientIp(req({ 'x-real-ip': '203.0.113.9' })))).toBe('203.0.113.9');
  });
});

describe('platform headers are always trusted (edge overwrites them)', () => {
  it('prefers Cloudflare CF-Connecting-IP over a spoofed XFF', () => {
    const ip = withTrust(undefined, () => clientIp(req({
      'cf-connecting-ip': '203.0.113.9',
      'x-forwarded-for': '6.6.6.6',
    })));
    expect(ip).toBe('203.0.113.9');
  });

  it('uses Vercel and Akamai headers', () => {
    expect(clientIp(req({ 'x-vercel-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9');
    expect(clientIp(req({ 'true-client-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('uses request.ip when the host populates it', () => {
    expect(clientIp(req({}, { ip: '203.0.113.9' }))).toBe('203.0.113.9');
  });
});

describe('trustProxyHops parsing', () => {
  it('maps env values to hop counts', () => {
    expect(withTrust(undefined, trustProxyHops)).toBe(0);
    expect(withTrust('false', trustProxyHops)).toBe(0);
    expect(withTrust('true', trustProxyHops)).toBe(1);
    expect(withTrust('1', trustProxyHops)).toBe(1);
    expect(withTrust('3', trustProxyHops)).toBe(3);
    expect(withTrust('garbage', trustProxyHops)).toBe(0); // fail safe
    expect(withTrust('-2', trustProxyHops)).toBe(0);
  });
});
