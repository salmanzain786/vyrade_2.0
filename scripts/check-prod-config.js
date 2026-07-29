/**
 * Production-config readiness check (pre-beta gate #6).
 *
 *   node scripts/check-prod-config.js
 *
 * Reports the four deployment-config items the review flagged. Some are choices
 * (SMTP real vs console, TRUST_PROXY) → reported as WARN, never fatal. The
 * Pinecone embedding-model check is verifiable: an index's DIMENSION is fixed at
 * build time by the embedding used, so a configured model whose dimension does
 * not match the index almost certainly means the wrong model — that's a FAIL.
 *
 * Exit code: non-zero if any hard FAIL (so it can gate a deploy).
 */
import 'dotenv/config';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import {
  EMBEDDING_MODEL, WORKFLOW_EMBEDDING_MODEL, TOOL_EMBEDDING_MODEL,
  MCP_EMBEDDING_MODEL, MAKE_EMBEDDING_MODEL, ZAPIER_EMBEDDING_MODEL, PINECONE_INDEX,
  getPineconeIndex, getPineconeWorkflowIndex, getPineconeToolIndex,
  getPineconeMcpIndex, getPineconeMakeIndex, getPineconeZapierIndex,
  isWorkflowIndexConfigured, isToolIndexConfigured, isMcpIndexConfigured,
  isMakeIndexConfigured, isZapierIndexConfigured,
} from '../lib/config/pinecone.js';
import { trustProxyHops } from '../lib/auth/clientIp.js';

let hardFail = false;
const line = (icon, label, detail) => console.log(`  ${icon} ${label.padEnd(26)} ${detail}`);
const PASS = '✓', WARN = '●', FAIL = '✗', SKIP = '·';

// Standard OpenAI embedding dimensions (index dimension is set at build time).
const EXPECTED_DIM = { 'text-embedding-3-large': 3072, 'text-embedding-3-small': 1536, 'text-embedding-ada-002': 1536 };

function checkSmtp() {
  console.log('\n1. SMTP (OTP delivery)');
  const set = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  if (!set) { line(WARN, 'SMTP_HOST/USER/PASS', 'NOT set → OTP codes print to the SERVER CONSOLE (dev fallback).'); return; }
  let hasNodemailer = true;
  try { require.resolve('nodemailer'); } catch { hasNodemailer = false; }
  if (!hasNodemailer) { line(FAIL, 'nodemailer', 'SMTP is set but nodemailer is NOT installed → still console-only. Run `npm install nodemailer`.'); hardFail = true; return; }
  line(PASS, 'SMTP + nodemailer', `real email via ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}`);
}

function checkTrustProxy() {
  console.log('\n2. TRUST_PROXY (per-IP rate limiting)');
  const hops = trustProxyHops();
  if (hops > 0) line(PASS, 'TRUST_PROXY', `${process.env.TRUST_PROXY} → ${hops} trusted hop(s); XFF client IP honoured.`);
  else line(WARN, 'TRUST_PROXY', 'unset/0 → XFF ignored. If the app sits behind Nginx/Cloudflare/ALB, per-IP limits collapse to the proxy IP — set TRUST_PROXY=1 (or hop count).');
}

function checkPricing() {
  console.log('\n3. Token pricing');
  const envOverride = process.env.OPENAI_PRICE_INPUT || process.env.OPENAI_PRICE_OUTPUT;
  if (envOverride) line(PASS, 'OPENAI_PRICE_*', `override active (in=${process.env.OPENAI_PRICE_INPUT ?? '—'}, out=${process.env.OPENAI_PRICE_OUTPUT ?? '—'} USD/1M).`);
  else line(WARN, 'OPENAI_PRICE_*', 'using built-in defaults in lib/config/pricing.js — confirm they match your negotiated rates, or set OPENAI_PRICE_INPUT/OUTPUT.');
}

async function checkPinecone() {
  console.log('\n4. Pinecone indexes — embedding model ⇄ index dimension');
  const INDEXES = [
    { label: 'node (primary)', model: EMBEDDING_MODEL, get: getPineconeIndex, configured: () => Boolean(process.env.PINECONE_API_KEY && PINECONE_INDEX) },
    { label: 'workflow examples', model: WORKFLOW_EMBEDDING_MODEL, get: getPineconeWorkflowIndex, configured: isWorkflowIndexConfigured },
    { label: 'tools', model: TOOL_EMBEDDING_MODEL, get: getPineconeToolIndex, configured: isToolIndexConfigured },
    { label: 'mcp', model: MCP_EMBEDDING_MODEL, get: getPineconeMcpIndex, configured: isMcpIndexConfigured },
    { label: 'make', model: MAKE_EMBEDDING_MODEL, get: getPineconeMakeIndex, configured: isMakeIndexConfigured },
    { label: 'zapier', model: ZAPIER_EMBEDDING_MODEL, get: getPineconeZapierIndex, configured: isZapierIndexConfigured },
  ];
  for (const ix of INDEXES) {
    if (!ix.configured()) { line(SKIP, ix.label, 'not configured (skipped)'); continue; }
    try {
      const idx = ix.get();
      const stats = await idx.describeIndexStats();
      const dim = stats.dimension;
      const count = stats.totalRecordCount ?? Object.values(stats.namespaces || {}).reduce((s, n) => s + (n.recordCount || 0), 0);
      const expected = EXPECTED_DIM[ix.model];
      if (expected == null) line(WARN, ix.label, `dim=${dim}, ${count} vectors, model=${ix.model} (unknown standard dim — verify manually).`);
      else if (dim === expected) line(PASS, ix.label, `dim=${dim} matches ${ix.model}; ${count} vectors.`);
      else { line(FAIL, ix.label, `dim=${dim} but ${ix.model} expects ${expected} — WRONG embedding model for this index.`); hardFail = true; }
    } catch (err) {
      line(FAIL, ix.label, `configured but unreachable: ${err.message}`); hardFail = true;
    }
  }
}

async function main() {
  console.log('Vyrade — production configuration readiness\n===========================================');
  checkSmtp();
  checkTrustProxy();
  checkPricing();
  await checkPinecone();
  console.log('\n===========================================');
  if (hardFail) { console.error('✗ One or more HARD checks failed (see ✗ above). Not production-ready.'); process.exit(1); }
  console.log('✓ No hard failures. Review any ● WARN items against your deployment.');
  process.exit(0);
}
main().catch((err) => { console.error('config check error:', err.message); process.exit(1); });
