import { describe, it, expect } from 'vitest';
import { toCsv } from '../lib/services/admin/csv.js';

describe('toCsv — safe CSV serialization', () => {
  const cols = [
    { label: 'name', key: 'name' },
    { label: 'cost', get: (r) => r.cost.toFixed(2) },
  ];

  it('emits a header + rows', () => {
    const csv = toCsv([{ name: 'Payroll', cost: 6.2 }], cols);
    expect(csv).toBe('name,cost\r\nPayroll,6.20');
  });

  it('quotes and escapes commas, quotes and newlines', () => {
    const csv = toCsv([{ name: 'A, "B"\nC', cost: 0 }], cols);
    expect(csv).toBe('name,cost\r\n"A, ""B""\nC",0.00');
  });

  it('renders null/undefined as empty, Dates as ISO', () => {
    const c = [{ label: 'x', key: 'x' }, { label: 'd', key: 'd' }];
    const csv = toCsv([{ x: null, d: new Date('2026-07-29T00:00:00Z') }], c);
    expect(csv).toBe('x,d\r\n,2026-07-29T00:00:00.000Z');
  });

  it('handles an empty row set (header only)', () => {
    expect(toCsv([], cols)).toBe('name,cost');
  });
});
