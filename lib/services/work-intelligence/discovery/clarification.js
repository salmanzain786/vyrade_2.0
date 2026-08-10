/**
 * Process-discovery clarification engine (Work Intelligence, Phase 2.3).
 *
 * The heart of "don't use the task as the prompt": ask the focused questions the
 * spec illustrates (data sources, KPIs, format, reviewer, delivery, timing,
 * error handling, AI-narrative, storage, approval) instead of guessing. LLM-driven
 * when configured; otherwise a deterministic curated set filtered by the detected
 * signals — cheap, explainable, and testable without an API key.
 */
import { client, MODEL, temperatureFor } from '../../../config/openai.js';
import { contextSummary } from './context.js';

// Curated question bank, ordered by PRIORITY so the essentials and the
// highest-value signal-gated questions survive the cap. `when` gates a question
// on a detected signal (or 'always').
const BANK = [
  { id: 'data_sources', when: 'always', q: 'Where does the data come from (which systems, exports, or APIs)?' },
  { id: 'format', when: 'always', q: 'How must the output be formatted (template, sheet, doc, message)?' },
  { id: 'reviewer', when: 'approval', q: 'Who reviews or approves the result, and at which step?' },
  { id: 'delivery', when: 'external_delivery', q: 'How and to whom is the final result delivered?' },
  { id: 'errors', when: 'always', q: 'Which errors can occur, and how should they be handled?' },
  { id: 'approval_required', when: 'always', q: 'Is human approval required before it completes / is sent?' },
  { id: 'ai_narrative', when: 'drafting', q: 'Should AI draft any narrative/summary, or is it purely data assembly?' },
  { id: 'kpis', when: 'multiple_sources', q: 'Which specific fields, metrics, or KPIs are required in the output?' },
  { id: 'timing', when: 'recurring', q: 'How often must this run, and by when must it be delivered?' },
  { id: 'storage', when: 'always', q: 'Where is the final output stored or recorded?' },
  { id: 'scope', when: 'multiple_sources', q: 'Which records/clients/accounts are included, and how many?' },
  { id: 'manual_steps', when: 'always', q: 'Which steps must remain manual (not automated)?' },
];

export function fallbackQuestions(ctx) {
  const signals = new Set((ctx.signals || []).map((s) => s.key));
  const picked = BANK.filter((b) => b.when === 'always' || signals.has(b.when));
  return picked.slice(0, 9).map((b) => ({ id: b.id, question: b.q }));
}

const SYSTEM = `You are Vyrade's process-discovery assistant. Given a work task, ask the FOCUSED questions needed to turn it into a precise automation Blueprint — data sources, exact outputs/KPIs, format, reviewer/approval, delivery, timing, error handling, AI-narrative use, and storage. Ask only what the task text does NOT already answer. Return STRICT JSON: {"questions":[{"id":"snake_case","question":"..."}]} with 5–9 questions, no prose.`;

export async function generateQuestions(ctx) {
  if (!process.env.OPENAI_API_KEY) return fallbackQuestions(ctx);
  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      ...temperatureFor(0.3),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: contextSummary(ctx) },
      ],
    });
    const raw = completion.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    const qs = Array.isArray(parsed.questions) ? parsed.questions : [];
    const clean = qs.filter((q) => q && q.question).slice(0, 9).map((q, i) => ({ id: q.id || `q${i + 1}`, question: String(q.question) }));
    return clean.length ? clean : fallbackQuestions(ctx);
  } catch {
    return fallbackQuestions(ctx); // never block discovery on an LLM hiccup
  }
}

export default { generateQuestions, fallbackQuestions };
