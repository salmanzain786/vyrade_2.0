import { NextResponse } from 'next/server';
import { listConversations } from '../../../lib/services/conversationRepository.js';

// Never prerender/cache: the sidebar must reflect the live conversation list.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const conversations = await listConversations();
    return NextResponse.json({ conversations });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
