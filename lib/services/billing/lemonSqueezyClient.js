/**
 * Lemon Squeezy API client (server-only). JSON:API over HTTPS.
 * https://docs.lemonsqueezy.com/api
 */
import { LS_BASE_URL, LS_API_KEY, LS_STORE_ID } from '../../config/lemonsqueezy.js';

async function ls(path, init = {}) {
  const res = await fetch(`${LS_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${LS_API_KEY}`,
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.errors?.[0]?.detail || `HTTP ${res.status}`;
    throw new Error(`Lemon Squeezy: ${detail}`);
  }
  return body;
}

// The store's currency (e.g. "USD"), memoized — used to format a single
// variant's exact price rather than the product's cross-variant range.
let _currency = null;
async function getStoreCurrency() {
  if (_currency) return _currency;
  try {
    const { data } = await ls(`/stores/${LS_STORE_ID}`);
    _currency = data?.attributes?.currency || 'USD';
  } catch {
    _currency = 'USD';
  }
  return _currency;
}

function formatPrice(cents, currency) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return null;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(n / 100);
  } catch {
    return `${(n / 100).toFixed(2)} ${currency || 'USD'}`;
  }
}

/** Product details for the purchase page (name, description, price, image). */
export async function getProduct(productId) {
  const { data } = await ls(`/products/${productId}`);
  const a = data.attributes || {};
  return {
    id: data.id,
    name: a.name,
    description: a.description || '',
    price: a.price,
    price_formatted: a.price_formatted,
    thumb: a.large_thumb_url || a.thumb_url || null,
    status: a.status,
    buy_now_url: a.buy_now_url || null,
  };
}

/**
 * A variant + its parent product (name/description/image/price) in one call.
 * The /purchase/[variantId] route param is a VARIANT id, so this is what the
 * page and checkout use.
 */
export async function getVariant(variantId) {
  const [body, currency] = await Promise.all([
    ls(`/variants/${encodeURIComponent(variantId)}?include=product`),
    getStoreCurrency(),
  ]);
  const v = body.data || {};
  const va = v.attributes || {};
  const productId = va.product_id != null
    ? String(va.product_id)
    : (v.relationships?.product?.data?.id ?? null);
  const p = (body.included || []).find((x) => x.type === 'products')?.attributes || {};
  // Exact price of THIS variant (va.price is in cents) — not the product's
  // cross-variant range (p.price_formatted).
  const price_formatted = formatPrice(va.price, currency) || p.price_formatted || null;
  return {
    variant_id: v.id,
    variant_name: va.name || p.name || 'Plan',
    interval: va.interval || null,
    interval_count: va.interval_count || 1,
    is_subscription: va.is_subscription ?? null,
    product_id: productId,
    name: p.name || va.name || 'Product',
    description: p.description || '',
    price_formatted,
    thumb: p.large_thumb_url || p.thumb_url || null,
    status: p.status || null,
  };
}

/**
 * Create a hosted checkout and return its URL. `userId` is stamped into the
 * checkout's custom data so the webhook can link the resulting subscription to
 * our user. `redirectUrl` is where LS sends the customer after payment.
 */
export async function createCheckout({ variantId, email, userId, redirectUrl }) {
  const attributes = {
    checkout_data: {
      ...(email ? { email } : {}),
      custom: { user_id: String(userId) },
    },
    ...(redirectUrl ? { product_options: { redirect_url: redirectUrl } } : {}),
  };
  const payload = {
    data: {
      type: 'checkouts',
      attributes,
      relationships: {
        store: { data: { type: 'stores', id: String(LS_STORE_ID) } },
        variant: { data: { type: 'variants', id: String(variantId) } },
      },
    },
  };
  const { data } = await ls('/checkouts', { method: 'POST', body: JSON.stringify(payload) });
  return data?.attributes?.url || null;
}

export default { getProduct, getVariant, createCheckout };
