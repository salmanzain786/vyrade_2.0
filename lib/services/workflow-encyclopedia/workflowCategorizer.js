/**
 * Workflow Encyclopedia — categorization.
 *
 * Maps an analyzed workflow to a primary category + tags, from the integrations
 * it uses and its structural traits. Deterministic and lightweight — this is
 * what powers "categories" on the /technology/[platform] pages.
 */

// category → the apps that signal it. Order matters for tie-breaking (earlier
// wins when app counts are equal).
export const WORKFLOW_CATEGORIES = {
  ai_content: { label: 'AI & Content', apps: ['langchain', 'openai', 'anthropic', 'huggingface', 'cohere', 'mistral'] },
  ecommerce: { label: 'E-commerce', apps: ['shopify', 'woocommerce', 'stripe', 'paypal', 'magento', 'chargebee'] },
  crm_sales: { label: 'CRM & Sales', apps: ['hubspot', 'salesforce', 'pipedrive', 'zoho', 'copper', 'freshsales'] },
  marketing: { label: 'Marketing & Email', apps: ['mailchimp', 'sendgrid', 'mailerlite', 'activecampaign', 'klaviyo', 'brevo', 'sendinblue'] },
  communication: { label: 'Communication & Notifications', apps: ['slack', 'telegram', 'discord', 'gmail', 'emailsend', 'microsoftteams', 'twilio', 'whatsapp', 'mattermost'] },
  project_management: { label: 'Project Management', apps: ['trello', 'asana', 'jira', 'clickup', 'monday', 'todoist', 'linear'] },
  data_spreadsheets: { label: 'Data & Spreadsheets', apps: ['googlesheets', 'airtable', 'notion', 'postgres', 'mysql', 'mongodb', 'supabase', 'baserow', 'redis'] },
  files_storage: { label: 'Files & Storage', apps: ['googledrive', 'dropbox', 'awss3', 's3', 'nextcloud', 'box', 'onedrive'] },
  dev_ops: { label: 'Dev & Ops', apps: ['github', 'gitlab', 'jenkins', 'pagerduty', 'sentry', 'gitea'] },
  forms_surveys: { label: 'Forms & Surveys', apps: ['typeform', 'jotform', 'formstack', 'googleforms'] },
  social_media: { label: 'Social Media', apps: ['twitter', 'linkedin', 'facebook', 'instagram', 'youtube', 'reddit'] },
  calendar_scheduling: { label: 'Calendar & Scheduling', apps: ['googlecalendar', 'calendly', 'caldav', 'outlook'] },
};

const APP_TO_CATEGORY = (() => {
  const m = new Map();
  for (const [key, def] of Object.entries(WORKFLOW_CATEGORIES)) {
    for (const app of def.apps) if (!m.has(app)) m.set(app, key);
  }
  return m;
})();

const CATEGORY_ORDER = Object.keys(WORKFLOW_CATEGORIES);

/**
 * @param {object} analysis  from analyzeWorkflow()
 * @returns {{ category: string, category_label: string, categories: string[], tags: string[] }}
 */
export function categorizeWorkflow(analysis) {
  const counts = {};
  for (const app of analysis?.integrations || []) {
    const cat = APP_TO_CATEGORY.get(app);
    if (cat) counts[cat] = (counts[cat] || 0) + 1;
  }

  // Primary category = most-represented; ties broken by CATEGORY_ORDER.
  let primary = null, best = 0;
  for (const cat of CATEGORY_ORDER) {
    const c = counts[cat] || 0;
    if (c > best) { best = c; primary = cat; }
  }

  // Fallbacks when no known integration matched.
  if (!primary) {
    if (analysis?.has_ai) primary = 'ai_content';
    else if (analysis?.trigger_type === 'schedule') primary = 'scheduled_jobs';
    else if (analysis?.trigger_type === 'webhook') primary = 'webhooks_api';
    else primary = 'general_automation';
  }

  const categories = Object.keys(counts).sort((a, b) => (counts[b] - counts[a]) || CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));

  const tags = [];
  if (analysis?.has_ai) tags.push('ai');
  if (analysis?.has_branching) tags.push('branching');
  if (analysis?.has_error_handling) tags.push('error-handling');
  if (analysis?.trigger_type && analysis.trigger_type !== 'unknown') tags.push(`trigger:${analysis.trigger_type}`);
  if ((analysis?.integration_count ?? 0) >= 3) tags.push('multi-system');

  return {
    category: primary,
    category_label: WORKFLOW_CATEGORIES[primary]?.label || labelFor(primary),
    categories,               // all matched category keys, most-represented first
    tags,
  };
}

function labelFor(key) {
  return { scheduled_jobs: 'Scheduled Jobs', webhooks_api: 'Webhooks & API', general_automation: 'General Automation' }[key] || key;
}

export default { WORKFLOW_CATEGORIES, categorizeWorkflow };
