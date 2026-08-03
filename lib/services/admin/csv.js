/**
 * CSV export helper for the admin views (milestone 3.7).
 * RFC-4180-ish escaping so values with commas/quotes/newlines survive.
 */
export function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => esc(c.label)).join(',');
  const lines = (rows || []).map((r) =>
    columns.map((c) => esc(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(',')
  );
  return [header, ...lines].join('\r\n');
}

/** A downloadable text/csv Response. */
export function csvResponse(csv, filename) {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
