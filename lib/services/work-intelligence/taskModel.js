/**
 * Normalized task model (Work Intelligence, Phase 1.2). Every platform connector
 * maps its own task shape into this ONE model, so downstream phases
 * (opportunity detection, task-to-Blueprint) are written once, platform-neutral.
 *
 * PII note: assignees carry raw name/email here — the INGEST layer hashes/redacts
 * them before storage (governance: "personal performance is not inferred"). This
 * model is the in-memory, pre-storage shape.
 */

const asArr = (v) => (Array.isArray(v) ? v : []);
const msToIso = (ms) => { const n = Number(ms); return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : null; };

function normalizeClickUp(t) {
  return {
    external_id: String(t?.id ?? ''),
    name: t?.name || '',
    description: t?.text_content || t?.description || '',
    status: t?.status?.status || 'unknown',
    status_type: t?.status?.type || null,
    assignees: asArr(t?.assignees).map((a) => ({ ref: String(a?.id ?? a?.email ?? ''), name: a?.username || a?.email || null, email: a?.email || null })),
    project: t?.project?.name || t?.folder?.name || null,
    space_id: t?.space?.id ? String(t.space.id) : null,
    list: t?.list?.name || null,
    parent_id: t?.parent ? String(t.parent) : null,
    subtask_count: asArr(t?.subtasks).length,
    checklist: asArr(t?.checklists).map((c) => ({ name: c?.name || '', items: asArr(c?.items).map((i) => ({ name: i?.name || '', resolved: !!i?.resolved })) })),
    comment_count: Number(t?.comment_count) || 0,
    attachment_count: asArr(t?.attachments).length,
    tags: asArr(t?.tags).map((tag) => tag?.name).filter(Boolean),
    recurrence: !!(t?.recurring || t?.custom_fields?.some?.((f) => /recur/i.test(f?.name || ''))),
    due_date: msToIso(t?.due_date),
    created_at: msToIso(t?.date_created),
    updated_at: msToIso(t?.date_updated),
    custom_fields: Object.fromEntries(asArr(t?.custom_fields).map((f) => [f?.name || 'field', f?.value ?? null]).filter(([k]) => k)),
    url: t?.url || null,
  };
}

const MAPPERS = { clickup: normalizeClickUp };

/** Map a raw platform task into the normalized model. */
export function normalizeTask(platform, raw) {
  const map = MAPPERS[platform];
  if (!map) throw new Error(`No task mapper for platform "${platform}"`);
  return map(raw || {});
}

export default { normalizeTask };
