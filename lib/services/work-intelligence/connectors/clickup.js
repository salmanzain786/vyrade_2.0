/**
 * ClickUp connector (Work Intelligence pilot platform, Phase 1.2).
 *
 * Implements the pluggable connector interface (see registry.js): OAuth, token
 * lifecycle, scope discovery (teams → spaces → lists), task retrieval, and
 * normalisation into the shared task model. ClickUp OAuth tokens do not expire
 * and there is no refresh token — the framework still supports refresh for other
 * platforms (Phase 6); here refresh is a no-op.
 *
 * Auth: ClickUp expects the raw token in the Authorization header (NOT "Bearer").
 */
import { normalizeTask } from '../taskModel.js';

const AUTH_BASE = 'https://app.clickup.com/api';
const API_BASE = 'https://api.clickup.com/api/v2';

async function api(token, path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers: { Authorization: token, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`ClickUp ${path} → ${res.status}`);
  return res.json();
}

export const clickupConnector = {
  platform: 'clickup',
  label: 'ClickUp',
  supportsRefresh: false,
  supportsWriteback: true,

  /** Step 1 — the consent URL the user is redirected to. */
  authorizeUrl({ clientId, redirectUri, state }) {
    const p = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, state });
    return `${AUTH_BASE}?${p.toString()}`;
  },

  /** Step 2 — exchange the callback code for an access token. */
  async exchangeCode({ clientId, clientSecret, code }) {
    const p = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code });
    const res = await fetch(`${API_BASE}/oauth/token?${p.toString()}`, { method: 'POST' });
    if (!res.ok) throw new Error(`ClickUp token exchange failed (${res.status})`);
    const j = await res.json();
    return { accessToken: j.access_token, refreshToken: null, expiresAt: null };
  },

  async refresh() { return null; }, // ClickUp tokens don't expire
  async revoke() { /* ClickUp has no token-revoke endpoint; the app authorization is removed in ClickUp's UI */ },

  /** The account/workspaces this token can see (for scope selection + display). */
  async getAccount(token) {
    const [{ user }, { teams }] = await Promise.all([api(token, '/user'), api(token, '/team')]);
    return {
      external_account_id: String(user?.id ?? ''),
      account_name: user?.username || user?.email || 'ClickUp user',
      workspaces: (teams || []).map((t) => ({ id: String(t.id), name: t.name })),
    };
  },

  /** Scope discovery: spaces within a workspace (team), then lists within a space. */
  async listSpaces(token, workspaceId) {
    const { spaces } = await api(token, `/team/${workspaceId}/space`);
    return (spaces || []).map((s) => ({ id: String(s.id), name: s.name }));
  },
  async listLists(token, spaceId) {
    const { lists } = await api(token, `/space/${spaceId}/list`);
    return (lists || []).map((l) => ({ id: String(l.id), name: l.name }));
  },

  /**
   * Full pickable-list hierarchy (workspaces → spaces → folderless + folder
   * lists) for the connection-setup picker. Bounded but multi-call; the caller
   * should treat it as a one-off "load my projects" action.
   */
  async listProjects(token) {
    const out = [];
    const { teams } = await api(token, '/team');
    for (const team of teams || []) {
      let spaces = [];
      try { ({ spaces } = await api(token, `/team/${team.id}/space`)); } catch { spaces = []; }
      for (const space of spaces || []) {
        try {
          const { lists } = await api(token, `/space/${space.id}/list`); // folderless
          for (const l of lists || []) out.push({ id: String(l.id), name: l.name, space: space.name, workspace: team.name });
        } catch { /* skip space */ }
        try {
          const { folders } = await api(token, `/space/${space.id}/folder`);
          for (const f of folders || []) for (const l of f.lists || []) out.push({ id: String(l.id), name: l.name, space: `${space.name} / ${f.name}`, workspace: team.name });
        } catch { /* skip folders */ }
      }
    }
    return out;
  },

  /**
   * Retrieve tasks from a list (subtasks + closed included), normalised.
   * `since` (ms epoch) applies the connection's historical-range scope.
   */
  async fetchTasks(token, { listId, since = null, page = 0 } = {}) {
    const p = new URLSearchParams({ include_closed: 'true', subtasks: 'true', page: String(page) });
    if (since) p.set('date_updated_gt', String(since));
    const { tasks } = await api(token, `/list/${listId}/task?${p.toString()}`);
    return (tasks || []).map((t) => normalizeTask(this.platform, t));
  },

  /** Write-back (4.2): post a progress comment to a task. Returns the comment id. */
  async postComment(token, taskId, text) {
    const res = await fetch(`${API_BASE}/task/${taskId}/comment`, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment_text: String(text).slice(0, 8000), notify_all: false }),
    });
    if (!res.ok) throw new Error(`ClickUp postComment → ${res.status}`);
    const j = await res.json();
    return { id: String(j.id ?? ''), url: `https://app.clickup.com/t/${taskId}` };
  },

  /**
   * Per-task comment text (2.2). The list endpoint omits comment bodies, so this
   * is an opt-in enrichment (only called when scope.fields.comments is on).
   */
  async fetchTaskComments(token, taskId) {
    const { comments } = await api(token, `/task/${taskId}/comment`);
    return (comments || [])
      .map((c) => ({ text: c?.comment_text || (Array.isArray(c?.comment) ? c.comment.map((x) => x?.text).join('') : '') || '', at: c?.date ? new Date(Number(c.date)).toISOString() : null }))
      .filter((c) => c.text);
  },
};

export default clickupConnector;
