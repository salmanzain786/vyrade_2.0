import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../lib/config/db.js', () => ({ pool: { query: (...a) => query(...a) } }));
const { createConnection, accessTokenOf, toPublic } = await import('../lib/services/work-intelligence/connectionRepository.js');
const { decryptToken } = await import('../lib/services/work-intelligence/tokenCrypto.js');

describe('connection repository (1.1) — tokens encrypted at rest', () => {
  beforeEach(() => query.mockReset());

  it('stores tokens ENCRYPTED, never plaintext; seeds default scope+governance', async () => {
    query
      .mockResolvedValueOnce([{}])   // revoke prior active
      .mockResolvedValueOnce([{}])   // insert
      .mockResolvedValueOnce([[{    // getConnection readback
        id: 'c1', user_id: 'u1', org_id: null, platform: 'clickup', status: 'active',
        access_token_enc: 'x', refresh_token_enc: null, scope_config: null, governance_config: null,
      }]]);
    await createConnection({ userId: 'u1', platform: 'clickup', account: { account_name: 'Acme' }, tokens: { accessToken: 'sk_live_SECRET_TOKEN' } });

    const insertParams = query.mock.calls[1][1];
    // the raw token must NOT appear anywhere in the insert params…
    expect(insertParams.join(' ')).not.toMatch(/sk_live_SECRET_TOKEN/);
    // …but the stored blob must decrypt back to it
    const encBlob = insertParams.find((p) => typeof p === 'string' && p.split(':').length === 3);
    expect(decryptToken(encBlob)).toBe('sk_live_SECRET_TOKEN');
  });

  it('accessTokenOf decrypts the stored blob; toPublic strips the encrypted blob', async () => {
    const { encryptToken } = await import('../lib/services/work-intelligence/tokenCrypto.js');
    const conn = { id: 'c1', platform: 'clickup', _enc: { access: encryptToken('tok_123'), refresh: null } };
    expect(accessTokenOf(conn)).toBe('tok_123');
    expect(toPublic(conn)._enc).toBeUndefined(); // never leaks to the client
    expect(toPublic(conn).id).toBe('c1');
  });
});
