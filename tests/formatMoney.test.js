import { describe, it, expect } from 'vitest';
import { formatMoney } from '../lib/utils.js';

describe('formatMoney — the single shared money utility', () => {
  it('formats USD by default with 2 dp', () => {
    // Force en-US locale for a deterministic assertion.
    expect(formatMoney(1234.5, 'USD', { locale: 'en-US' })).toBe('$1,234.50');
  });

  it('keeps 4 dp for sub-dollar amounts (per-task/unit prices)', () => {
    expect(formatMoney(0.0288, 'USD', { locale: 'en-US' })).toBe('$0.0288');
  });

  it('renders a clean zero', () => {
    expect(formatMoney(0, 'USD', { locale: 'en-US' })).toBe('$0');
  });

  it('returns null for null/undefined (callers render a dash)', () => {
    expect(formatMoney(null)).toBeNull();
    expect(formatMoney(undefined)).toBeNull();
  });

  it('preserves the pricing currency (USD stays USD) regardless of viewer locale', () => {
    // A Pakistan-locale viewer still sees USD when the data is USD — only the
    // grouping/format conventions follow the locale.
    const pk = formatMoney(1234.5, 'USD', { locale: 'ur-PK' });
    expect(pk).toContain('1,234');   // still the USD amount
    expect(pk).toMatch(/\$|US/);      // symbol/code preserved, not localized away
  });

  it('formats a non-USD currency when asked', () => {
    expect(formatMoney(1000, 'PKR', { locale: 'en-US' })).toMatch(/PKR|₨/);
  });

  it('falls back gracefully on an invalid currency code', () => {
    expect(formatMoney(10, 'NOTACURRENCY')).toBe('10.00 NOTACURRENCY');
  });
});
