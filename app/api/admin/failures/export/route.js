import { withAdmin } from '@/lib/auth/guard';
import { recentFailures } from '@/lib/services/admin/adminFailuresRepository';
import { toCsv, csvResponse } from '@/lib/services/admin/csv';

export const dynamic = 'force-dynamic';

const RANGES = [7, 30, 90];
const COLUMNS = [
  { label: 'when', get: (r) => (r.created_at instanceof Date ? r.created_at : new Date(r.created_at)).toISOString() },
  { label: 'type', key: 'type' },
  { label: 'platform', key: 'platform' },
  { label: 'blueprint', key: 'blueprint_name' },
  { label: 'user_email', key: 'user_email' },
  { label: 'node_type', key: 'node_type' },
  { label: 'error_category', key: 'error_category' },
  { label: 'severity', key: 'severity' },
];

export const GET = withAdmin(async (_user, request) => {
  const url = new URL(request.url);
  const days = RANGES.includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
  const { rows } = await recentFailures({ days, all: true });
  return csvResponse(toCsv(rows, COLUMNS), `failures-${days}d.csv`);
});
