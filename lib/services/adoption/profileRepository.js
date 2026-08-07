/**
 * User profile persistence (Phase 1.1). Contextual capture: fields are written
 * incrementally (read-merge-write), and `completed` flips once the minimum
 * (role + department + industry) is present.
 */
import { pool } from '../../config/db.js';

const parseArr = (x) => {
  if (Array.isArray(x)) return x;
  if (typeof x === 'string') { try { const v = JSON.parse(x); return Array.isArray(v) ? v : []; } catch { return []; } }
  return [];
};
const cleanArr = (v) => (Array.isArray(v) ? [...new Set(v.map((s) => String(s).trim()).filter(Boolean))].slice(0, 40) : []);

export async function getProfile(userId) {
  const [[row]] = await pool.query('SELECT * FROM user_profiles WHERE user_id = ? LIMIT 1', [userId]);
  if (!row) return null;
  return {
    user_id: row.user_id,
    role: row.role, job_title: row.job_title, department: row.department, industry: row.industry,
    company_size: row.company_size, technical_skill: row.technical_skill,
    responsibilities: parseArr(row.responsibilities),
    current_ai_tools: parseArr(row.current_ai_tools),
    automation_platforms: parseArr(row.automation_platforms),
    bottlenecks: parseArr(row.bottlenecks),
    completed: !!row.completed,
    updated_at: row.updated_at,
  };
}

// Only the provided keys overwrite; everything else is preserved.
const SCALAR = ['role', 'job_title', 'department', 'industry', 'company_size', 'technical_skill'];
const LIST = ['responsibilities', 'current_ai_tools', 'automation_platforms', 'bottlenecks'];

export async function upsertProfile(userId, patch = {}) {
  const existing = (await getProfile(userId)) || {};
  const merged = { ...existing };
  for (const k of SCALAR) if (patch[k] !== undefined) merged[k] = patch[k] ? String(patch[k]).slice(0, 160) : null;
  for (const k of LIST) if (patch[k] !== undefined) merged[k] = cleanArr(patch[k]);

  const minimumMet = !!(merged.role && merged.department && merged.industry);
  const completed = patch.completed != null ? (patch.completed ? 1 : 0) : (minimumMet ? 1 : (existing.completed ? 1 : 0));

  await pool.query(
    `INSERT INTO user_profiles
       (user_id, role, job_title, department, industry, company_size, technical_skill,
        responsibilities, current_ai_tools, automation_platforms, bottlenecks, completed)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       role=VALUES(role), job_title=VALUES(job_title), department=VALUES(department), industry=VALUES(industry),
       company_size=VALUES(company_size), technical_skill=VALUES(technical_skill),
       responsibilities=VALUES(responsibilities), current_ai_tools=VALUES(current_ai_tools),
       automation_platforms=VALUES(automation_platforms), bottlenecks=VALUES(bottlenecks), completed=VALUES(completed)`,
    [
      userId, merged.role || null, merged.job_title || null, merged.department || null, merged.industry || null,
      merged.company_size || null, merged.technical_skill || null,
      JSON.stringify(merged.responsibilities || []), JSON.stringify(merged.current_ai_tools || []),
      JSON.stringify(merged.automation_platforms || []), JSON.stringify(merged.bottlenecks || []), completed,
    ]
  );
  return getProfile(userId);
}

export default { getProfile, upsertProfile };
