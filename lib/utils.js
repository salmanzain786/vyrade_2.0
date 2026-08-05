import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Sanitize a `next`/return-to redirect target. Only allows internal absolute
 * paths so an attacker can't turn a post-auth redirect into an open redirect
 * (protocol-relative `//evil.com`, absolute `https://evil.com`, etc.).
 */
export function safeNext(next, fallback = '/') {
  if (typeof next !== 'string' || !next) return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('://') || next.includes('\\')) return fallback;
  return next;
}

/**
 * The single money-formatting utility for all UI. Formats `amount` in the given
 * `currency` (pricing data is USD, so that's the default) using the VIEWER's
 * locale conventions for grouping/separators — so a Pakistan-locale user sees
 * locale-appropriate formatting while the currency stays what the data says
 * (e.g. "$1,234.56" in USD). Sub-dollar amounts keep 4 dp (per-task prices);
 * `null`/`undefined` returns null so callers can render a dash.
 */
export function formatMoney(amount, currency = 'USD', { locale, maximumFractionDigits } = {}) {
  if (amount == null) return null;
  const digits = maximumFractionDigits ?? (amount !== 0 && Math.abs(amount) < 1 ? 4 : 2);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: amount === 0 ? 0 : digits,
      maximumFractionDigits: digits,
    }).format(amount);
  } catch {
    // Invalid/unknown currency code → plain number + code rather than throw.
    return `${Number(amount).toFixed(digits)} ${currency}`;
  }
}
