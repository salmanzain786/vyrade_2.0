import { NextResponse } from 'next/server';
import { getMessages } from '../../../../lib/services/conversationRepository.js';
import { getBySession, getLatestWorkflowRecord } from '../../../../lib/services/blueprintRepository.js';
import { isWorkflowStale } from '../../../../lib/services/workflowStatus.js';
import { withAuth } from '../../../../lib/auth/guard.js';
import { assertSessionAccess } from '../../../../lib/auth/ownership.js';

export const dynamic = 'force-dynamic';

// Load one conversation: its full message history, the latest Blueprint for the
// session, and any previously generated workflow (so the sheet, generate, and
// download buttons all restore on reopen). Scoped to the owning user — a
// brand-new/unknown session simply returns empties.
export const GET = withAuth(async (user, request, { params }) => {
  const { exists } = await assertSessionAccess(user, params.sessionId);
  if (!exists) {
    return NextResponse.json({ messages: [], blueprint: null, workflow: null, workflowMeta: null });
  }

  const [messages, blueprint] = await Promise.all([
    getMessages(params.sessionId),
    getBySession(params.sessionId),
  ]);

  // Return the newest generated workflow together with staleness info: a
  // workflow generated from Blueprint v5 is stale once the Blueprint is v6.
  let workflow = null;
  let workflowMeta = null;
  if (blueprint) {
    const record = await getLatestWorkflowRecord(blueprint.blueprint_id);
    if (record) {
      workflow = record.workflow;
      workflowMeta = {
        generated_from_version: record.generated_from_version,
        current_blueprint_version: blueprint.version,
        is_stale: isWorkflowStale(record.generated_from_version, blueprint.version),
      };
    }
  }

  return NextResponse.json({ messages, blueprint, workflow, workflowMeta });
});
