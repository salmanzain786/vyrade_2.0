import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { getIngestedTaskById } from '@/lib/services/work-intelligence/ingestedTaskRepository';
import { buildTaskContext } from '@/lib/services/work-intelligence/discovery/context';
import { generateQuestions } from '@/lib/services/work-intelligence/discovery/clarification';
import { createSession } from '@/lib/services/work-intelligence/discovery/discoveryRepository';

export const dynamic = 'force-dynamic';

// "Explore Automation With Vyrade" (Phase 2.1/2.2/2.3). Start a discovery session
// for one ingested task: build context, detect signals, generate clarifications.
//   POST { ingestedTaskId }
export const POST = withAuth(async (user, request) => {
  const { ingestedTaskId } = await request.json().catch(() => ({}));
  if (!ingestedTaskId) return NextResponse.json({ error: 'ingestedTaskId is required' }, { status: 400 });

  const task = await getIngestedTaskById(ingestedTaskId, user.id);
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const context = buildTaskContext(task);
  const questions = await generateQuestions(context);
  const session = await createSession({
    userId: user.id, connectionId: task.connection_id, platform: task.platform,
    externalTaskId: task.external_id, taskName: task.name, context, questions,
  });
  return NextResponse.json({ session }, { status: 201 });
});
