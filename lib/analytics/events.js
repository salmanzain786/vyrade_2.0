/**
 * Canonical Mixpanel event names — the single source of truth shared by the
 * client (UI intent) and the server (authoritative outcomes). Using constants
 * instead of string literals keeps the two sides from drifting and makes the
 * full tracked surface greppable in one place.
 *
 * Convention: human-readable "Title Case" names (Mixpanel's own convention),
 * past-tense for things that happened, "-ed/Clicked/Opened" for UI intent.
 */
export const EVENTS = {
  // ── Session / navigation (client) ─────────────────────────────────────
  PAGE_VIEWED: 'Page Viewed',
  THEME_TOGGLED: 'Theme Toggled',

  // ── Auth: UI intent (client) ──────────────────────────────────────────
  SIGN_UP_SUBMITTED: 'Sign Up Submitted',
  LOGIN_SUBMITTED: 'Login Submitted',
  VERIFY_EMAIL_SUBMITTED: 'Verify Email Submitted',
  RESEND_OTP_CLICKED: 'Resend OTP Clicked',
  FORGOT_PASSWORD_SUBMITTED: 'Forgot Password Submitted',
  RESET_PASSWORD_SUBMITTED: 'Reset Password Submitted',
  PASSWORD_VISIBILITY_TOGGLED: 'Password Visibility Toggled',
  SIGN_OUT_CLICKED: 'Sign Out Clicked',

  // ── Auth: outcomes (server, authoritative) ────────────────────────────
  SIGNED_UP: 'Signed Up',
  LOGGED_IN: 'Logged In',
  LOGIN_FAILED: 'Login Failed',
  LOGGED_OUT: 'Logged Out',
  EMAIL_VERIFIED: 'Email Verified',
  EMAIL_VERIFICATION_FAILED: 'Email Verification Failed',
  OTP_RESENT: 'OTP Resent',
  PASSWORD_RESET_REQUESTED: 'Password Reset Requested',
  PASSWORD_RESET_COMPLETED: 'Password Reset Completed',
  RATE_LIMIT_HIT: 'Rate Limit Hit',

  // ── Chat (client) ─────────────────────────────────────────────────────
  MESSAGE_SENT: 'Message Sent',
  NEW_CHAT_CLICKED: 'New Chat Clicked',
  CONVERSATION_SELECTED: 'Conversation Selected',
  CHAT_HISTORY_OPENED: 'Chat History Opened',
  CHAT_SEARCHED: 'Chat History Searched',

  // ── Blueprint (server, authoritative) ─────────────────────────────────
  BLUEPRINT_CREATED: 'Blueprint Created',
  BLUEPRINT_UPDATED: 'Blueprint Updated',
  BLUEPRINT_FINALIZED: 'Blueprint Finalized',
  BLUEPRINT_READY: 'Blueprint Ready',

  // ── Workflow generation ───────────────────────────────────────────────
  GENERATE_WORKFLOW_CLICKED: 'Generate Workflow Clicked',   // client intent
  WORKFLOW_GENERATED: 'Workflow Generated',                 // server outcome
  WORKFLOW_GENERATION_FAILED: 'Workflow Generation Failed', // client (surface)
  WORKFLOW_VIEWED: 'Workflow Viewed',
  WORKFLOW_DOWNLOADED: 'Workflow Downloaded',

  // ── Export (client intent + server outcome) ───────────────────────────
  EXPORT_MODAL_OPENED: 'Export Modal Opened',
  EXPORT_PLATFORM_SELECTED: 'Export Platform Selected',
  EXPORT_COMPLETED: 'Export Completed',
  EXPORT_FAILED: 'Export Failed',
  CLAUDE_PROMPT_COPIED: 'Claude Prompt Copied',

  // ── LLM cost/usage (server) ───────────────────────────────────────────
  LLM_USAGE: 'LLM Usage',
};

export default EVENTS;
