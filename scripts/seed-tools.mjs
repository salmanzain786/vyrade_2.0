/**
 * Seed the Tool / API / MCP Intelligence registry.
 *
 *   npm run seed:tools
 *
 * Idempotent (upsert on tool_name). Seeds FACTUAL, stable fields — auth method,
 * documentation URL, API availability, n8n node type, category, and reasoned
 * complexity/security estimates. Volatile facts (exact rate limits, pricing,
 * MCP servers) are left null/false unless known — never fabricated. Fill them
 * in as you verify, and bump LAST_CHECKED.
 */
import 'dotenv/config';
import { upsertTool } from '../lib/services/tools/toolIntelligenceRepository.js';
import { pool } from '../lib/config/db.js';

const LAST_CHECKED = '2026-07-27 00:00:00';

// t(name, category, auth, docs, node, complexity, security, apiBase?, useCases?)
const T = [
  ['Slack', 'communication', 'oauth2', 'https://api.slack.com', 'n8n-nodes-base.slack', 'low', 'low', ['Notifications', 'ChatOps', 'Alerts']],
  ['Gmail', 'communication', 'oauth2', 'https://developers.google.com/gmail/api', 'n8n-nodes-base.gmail', 'low', 'medium', ['Email automation', 'Parsing inbound mail']],
  ['Telegram', 'communication', 'token', 'https://core.telegram.org/bots/api', 'n8n-nodes-base.telegram', 'low', 'low', ['Bot notifications']],
  ['Discord', 'communication', 'bearer', 'https://discord.com/developers/docs', 'n8n-nodes-base.discord', 'low', 'low', ['Community notifications']],
  ['HubSpot', 'crm', 'oauth2', 'https://developers.hubspot.com', 'n8n-nodes-base.hubspot', 'medium', 'medium', ['CRM sync', 'Lead capture']],
  ['Salesforce', 'crm', 'oauth2', 'https://developer.salesforce.com/docs', 'n8n-nodes-base.salesforce', 'high', 'high', ['Enterprise CRM sync']],
  ['Pipedrive', 'crm', 'api_key', 'https://developers.pipedrive.com', 'n8n-nodes-base.pipedrive', 'medium', 'medium', ['Sales pipeline sync']],
  ['Shopify', 'ecommerce', 'bearer', 'https://shopify.dev/docs/api', 'n8n-nodes-base.shopify', 'medium', 'medium', ['Order sync', 'Inventory']],
  ['Stripe', 'payments', 'bearer', 'https://stripe.com/docs/api', 'n8n-nodes-base.stripe', 'medium', 'high', ['Payments', 'Subscription events']],
  ['Google Sheets', 'data', 'oauth2', 'https://developers.google.com/sheets/api', 'n8n-nodes-base.googleSheets', 'low', 'low', ['Data logging', 'Reporting']],
  ['Airtable', 'data', 'bearer', 'https://airtable.com/developers/web/api/introduction', 'n8n-nodes-base.airtable', 'low', 'low', ['Lightweight database']],
  ['Notion', 'data', 'bearer', 'https://developers.notion.com', 'n8n-nodes-base.notion', 'low', 'low', ['Docs & knowledge base sync']],
  ['Google Drive', 'files', 'oauth2', 'https://developers.google.com/drive/api', 'n8n-nodes-base.googleDrive', 'low', 'medium', ['File storage', 'Backups']],
  ['Google Calendar', 'calendar', 'oauth2', 'https://developers.google.com/calendar/api', 'n8n-nodes-base.googleCalendar', 'low', 'medium', ['Scheduling', 'Event automation']],
  ['Twilio', 'communication', 'basic', 'https://www.twilio.com/docs', 'n8n-nodes-base.twilio', 'medium', 'medium', ['SMS', 'Voice']],
  ['SendGrid', 'marketing', 'bearer', 'https://docs.sendgrid.com', 'n8n-nodes-base.sendGrid', 'low', 'low', ['Transactional email']],
  ['Mailchimp', 'marketing', 'oauth2', 'https://mailchimp.com/developer', 'n8n-nodes-base.mailchimp', 'low', 'low', ['Email marketing']],
  ['OpenAI', 'ai', 'bearer', 'https://platform.openai.com/docs', 'n8n-nodes-base.openAi', 'low', 'medium', ['AI reasoning', 'Content generation']],
  ['Anthropic', 'ai', 'api_key', 'https://docs.anthropic.com', null, 'low', 'medium', ['AI reasoning', 'Agentic workflows']],
  ['GitHub', 'dev', 'bearer', 'https://docs.github.com/rest', 'n8n-nodes-base.github', 'low', 'medium', ['Repo automation', 'Issue sync']],
  ['Trello', 'project', 'api_key', 'https://developer.atlassian.com/cloud/trello/rest', 'n8n-nodes-base.trello', 'low', 'low', ['Task automation']],
  ['Jira', 'project', 'oauth2', 'https://developer.atlassian.com/cloud/jira/platform/rest/v3', 'n8n-nodes-base.jira', 'medium', 'medium', ['Issue tracking sync']],
];

async function run() {
  let n = 0;
  for (const [toolName, category, authMethod, docs, node, complexity, security, useCases] of T) {
    await upsertTool({
      toolName, category, authMethod,
      documentationUrl: docs,
      apiAvailable: true,          // all listed tools expose an API
      mcpAvailable: false,         // no official first-party MCP server (consumed via API)
      n8nNodeType: node,
      integrationComplexity: complexity,
      securityRisk: security,
      securityNotes: security === 'high' ? 'Handles sensitive financial/PII data — scope tokens tightly.' : null,
      useCases,
      confidence: 'medium',        // factual auth/docs; complexity/security are reasoned estimates
      lastCheckedAt: LAST_CHECKED,
    });
    n += 1;
  }
  console.log(`Seeded ${n} tool-intelligence records.`);
  console.log('Rate limits, pricing detail and MCP servers left blank — verify + fill per tool.');
  await pool.end();
}

run().catch((err) => { console.error('Seed failed:', err); process.exit(1); });
