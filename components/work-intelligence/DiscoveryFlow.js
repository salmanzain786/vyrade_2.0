'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Wand2, ArrowRight } from 'lucide-react';

// Clarification + draft-Blueprint flow (Phase 2.3/2.4). Collects answers to the
// generated questions; unanswered ones are explicitly marked uncertain in the
// Blueprint (not guessed).
export default function DiscoveryFlow({ sessionId, initial }) {
  const router = useRouter();
  const [answers, setAnswers] = useState(initial.answers || {});
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const questions = initial.questions || [];
  const unanswered = questions.filter((q) => !((answers[q.id] || '').trim())).length;

  const set = (id, v) => setAnswers((a) => ({ ...a, [id]: v }));

  async function save() {
    setSaving(true);
    try { await fetch(`/api/work/discovery/${sessionId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }) }); }
    finally { setSaving(false); }
  }

  async function generate() {
    setGenerating(true); setError(null);
    try {
      const res = await fetch(`/api/work/discovery/${sessionId}/blueprint`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Generation failed');
      router.push(`/report/${j.blueprintId}`);
    } catch (e) { setError(e.message); setGenerating(false); }
  }

  if (initial.blueprint_id) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 text-sm">
        A draft Blueprint has been created from this task.
        <a href={`/report/${initial.blueprint_id}`} className="ml-2 inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400">Open the report <ArrowRight className="h-4 w-4" /></a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {questions.map((q) => (
          <div key={q.id} className="rounded-lg border border-border bg-card p-4">
            <label className="text-sm font-medium">{q.question}</label>
            <textarea value={answers[q.id] || ''} onChange={(e) => set(q.id, e.target.value)} rows={2} placeholder="Your answer (optional — blanks are marked uncertain in the Blueprint)"
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save answers'}</button>
        <button onClick={generate} disabled={generating} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"><Wand2 className="h-4 w-4" />{generating ? 'Generating draft Blueprint…' : 'Generate draft Blueprint'}</button>
        <span className="text-xs text-muted-foreground">{unanswered > 0 ? `${unanswered} unanswered — will be marked “needs clarification”.` : 'All questions answered.'}</span>
      </div>
    </div>
  );
}
