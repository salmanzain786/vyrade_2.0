import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { listIngestedTasks } from '@/lib/services/work-intelligence/ingestedTaskRepository';

export const dynamic = 'force-dynamic';

// The task picker (Phase 2.1). Lists the current user's ingested tasks.
export const GET = withAuth(async (user, request) => {
  const connectionId = new URL(request.url).searchParams.get('connectionId') || null;
  const tasks = await listIngestedTasks(user.id, { connectionId }).catch(() => []);
  return NextResponse.json({ tasks });
});
