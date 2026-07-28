import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
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
