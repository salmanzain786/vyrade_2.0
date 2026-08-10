/**
 * Work Intelligence platform credentials (Phase 1.1). Per-platform OAuth app
 * credentials come from env; a platform is only "configured" (connectable) when
 * both are present, so the UI can show a clear "not configured" state instead of
 * a broken OAuth redirect.
 */
const CREDS = {
  clickup: () => ({ clientId: process.env.CLICKUP_CLIENT_ID, clientSecret: process.env.CLICKUP_CLIENT_SECRET }),
  // Phase 6: asana, monday, jira, trello — add their env-backed creds here.
};

export function getPlatformCredentials(platform) {
  const fn = CREDS[platform];
  return fn ? fn() : null;
}

export function isPlatformConfigured(platform) {
  const c = getPlatformCredentials(platform);
  return !!(c && c.clientId && c.clientSecret);
}

export default { getPlatformCredentials, isPlatformConfigured };
