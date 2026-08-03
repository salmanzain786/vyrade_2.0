import { withAdmin } from '@/lib/auth/guard';
import { costSummary, perUserSpend } from '@/lib/services/admin/adminCostRepository';
import { toCsv, csvResponse } from '@/lib/services/admin/csv';

export const dynamic = 'force-dynamic';

const RANGES = [7, 30, 90];
const COLUMNS = [
  { label: 'user_email', key: 'email' },
  { label: 'tokens', key: 'tokens' },
  { label: 'cost_usd', get: (r) => r.cost.toFixed(6) },
  { label: 'conversations', key: 'convos' },
  { label: 'spike', get: (r) => (r.spike ? 'yes' : 'no') },
  { label: 'last_activity', get: (r) => (r.last_activity instanceof Date ? r.last_activity : new Date(r.last_activity)).toISOString() },
];

export const GET = withAdmin(async (_user, request) => {
  const url = new URL(request.url);
  const days = RANGES.includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
  const { mean_cost } = await costSummary({ days });
  const { rows } = await perUserSpend({ days, all: true, meanCost: mean_cost });
  return csvResponse(toCsv(rows, COLUMNS), `cost-${days}d.csv`);
});
