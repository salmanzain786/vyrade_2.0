/**
 * Subscription persistence. The Lemon Squeezy webhook is the source of truth;
 * the /purchase page reads from here to decide Buy-Now vs. Manage.
 */
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../config/db.js';

// Statuses that mean "the user currently HAS a subscription".
export const ACTIVE_STATUSES = new Set(['active', 'on_trial', 'past_due', 'paused', 'cancelled']);
// `cancelled` still grants access until `ends_at`; `expired`/`unpaid` do not.
export function isActiveStatus(status) {
  return ACTIVE_STATUSES.has(String(status || ''));
}

const toDate = (v) => (v ? new Date(v) : null);
const toIso = (v) => (v == null ? null : (v instanceof Date ? v : new Date(v)).toISOString());

/** The user's most-recent subscription row, or null. */
export async function getSubscriptionByUser(userId) {
  if (!userId) return null;
  const [rows] = await pool.query(
    'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
    [userId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/**
 * Turn a Lemon Squeezy subscription webhook payload into our row shape.
 * Covers subscription_created / _updated / _cancelled / _resumed / _expired / _paused.
 */
export function normalizeSubscription(payload) {
  const data = payload?.data || {};
  const a = data.attributes || {};
  const userId = payload?.meta?.custom_data?.user_id ?? null;
  const urls = a.urls || {};
  return {
    ls_subscription_id: String(data.id),
    user_id: userId ? String(userId) : null,
    ls_customer_id: a.customer_id != null ? String(a.customer_id) : null,
    ls_order_id: a.order_id != null ? String(a.order_id) : null,
    ls_product_id: a.product_id != null ? String(a.product_id) : null,
    ls_variant_id: a.variant_id != null ? String(a.variant_id) : null,
    product_name: a.product_name ?? null,
    variant_name: a.variant_name ?? null,
    status: a.status ?? null,
    card_brand: a.card_brand ?? null,
    card_last_four: a.card_last_four ?? null,
    trial_ends_at: toDate(a.trial_ends_at),
    renews_at: toDate(a.renews_at),
    ends_at: toDate(a.ends_at),
    // LS exposes the current period END as renews_at; start isn't in the payload,
    // so we record end and keep the full payload in raw_json for anything else.
    current_period_start: toDate(a.created_at),
    current_period_end: toDate(a.renews_at),
    customer_portal_url: urls.customer_portal || null,
    update_url: urls.customer_portal_update_subscription || urls.update_payment_method || null,
    raw_json: JSON.stringify(payload),
  };
}

const COLS = [
  'user_id', 'ls_customer_id', 'ls_order_id', 'ls_product_id', 'ls_variant_id',
  'product_name', 'variant_name', 'status', 'card_brand', 'card_last_four',
  'trial_ends_at', 'renews_at', 'ends_at', 'current_period_start', 'current_period_end',
  'customer_portal_url', 'update_url', 'raw_json',
];

/** Insert or update a subscription keyed on ls_subscription_id. */
export async function upsertSubscription(sub) {
  const [existing] = await pool.query('SELECT id FROM subscriptions WHERE ls_subscription_id = ? LIMIT 1', [sub.ls_subscription_id]);
  if (existing[0]) {
    // Never blank out a known user_id if a later event omits it.
    const setCols = COLS.filter((c) => !(c === 'user_id' && sub.user_id == null));
    const setSql = setCols.map((c) => `${c} = ?`).join(', ');
    await pool.query(
      `UPDATE subscriptions SET ${setSql} WHERE ls_subscription_id = ?`,
      [...setCols.map((c) => sub[c]), sub.ls_subscription_id]
    );
    return existing[0].id;
  }
  const id = uuidv4();
  await pool.query(
    `INSERT INTO subscriptions (id, ls_subscription_id, ${COLS.join(', ')})
     VALUES (?, ?, ${COLS.map(() => '?').join(', ')})`,
    [id, sub.ls_subscription_id, ...COLS.map((c) => sub[c])]
  );
  return id;
}

function mapRow(r) {
  return {
    id: r.id,
    user_id: r.user_id,
    ls_subscription_id: r.ls_subscription_id,
    ls_product_id: r.ls_product_id,
    ls_variant_id: r.ls_variant_id,
    product_name: r.product_name,
    variant_name: r.variant_name,
    status: r.status,
    is_active: isActiveStatus(r.status),
    card_brand: r.card_brand,
    card_last_four: r.card_last_four,
    trial_ends_at: toIso(r.trial_ends_at),
    renews_at: toIso(r.renews_at),
    ends_at: toIso(r.ends_at),
    current_period_start: toIso(r.current_period_start),
    current_period_end: toIso(r.current_period_end),
    customer_portal_url: r.customer_portal_url,
    update_url: r.update_url,
  };
}

export default { getSubscriptionByUser, normalizeSubscription, upsertSubscription, isActiveStatus };
