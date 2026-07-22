/**
 * Seed the Cost Intelligence pricing registries.
 *
 *   node scripts/seed-pricing.mjs
 *
 * Run it as many times as you like — every row is an UPSERT (keyed on
 * provider+component or connector+platform), so re-running refreshes in place.
 *
 * HONESTY CONTRACT (do not break it):
 *   • unit_price is a NUMBER only when it is a real figure you verified on the
 *     official page. Otherwise leave it `null` — the engine will report the
 *     component as "unknown" rather than guess. That is the whole point.
 *   • When you fill in a number, update LAST_CHECKED to the date you checked.
 *   • Only official_pricing_page / official_help_doc sources may be `high`
 *     confidence (the engine enforces this anyway).
 *
 * WHAT THIS FILE DOES SAFELY FOR YOU:
 *   • Registers the official pricing-page SOURCES (URLs) for each platform.
 *   • Seeds genuinely no-added-cost connectors (Slack on an existing plan,
 *     Google Sheets) at a real $0 — a structural fact, not a guess.
 *   • Leaves every metered PRICE null with a TODO, for you to fill after
 *     reading the live page.
 */
import 'dotenv/config';
import { upsertPricingSource } from '../lib/services/cost/pricingSourceRepository.js';
import { upsertConnectorProfile } from '../lib/services/cost/connectorProfileRepository.js';
import { pool } from '../lib/config/db.js';

// Stamp the date you last verified these. Bump it whenever you re-check prices.
const LAST_CHECKED = '2026-07-21 00:00:00';

// ─────────────────────────────────────────────────────────────────────────
// 1) PLATFORM PRICES  (pricing_sources)
//    URLs are safe to register now. Fill `parsedPrice` ONLY with a number you
//    read on the page; leave it null otherwise.
// ─────────────────────────────────────────────────────────────────────────
const PLATFORM_SOURCES = [
  {
    provider: 'zapier', componentType: 'platform_task_usage',
    url: 'https://zapier.com/pricing', sourceType: 'official_pricing_page',
    // TODO: e.g. Professional plan effective $/task at your tier. null = unknown.
    parsedPrice: null, unit: 'task',
    notes: 'Zapier task price is plan-tier dependent — compute effective $/task from your plan.',
  },
  {
    provider: 'make', componentType: 'platform_operation_usage',
    url: 'https://www.make.com/en/pricing', sourceType: 'official_pricing_page',
    parsedPrice: null, unit: 'operation',
    notes: 'Make operation price = plan monthly price ÷ included operations.',
  },
  {
    provider: 'n8n', componentType: 'platform_execution_usage',
    url: 'https://n8n.io/pricing', sourceType: 'official_pricing_page',
    parsedPrice: null, unit: 'execution',
    notes: 'n8n Cloud bills per execution; self-hosted executions are unmetered.',
  },
  {
    provider: 'n8n', componentType: 'platform_subscription',
    url: 'https://n8n.io/pricing', sourceType: 'official_pricing_page',
    parsedPrice: null, unit: 'month',
    notes: 'n8n Cloud plan monthly price. Self-host = $0 here (see hosting).',
  },
  {
    provider: 'openai', componentType: 'llm_tokens',
    url: 'https://openai.com/api/pricing/', sourceType: 'official_pricing_page',
    parsedPrice: null, unit: 'token',
    notes: 'Per-token price depends on the model chosen. Fill per model as needed.',
  },
];

// ─────────────────────────────────────────────────────────────────────────
// 2) CONNECTOR / TOOL PROFILES  (connector_cost_profiles)
//    The $0 "no added cost" tools are safe to seed now (structural fact).
//    Priced tools: register the URL + pricing_model, leave unitPrice null.
// ─────────────────────────────────────────────────────────────────────────
const CONNECTORS = [
  // ── A) Free API within quota → a real $0 to this automation (medium conf) ──
  {
    connectorName: 'Google Sheets', systemName: 'Google Sheets', pricingModel: 'free',
    requiresPaidPlan: false, freeTierAvailable: true, confidence: 'medium',
    pricingUrl: 'https://developers.google.com/sheets/api/limits',
    notes: 'Sheets API is free within quota; no per-write charge.',
  },
  {
    connectorName: 'Gmail', systemName: 'Gmail', pricingModel: 'free',
    requiresPaidPlan: false, freeTierAvailable: true, confidence: 'medium',
    pricingUrl: 'https://developers.google.com/gmail/api/reference/quota',
    notes: 'Gmail API is free within send/quota limits.',
  },
  {
    connectorName: 'Google Calendar', systemName: 'Google Calendar', pricingModel: 'free',
    requiresPaidPlan: false, freeTierAvailable: true, confidence: 'medium',
    notes: 'Calendar API is free within quota.',
  },
  {
    connectorName: 'Google Drive', systemName: 'Google Drive', pricingModel: 'free',
    requiresPaidPlan: false, freeTierAvailable: true, confidence: 'medium',
    notes: 'Drive API is free within quota; storage is the paid dimension, not calls.',
  },
  {
    connectorName: 'Discord', systemName: 'Discord', pricingModel: 'free',
    requiresPaidPlan: false, freeTierAvailable: true, confidence: 'medium',
    notes: 'Discord bot API is free.',
  },
  {
    connectorName: 'Telegram', systemName: 'Telegram', pricingModel: 'free',
    requiresPaidPlan: false, freeTierAvailable: true, confidence: 'medium',
    notes: 'Telegram Bot API is free.',
  },

  // ── B) Comms / workspace — cost is an existing plan, not per-call ──
  {
    connectorName: 'Slack', systemName: 'Slack', pricingModel: 'workspace_plan',
    requiresPaidPlan: false, confidence: 'medium',
    pricingUrl: 'https://slack.com/pricing',
    notes: 'Slack API adds no per-message cost; workspace plan limits apply.',
  },
  {
    connectorName: 'Microsoft Teams', systemName: 'Microsoft Teams', pricingModel: 'workspace_plan',
    requiresPaidPlan: null, confidence: 'low', pricingUrl: 'https://www.microsoft.com/microsoft-teams/compare-microsoft-teams-options',
    notes: 'Usually part of a Microsoft 365 plan; no per-call API charge. Verify the plan.',
  },

  // ── C) CRM / SaaS — subscription, typically already owned (unit_price null) ──
  {
    connectorName: 'HubSpot', systemName: 'HubSpot', pricingModel: 'subscription',
    pricingUrl: 'https://www.hubspot.com/pricing', requiresPaidPlan: null,
    unitPrice: null, freeTierAvailable: true, confidence: 'low',
    notes: 'CRM plan-based; free tier exists. Often already owned — verify the tier.',
  },
  {
    connectorName: 'Salesforce', systemName: 'Salesforce', pricingModel: 'subscription',
    pricingUrl: 'https://www.salesforce.com/editions-pricing/', requiresPaidPlan: true,
    unitPrice: null, confidence: 'low',
    notes: 'Per-seat CRM subscription; no per-API charge on standard limits.',
  },
  {
    connectorName: 'Shopify', systemName: 'Shopify', pricingModel: 'subscription',
    pricingUrl: 'https://www.shopify.com/pricing', requiresPaidPlan: true,
    unitPrice: null, confidence: 'low',
    notes: 'Store plan required (not per-API-call). Verify the plan in use.',
  },
  {
    connectorName: 'Airtable', systemName: 'Airtable', pricingModel: 'subscription',
    pricingUrl: 'https://airtable.com/pricing', requiresPaidPlan: false,
    freeTierAvailable: true, unitPrice: null, confidence: 'low',
    notes: 'Free tier + paid plans; API included. Verify record/automation limits.',
  },
  {
    connectorName: 'Notion', systemName: 'Notion', pricingModel: 'subscription',
    pricingUrl: 'https://www.notion.so/pricing', requiresPaidPlan: false,
    freeTierAvailable: true, unitPrice: null, confidence: 'low',
    notes: 'API is free to use; Notion plan may already be owned.',
  },
  {
    connectorName: 'Trello', systemName: 'Trello', pricingModel: 'subscription',
    pricingUrl: 'https://trello.com/pricing', requiresPaidPlan: false,
    freeTierAvailable: true, unitPrice: null, confidence: 'low',
    notes: 'Free tier + paid; API included.',
  },
  {
    connectorName: 'Asana', systemName: 'Asana', pricingModel: 'subscription',
    pricingUrl: 'https://asana.com/pricing', requiresPaidPlan: false,
    freeTierAvailable: true, unitPrice: null, confidence: 'low',
    notes: 'Free tier + paid; API included.',
  },
  {
    connectorName: 'Pipedrive', systemName: 'Pipedrive', pricingModel: 'subscription',
    pricingUrl: 'https://www.pipedrive.com/en/pricing', requiresPaidPlan: true,
    unitPrice: null, confidence: 'low',
    notes: 'Per-seat CRM subscription; API included in plan.',
  },
  {
    connectorName: 'Zendesk', systemName: 'Zendesk', pricingModel: 'subscription',
    pricingUrl: 'https://www.zendesk.com/pricing/', requiresPaidPlan: true,
    unitPrice: null, confidence: 'low',
    notes: 'Per-agent support subscription; API included.',
  },
  {
    connectorName: 'Mailchimp', systemName: 'Mailchimp', pricingModel: 'subscription',
    pricingUrl: 'https://mailchimp.com/pricing/', requiresPaidPlan: false,
    freeTierAvailable: true, unitPrice: null, confidence: 'low',
    notes: 'Priced by audience/contacts, not per API call. Free tier exists.',
  },

  // ── D) Usage-billed APIs — REAL unit_price to verify on the page ──
  {
    connectorName: 'Twilio', systemName: 'Twilio', pricingModel: 'per_api_call',
    pricingUrl: 'https://www.twilio.com/en-us/pricing', unitName: 'message',
    unitPrice: null, confidence: 'low',
    notes: 'Per-message price varies by country/number type — fill per use case.',
  },
  {
    connectorName: 'SendGrid', systemName: 'SendGrid', pricingModel: 'usage_based',
    pricingUrl: 'https://sendgrid.com/en-us/pricing', unitName: 'email',
    unitPrice: null, freeTierAvailable: true, confidence: 'low',
    notes: 'Tiered by monthly email volume; free tier exists. Fill effective $/email.',
  },
  {
    connectorName: 'Mailgun', systemName: 'Mailgun', pricingModel: 'usage_based',
    pricingUrl: 'https://www.mailgun.com/pricing/', unitName: 'email',
    unitPrice: null, freeTierAvailable: true, confidence: 'low',
    notes: 'Tiered by monthly email volume. Fill effective $/email.',
  },
  {
    connectorName: 'Stripe', systemName: 'Stripe', pricingModel: 'usage_based',
    pricingUrl: 'https://stripe.com/pricing', unitName: 'transaction',
    unitPrice: null, confidence: 'low',
    notes: 'Per-transaction is a percentage + fixed fee (varies by region/method). Model carefully — not a flat unit price.',
  },
  {
    connectorName: 'OpenAI', systemName: 'OpenAI', pricingModel: 'per_api_call',
    pricingUrl: 'https://openai.com/api/pricing/', unitName: 'token',
    unitPrice: null, confidence: 'low',
    notes: 'Per-token, depends on the model. See also the LLM token cost line.',
  },
  {
    connectorName: 'Anthropic', systemName: 'Anthropic', pricingModel: 'per_api_call',
    pricingUrl: 'https://www.anthropic.com/pricing', unitName: 'token',
    unitPrice: null, confidence: 'low',
    notes: 'Per-token, depends on the Claude model chosen.',
  },
  {
    connectorName: 'Google Maps', systemName: 'Google Maps', pricingModel: 'per_api_call',
    pricingUrl: 'https://mapsplatform.google.com/pricing/', unitName: 'request',
    unitPrice: null, freeTierAvailable: true, confidence: 'low',
    notes: 'Per-request with a monthly free credit. Fill $/request for the API used.',
  },
  {
    connectorName: 'OpenWeather', systemName: 'OpenWeather', pricingModel: 'per_api_call',
    pricingUrl: 'https://openweathermap.org/price', unitName: 'call',
    unitPrice: null, freeTierAvailable: true, confidence: 'low',
    notes: 'Free tier + paid per-call tiers.',
  },
  {
    connectorName: 'Hunter', systemName: 'Hunter', pricingModel: 'per_api_call',
    pricingUrl: 'https://hunter.io/pricing', unitName: 'validation',
    unitPrice: null, freeTierAvailable: true, confidence: 'low',
    notes: 'Email finder/verifier billed per request; free tier + paid plans.',
  },
];

async function run() {
  let sources = 0, prices = 0, connectors = 0;

  for (const s of PLATFORM_SOURCES) {
    await upsertPricingSource({
      provider: s.provider,
      componentType: s.componentType,
      sourceType: s.sourceType,
      pricingUrl: s.url,
      extractionMethod: 'manual',
      // Confidence is high ONLY when we actually have a verified price from the
      // official page; a URL with no number yet is not a high-confidence price.
      confidence: s.parsedPrice != null ? 'high' : 'unknown',
      parsedJson: s.parsedPrice != null ? { price: s.parsedPrice, currency: 'USD', unit: s.unit } : null,
      notes: s.notes,
      lastCheckedAt: LAST_CHECKED,
    });
    sources += 1;
    if (s.parsedPrice != null) prices += 1;
  }

  for (const c of CONNECTORS) {
    await upsertConnectorProfile({ ...c, lastCheckedAt: LAST_CHECKED });
    connectors += 1;
  }

  console.log(`Seeded ${sources} platform sources (${prices} with a verified price), ${connectors} connectors.`);
  console.log(prices === 0
    ? 'No platform PRICES set yet — fill `parsedPrice` in this file after checking the official pages, then re-run.'
    : 'Priced sources are live; the cost estimate will now show real numbers for those lines.');
  await pool.end();
}

run().catch((err) => { console.error('Seed failed:', err); process.exit(1); });
