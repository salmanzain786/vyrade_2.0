import { withAdmin } from '@/lib/auth/guard';
import { listBlueprints } from '@/lib/services/admin/adminBlueprintsRepository';
import { toCsv, csvResponse } from '@/lib/services/admin/csv';

export const dynamic = 'force-dynamic';

const COLUMNS = [
  { label: 'name', key: 'name' },
  { label: 'user_email', key: 'user_email' },
  { label: 'status', key: 'status' },
  { label: 'readiness_score', key: 'readiness_score' },
  { label: 'blocking_unknowns', key: 'blocking_count' },
  { label: 'version', key: 'version' },
  { label: 'last_activity', get: (r) => (r.updated_at instanceof Date ? r.updated_at : new Date(r.updated_at)).toISOString() },
  { label: 'blueprint_id', key: 'id' },
];

export const GET = withAdmin(async (_user, request) => {
  const url = new URL(request.url);
  const { rows } = await listBlueprints({
    search: (url.searchParams.get('search') || '').trim(),
    status: url.searchParams.get('status') || '',
    all: true,
  });
  return csvResponse(toCsv(rows, COLUMNS), 'blueprints.csv');
});
