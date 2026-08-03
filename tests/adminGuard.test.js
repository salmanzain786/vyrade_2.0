import { describe, it, expect, vi, beforeEach } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('../lib/auth/session.js', () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock('../lib/monitoring/capture.js', () => ({ captureRouteError: () => {}, routeOf: () => '/api/admin/x' }));

const { withAdmin, withAuth, requireAdmin } = await import('../lib/auth/guard.js');

const req = () => ({ url: 'http://localhost/api/admin/x', method: 'GET' });
const handler = vi.fn(async (user) => new Response(JSON.stringify({ ok: true, uid: user.id }), { status: 200 }));

describe('withAdmin — /admin API gate', () => {
  beforeEach(() => { getCurrentUser.mockReset(); handler.mockClear(); });

  it('401 when signed out — handler never runs', async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await withAdmin(handler)(req(), {});
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('403 when signed in but NOT admin — handler never runs', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1', email: 'a@b.com', isAdmin: false });
    const res = await withAdmin(handler)(req(), {});
    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('runs the handler for an admin, passing the user', async () => {
    getCurrentUser.mockResolvedValue({ id: 'admin1', email: 'boss@vyrade.com', isAdmin: true });
    const res = await withAdmin(handler)(req(), {});
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    expect((await res.json()).uid).toBe('admin1');
  });

  it('requireAdmin throws 403 (Forbidden) for a non-admin', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1', isAdmin: false });
    await expect(requireAdmin()).rejects.toMatchObject({ statusCode: 403 });
  });

  it('regression: withAuth still allows a non-admin through', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1', isAdmin: false });
    const res = await withAuth(handler)(req(), {});
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });
});
