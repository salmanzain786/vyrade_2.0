import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { getOpportunity, canActOnOpportunity, attachBlueprint } from '@/lib/services/work-intelligence/patterns/opportunityRepository';
import { getIngestedTaskByExternal } from '@/lib/services/work-intelligence/ingestedTaskRepository';
import { buildTaskContext } from '@/lib/services/work-intelligence/discovery/context';
import { generateQuestions } from '@/lib/services/work-intelligence/discovery/clarification';
import { createSession } from '@/lib/services/work-intelligence/discovery/discoveryRepository';

export const dynamic = 'force-dynamic';

// Turn a CONFIRMED opportunity into a draft Blueprint (Phase 3.3 → reuses Phase 2
// discovery). Starts a clarification session from a representative task so the
// human still confirms/refines before a Blueprint is generated — never auto.
//   POST → { discoveryId }
export const POST = withAuth(async (user, request, { params }) => {
  const opp = await getOpportunity(params.id);
  if (!opp) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canActOnOpportunity(opp, user.id))) return NextResponse.json({ error: 'Not permitted' }, { status: 403 });

  const externalId = opp.evidence?.task_ids?.[0];
  if (!externalId) return NextResponse.json({ error: 'This opportunity has no linked task to start from.' }, { status: 400 });
  // The representative task belongs to the opportunity's CREATOR (a manager may
  // be acting on a team member's opportunity); the discovery is owned by the actor.
  const task = await getIngestedTaskByExternal(opp.user_id, externalId);
  if (!task) return NextResponse.json({ error: 'Representative task not found (it may have aged out of retention).' }, { status: 404 });

  const context = buildTaskContext(task);
  const questions = await generateQuestions(context);
  const session = await createSession({
    userId: user.id, connectionId: task.connection_id, platform: task.platform,
    externalTaskId: task.external_id, taskName: opp.title, context, questions,
  });
  await attachBlueprint(params.id, { blueprintId: null, discoveryId: session.id });
  return NextResponse.json({ discoveryId: session.id });
});
