import { client, MODEL, temperatureFor } from '../../../../../../lib/config/openai.js';
import { prepareQuestion } from '../../../../../../lib/services/clarificationAgent.js';
import { getVersion } from '../../../../../../lib/services/blueprintRepository.js';

export const dynamic = 'force-dynamic';

// Streams the next clarification question as plain text. Header X-Chat-Done:
// "true" signals the interview is complete (empty body). When a blocking gap
// remains the model is forbidden from ending, so tokens can stream straight
// through; the optional wrap-up case is resolved before responding.
export async function POST(request, { params }) {
  try {
    const { version, conversation_so_far } = await request.json();
    const current = await getVersion(params.id, Number(version));
    if (!current) {
      return new Response(JSON.stringify({ error: 'Blueprint version not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    const prep = prepareQuestion(current.blueprint, conversation_so_far || '');

    if (prep.done) {
      return new Response('', { headers: { 'X-Chat-Done': 'true', 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    // Optional wrap-up phase: the model may answer DONE, so resolve fully
    // before responding rather than streaming a possibly-DONE body.
    if (prep.allowDone) {
      const completion = await client.chat.completions.create({
        model: MODEL, ...temperatureFor(0.3), messages: prep.messages,
      });
      const answer = (completion.choices[0].message.content || '').trim();
      if (answer === 'DONE') {
        return new Response('', { headers: { 'X-Chat-Done': 'true', 'Content-Type': 'text/plain; charset=utf-8' } });
      }
      return new Response(answer, { headers: { 'X-Chat-Done': 'false', 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    // Blocking phase: guaranteed a question — stream tokens live.
    const completionStream = await client.chat.completions.create({
      model: MODEL, ...temperatureFor(0.3), messages: prep.messages, stream: true,
    });

    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completionStream) {
            const delta = chunk.choices?.[0]?.delta?.content || '';
            if (delta) controller.enqueue(encoder.encode(delta));
          }
        } catch (err) {
          controller.enqueue(encoder.encode(`\n[stream error: ${err.message}]`));
        } finally {
          controller.close();
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
}
