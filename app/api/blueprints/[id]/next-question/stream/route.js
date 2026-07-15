import { client, MODEL, temperatureFor } from '../../../../../../lib/config/openai.js';
import { prepareQuestion } from '../../../../../../lib/services/clarificationAgent.js';
import { getVersion } from '../../../../../../lib/services/blueprintRepository.js';
import { addMessage, addConversationUsage } from '../../../../../../lib/services/conversationRepository.js';
import { mergeUsage, usageFromCompletion, emptyUsage } from '../../../../../../lib/config/pricing.js';
import { withAuth } from '../../../../../../lib/auth/guard.js';
import { assertBlueprintOwner } from '../../../../../../lib/auth/ownership.js';

export const dynamic = 'force-dynamic';

// Streams the next clarification question as plain text. Header X-Chat-Done:
// "true" signals the interview is complete (empty body).
//
// This route is also where a turn's token cost is recorded: the client forwards
// `blueprint_usage` (from the blueprint create/patch call) and this route adds
// the clarification model call's usage, then persists the AGENT message with the
// combined cost (or, when no question is produced, adds the cost to the
// conversation total). The client therefore no longer persists agent messages.
export const POST = withAuth(async (user, request, { params }) => {
  await assertBlueprintOwner(user, params.id);
  try {
    const { version, conversation_so_far, blueprint_usage } = await request.json();
    const current = await getVersion(params.id, Number(version));
    if (!current) {
      return new Response(JSON.stringify({ error: 'Blueprint version not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    const sessionId = current.session_id;
    const bpUsage = blueprint_usage || emptyUsage(MODEL);

    const prep = prepareQuestion(current.blueprint, conversation_so_far || '');

    // Interview already complete — no model call. Still record the blueprint
    // usage this turn cost (no agent message to hang it on).
    if (prep.done) {
      await addConversationUsage(sessionId, user.id, bpUsage);
      return new Response('', { headers: { 'X-Chat-Done': 'true', 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    // Wrap-up phase: the model may answer DONE, so resolve fully (non-streaming)
    // before responding rather than streaming a possibly-DONE body.
    if (prep.allowDone) {
      const completion = await client.chat.completions.create({
        model: MODEL, ...temperatureFor(0.3), messages: prep.messages,
      });
      const turnUsage = mergeUsage(bpUsage, usageFromCompletion(completion, MODEL));
      const answer = (completion.choices[0].message.content || '').trim();

      if (answer === 'DONE') {
        // No agent message — attribute the turn's cost to the conversation total.
        await addConversationUsage(sessionId, user.id, turnUsage);
        return new Response('', { headers: { 'X-Chat-Done': 'true', 'Content-Type': 'text/plain; charset=utf-8' } });
      }

      await addMessage(sessionId, 'agent', answer, user.id, turnUsage);
      return new Response(answer, { headers: { 'X-Chat-Done': 'false', 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    // Blocking phase: guaranteed a question — stream tokens live. include_usage
    // makes the final chunk carry the token counts.
    const completionStream = await client.chat.completions.create({
      model: MODEL, ...temperatureFor(0.3), messages: prep.messages,
      stream: true, stream_options: { include_usage: true },
    });

    const encoder = new TextEncoder();
    let full = '';
    let clarUsage = emptyUsage(MODEL);

    const body = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completionStream) {
            const delta = chunk.choices?.[0]?.delta?.content || '';
            if (delta) { full += delta; controller.enqueue(encoder.encode(delta)); }
            if (chunk.usage) clarUsage = usageFromCompletion(chunk, MODEL);
          }
        } catch (err) {
          controller.enqueue(encoder.encode(`\n[stream error: ${err.message}]`));
        } finally {
          controller.close();
          // Persist the agent message + this turn's combined token cost. Done
          // after streaming so we have the full text and the usage chunk.
          try {
            await addMessage(sessionId, 'agent', full.trim(), user.id, mergeUsage(bpUsage, clarUsage));
          } catch (e) {
            console.error('failed to persist streamed agent message usage:', e);
          }
        }
      },
    });

    return new Response(body, {
      headers: {
        'X-Chat-Done': 'false',
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
