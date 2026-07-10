import { NextResponse } from 'next/server';
import { listConversations } from '../../../lib/services/conversationRepository.js';
import { withAuth } from '../../../lib/auth/guard.js';

// Never prerender/cache: the sidebar must reflect the live conversation list.
export const dynamic = 'force-dynamic';

export const GET = withAuth(async (user) => {
  const conversations = await listConversations(user.id);
  return NextResponse.json({ conversations });
});
