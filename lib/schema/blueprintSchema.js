import { z } from 'zod';

// ---------------------------------------------------------------------
// Enums (Section 8 / 9.2)
// ---------------------------------------------------------------------
const TriggerType = z.enum(['event', 'schedule', 'manual', 'polling', 'unknown']);

const ActionType = z.enum([
  'receive_data', 'validate_data', 'transform_data', 'retrieve_data',
  'write_data', 'business_decision', 'ai_reasoning', 'generate_content',
  'notification', 'human_approval', 'wait', 'aggregate', 'other',
]);

const Confidence = z.enum([
  'user_stated', 'derived_from_business_rule', 'system_known', 'inferred', 'unknown',
]);

const Period = z.enum(['day', 'week', 'month', 'year', 'event', 'unknown']);

// ---------------------------------------------------------------------
// Sub-objects
// ---------------------------------------------------------------------
const BusinessIntent = z.object({
  business_goal: z.string(),
  desired_outcome: z.string(),
});

const Trigger = z.object({
  trigger_type: TriggerType,
  event: z.string().nullable(),
  source_system: z.string().nullable(),
  schedule: z.string().nullable(),
});

const System = z.object({
  name: z.string(),
  role: z.string(),
  required: z.boolean(),
});

const DataInput = z.object({
  field: z.string(),
  required: z.boolean(),
  source: z.string().nullable(),
});

const ProcessStep = z.object({
  step_id: z.string(),
  sequence: z.number().int(),
  action: z.string(),
  action_type: ActionType,
});

// Deterministic rule operators (Section 7 example: equals / not_in, extended
// with the common comparators a business rule may state).
const RuleOperator = z.enum([
  'equals', 'not_equals', 'in', 'not_in',
  'greater_than', 'greater_or_equal', 'less_than', 'less_or_equal',
  'contains', 'exists',
]);

// condition.value is normalized to an array of strings so a single strict-mode
// schema covers both scalar comparisons (equals -> ["California"]) and set
// comparisons (not_in -> ["California", "Texas"]). See Section 8 adaptation note.
const RuleCondition = z.object({
  field: z.string(),
  operator: RuleOperator,
  value: z.array(z.string()),
});

const RuleResult = z.object({
  action: z.string(),
  value: z.string(),
});

const BusinessRule = z.object({
  rule_id: z.string(),
  description: z.string(),
  condition: RuleCondition,
  result: RuleResult,
});

// Free-form {field: value} maps aren't allowed in strict structured outputs;
// represent the stated data changes as a typed list instead.
const DataChange = z.object({
  field: z.string(),
  value: z.string(),
});

const ExceptionRule = z.object({
  exception_id: z.string(),
  scenario: z.string(),
  behavior: z.string(),
  data_changes: z.array(DataChange).nullable(),
});

const RetryRequirement = z.object({
  system: z.string(),
  max_retries: z.number().int(),
  after_final_failure: z.string().nullable(),
});

const NotificationRule = z.object({
  channel_system: z.string(),
  condition: z.string(),
  event: z.string(),
  audience: z.string(),
});

const HumanApproval = z.object({
  required: z.boolean().nullable(),
  approval_points: z.array(z.string()),
});

const Volume = z.object({
  estimated_executions: z.number().nullable(),
  period: Period.nullable(),
  confidence: Confidence,
});

const Constraints = z.object({
  budget: z.string().nullable(),
  technical_skill: z.string().nullable(),
  self_hosting_required: z.boolean().nullable(),
  security_requirements: z.array(z.string()),
  compliance_requirements: z.array(z.string()),
  latency_requirement: z.string().nullable(),
});

const UnknownRequirement = z.object({
  field_path: z.string(),
  reason: z.string(),
  blocks_generation: z.boolean(),
  blocks_cost_confidence: z.boolean(),
});

// ---------------------------------------------------------------------
// Root Blueprint content (LLM-generated portion — blueprint_id/version/
// status/session_id are DB-managed, see blueprintRepository.js)
// ---------------------------------------------------------------------
export const AutomationBlueprintContent = z.object({
  name: z.string(),
  business_intent: BusinessIntent,
  trigger: Trigger,
  systems: z.array(System),
  data_inputs: z.array(DataInput),
  process_steps: z.array(ProcessStep),
  business_rules: z.array(BusinessRule),
  exception_rules: z.array(ExceptionRule),
  retry_requirements: z.array(RetryRequirement),
  notification_rules: z.array(NotificationRule),
  human_approval: HumanApproval,
  volume: Volume,
  constraints: Constraints,
  unknown_requirements: z.array(UnknownRequirement),
});

// ---------------------------------------------------------------------
// Referential validation (Section 19)
// A system referenced by a retry or notification rule must be declared in
// systems[] (a named business system or a generic capability placeholder).
// ---------------------------------------------------------------------
export function validateReferential(bp) {
  const errors = [];
  const systemNames = new Set(bp.systems.map((s) => s.name));

  for (const r of bp.retry_requirements) {
    if (!systemNames.has(r.system)) {
      errors.push(`retry_requirements references unknown system: '${r.system}'`);
    }
  }

  for (const n of bp.notification_rules) {
    if (!systemNames.has(n.channel_system)) {
      errors.push(`notification_rules references unknown channel_system: '${n.channel_system}'`);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------
// Sequence validation (Section 19)
// process_steps.sequence must be unique and listed in strictly ascending order.
// ---------------------------------------------------------------------
export function validateSequence(bp) {
  const errors = [];
  const sequences = bp.process_steps.map((s) => s.sequence);

  if (new Set(sequences).size !== sequences.length) {
    errors.push('process_steps sequence values must be unique');
  }

  for (let i = 1; i < sequences.length; i++) {
    if (sequences[i] <= sequences[i - 1]) {
      errors.push('process_steps must be listed in strictly ascending sequence order');
      break;
    }
  }

  return errors;
}

// ---------------------------------------------------------------------
// Semantic validation (Section 19)
// ---------------------------------------------------------------------
export function validateSemantics(bp) {
  const errors = [];

  if (bp.human_approval.required === false && bp.human_approval.approval_points.length > 0) {
    errors.push('human_approval.required=false cannot have non-empty approval_points');
  }

  return errors;
}

// ---------------------------------------------------------------------
// Contradiction validation (Section 19)
// Two business rules with the identical condition (field + operator + value
// set) must not resolve to different results.
// ---------------------------------------------------------------------
function conditionKey(c) {
  const values = [...c.value].sort().join(',');
  return `${c.field}|${c.operator}|${values}`;
}

export function validateContradictions(bp) {
  const errors = [];
  const seen = new Map(); // conditionKey -> "action=value"

  for (const rule of bp.business_rules) {
    const key = conditionKey(rule.condition);
    const outcome = `${rule.result.action}=${rule.result.value}`;
    if (seen.has(key) && seen.get(key) !== outcome) {
      errors.push(
        `contradictory business rules: condition [${key}] resolves to both ` +
        `'${seen.get(key)}' and '${outcome}'`
      );
    } else {
      seen.set(key, outcome);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------
// Neutrality validation (Section 14 / 19)
// ---------------------------------------------------------------------
const NEUTRALITY_BANNED_TERMS = [
  'n8n', 'switch node', 'make.com', 'make module', 'zapier',
  'api endpoint', 'mcp server', 'retryonfail', 'http request node',
  'claude prompt', 'sdk', 'webhook node',
];

export function checkNeutrality(bp) {
  const text = JSON.stringify(bp).toLowerCase();
  return NEUTRALITY_BANNED_TERMS
    .filter((term) => text.includes(term))
    .map((term) => `Blueprint contains disallowed implementation term: '${term}'`);
}

// ---------------------------------------------------------------------
// Full validation entry point
// ---------------------------------------------------------------------
export function validateBlueprint(rawObject) {
  const parsed = AutomationBlueprintContent.safeParse(rawObject);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`[schema] ${msg}`);
  }

  const bp = parsed.data;
  const layers = [
    ['referential', validateReferential(bp)],
    ['sequence', validateSequence(bp)],
    ['semantic', validateSemantics(bp)],
    ['contradiction', validateContradictions(bp)],
    ['neutrality', checkNeutrality(bp)],
  ];

  const allErrors = layers.flatMap(([layer, errs]) => errs.map((e) => `[${layer}] ${e}`));

  if (allErrors.length > 0) {
    throw new Error(allErrors.join('; '));
  }

  return bp;
}
