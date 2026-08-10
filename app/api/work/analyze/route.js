import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { analyzeWork } from '@/lib/services/work-intelligence/patterns/analyze';

export const dynamic = 'force-dynamic';

// Org-wide / project analysis (Phase 3.1/3.4).
//   POST { mode: 'recurring' | 'project', project? }
export const POST = withAuth(async (user, request) => {
  const { mode = 'recurring', project = null } = await request.json().catch(() => ({}));
  try {
    const result = await analyzeWork({ userId: user.id, mode, project });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: `Analysis failed: ${err.message}` }, { status: 500 });
  }
});
