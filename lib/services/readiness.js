const hasStep = (bp, type) => (bp.process_steps || []).some((s) => s.action_type === type);
const recorded = (bp, path) =>
  (bp.unknown_requirements || []).some((u) => u.field_path === path);
// The model isn't consistent about whether it records `human_approval` or
// `human_approval.required`; match either so a "don't know" answer is honored.
const recordedPrefix = (bp, prefix) =>
  (bp.unknown_requirements || []).some((u) => (u.field_path || '').startsWith(prefix));

// The model sometimes writes the literal string "unknown" (or blanks) into a
// field instead of leaving it null. Treat those as "no real value".
const isUnknownVal = (v) =>
  v === null || v === undefined || String(v).trim() === '' ||
  String(v).trim().toLowerCase() === 'unknown';

// A trigger is unknown when we know neither its type nor a concrete event —
// regardless of whether the source system is named. "unknown"/blank count as
// not-known for both fields.
const triggerUnknown = (bp) =>
  isUnknownVal(bp.trigger?.trigger_type) && isUnknownVal(bp.trigger?.event);

/**
 * Material clarification checklist (Section 6 / 11 / 13) — the SINGLE source of
 * truth for what is still missing. It drives both the interview (which gap to
 * ask about next) and readiness (whether the workflow can be generated).
 *
 * A dimension is a gap only while it is both unresolved AND not yet recorded as
 * an accepted unknown — so once the user answers (or says "I don't know", which
 * the model records as an unknown_requirement) the dimension stops being asked.
 * Conditional dimensions (routing, validation failure, retry) are only raised
 * when the process actually contains the step that makes them material.
 *
 * `blocking: true` means the Blueprint cannot be turned into a correct workflow
 * until it is resolved (it holds back generation). `blocking: false` means it
 * is worth asking about but generation may proceed with it left as an unknown
 * (Section 9 / 13). Returns items ordered most-important first.
 */
export function materialGaps(bp) {
  const gaps = [];
  const add = (path, description, blocking) => gaps.push({ path, description, blocking });

  if (!bp.business_intent?.business_goal) {
    add('business_intent.business_goal', 'the business goal — what outcome they are trying to achieve', true);
  }
  if (triggerUnknown(bp)) {
    add('trigger', 'what starts the process — a specific event, a schedule, or a manual trigger', true);
  }
  if (!bp.process_steps || bp.process_steps.length === 0) {
    add('process_steps', 'the steps the process should carry out', true);
  }
  if (!bp.systems || bp.systems.length === 0) {
    add('systems', 'which systems or tools are involved', true);
  }

  // Conditional — only material when the matching step exists.
  if (hasStep(bp, 'business_decision') && (bp.business_rules || []).length === 0 && !recorded(bp, 'business_rules')) {
    add('business_rules', 'how the decision/routing should work — is it always the same, or does it depend on a value?', true);
  }
  if (hasStep(bp, 'validate_data') && (bp.exception_rules || []).length === 0 && !recorded(bp, 'exception_rules')) {
    add('exception_rules', 'what should happen when validation fails — stop, or continue and flag it?', false);
  }
  if (hasStep(bp, 'write_data') && (bp.retry_requirements || []).length === 0 && !recorded(bp, 'retry_requirements')) {
    add('retry_requirements', 'what should happen if the target system fails or is unavailable (retries, and the final fallback)', false);
  }

  // Always material unless already settled.
  if ((bp.notification_rules || []).length === 0 && !recorded(bp, 'notification_rules')) {
    add('notification_rules', 'whether anyone should be notified, and under which conditions (e.g. on success or on failure)', false);
  }
  // Human approval is a required decision — but only ASK while it is still both
  // null AND not already answered "I don't know". Once the user has said they
  // don't know (the model records it as an unknown_requirement), it stops being
  // an askable gap and becomes an unresolvable blocker handled in openQuestions
  // (which is what surfaces the 'blocked' status instead of looping the same
  // question forever).
  if ((bp.human_approval?.required === null || bp.human_approval?.required === undefined)
      && !recordedPrefix(bp, 'human_approval')) {
    add('human_approval.required', 'whether a person needs to approve any step before it happens', true);
  }
  if ((bp.volume?.estimated_executions === null || bp.volume?.estimated_executions === undefined) && !recorded(bp, 'volume.estimated_executions')) {
    add('volume.estimated_executions', 'roughly how often this runs or how many items it handles', false);
  }

  return gaps;
}

/**
 * Readiness check (Section 13), derived from the same material gaps that drive
 * the interview — so the "generate" button and the clarification agent can
 * never disagree. A blocking gap always overrides the numeric score.
 */
// Turn a model-recorded unknown_requirement into an askable, human-readable
// item. The model's `reason` reads like "User has not provided selection
// criteria"; strip the boilerplate so the clarification agent phrases a clean
// question, falling back to the humanized field path.
function describeUnknown(u) {
  const reason = (u.reason || '').trim();
  const cleaned = reason.replace(/^the user (has not|hasn't|did not|didn't)\s+(provided|specified|stated|given|defined)\s+/i, '');
  if (cleaned && cleaned !== reason) return cleaned;
  if (reason) return reason;
  return (u.field_path || 'a required detail').replace(/[._]/g, ' ');
}

/**
 * The complete set of still-open questions for the interview — the SINGLE
 * source of truth for both "what to ask next" and readiness. It merges the
 * structured checklist (materialGaps) with every requirement the MODEL itself
 * flagged as unknown. EVERY open item is something the clarification agent may
 * ask about: a model-recorded unknown means "this detail is underspecified", not
 * "the user already declined it" — so these must still be asked in plain
 * language (e.g. "which column holds the email address?"), never dumped as raw
 * field paths. Items are de-duped by path and ordered blocking-first.
 */
export function openQuestions(bp) {
  const gaps = materialGaps(bp);
  const seen = new Set(gaps.map((g) => g.path));

  for (const u of bp.unknown_requirements || []) {
    if (!u.field_path || seen.has(u.field_path)) continue;
    seen.add(u.field_path);
    gaps.push({
      path: u.field_path,
      description: describeUnknown(u),
      blocking: !!u.blocks_generation,
    });
  }

  // Stable-sort blocking items first so the interview clears the hard blockers
  // before the optional ones.
  return gaps
    .map((g, i) => ({ g, i }))
    .sort((a, b) => (b.g.blocking - a.g.blocking) || (a.i - b.i))
    .map(({ g }) => g);
}

/**
 * Readiness check (Section 13), derived from the same open questions that drive
 * the interview — so the "generate" button and the clarification agent can
 * never disagree. A blocking gap always overrides the numeric score.
 */
export function checkReadiness(bp) {
  const q = openQuestions(bp);

  const blockingGaps = q.filter((g) => g.blocking);
  const blocking = blockingGaps.map((g) => g.path);
  const nonBlocking = q.filter((g) => !g.blocking).map((g) => g.path);

  // Content-derived status: while any blocking gap is open we are still
  // collecting (the interview keeps asking); when none remain we are complete.
  // 'blocked' is NOT inferred from content — whether a gap is truly
  // unresolvable is a conversational judgment the clarification agent makes, so
  // it is never guessed here (that was the cause of the "dumped field paths and
  // stopped asking" bug).
  const status = blocking.length === 0 ? 'requirements_complete' : 'collecting_requirements';

  // Score = resolved core essentials / (resolved + still-open). Climbs toward
  // 100% as questions are answered.
  const answeredCore = [
    !!bp.business_intent?.business_goal,
    !triggerUnknown(bp),
    (bp.process_steps?.length || 0) > 0,
    (bp.systems?.length || 0) > 0,
    bp.human_approval?.required !== null && bp.human_approval?.required !== undefined,
  ].filter(Boolean).length;
  const openCount = blocking.length + nonBlocking.length;
  const score = openCount === 0
    ? 100
    : Math.round((answeredCore / (answeredCore + openCount)) * 100);

  const readiness = blocking.length > 0
    ? 'not_ready'
    : (nonBlocking.length > 0 ? 'ready_with_unknowns' : 'ready');

  return {
    status,
    readiness,
    score,
    blocking_unknowns: blocking,
    // Plain-English version of the blocking gaps, for user-facing messages so we
    // never surface raw field paths like "systems.Spreadsheet.location_and_access".
    blocking_questions: blockingGaps.map((g) => g.description),
    non_blocking_unknowns: nonBlocking,
  };
}
