// A minimal, schema-valid Blueprint. Helpers below tweak one dimension at a
// time so each test states exactly the condition it exercises.

export function baseBlueprint(overrides = {}) {
  return {
    name: 'Lead to HubSpot',
    business_intent: {
      business_goal: 'Capture every web lead in the CRM',
      desired_outcome: 'No lead is lost',
    },
    trigger: {
      trigger_type: 'event',
      event: 'new_web_lead',
      source_system: 'Website',
      schedule: null,
    },
    systems: [
      { name: 'HubSpot', role: 'destination', required: true },
      { name: 'Slack', role: 'notification', required: false },
    ],
    data_inputs: [],
    process_steps: [
      { step_id: 's1', sequence: 1, action: 'Receive the lead', action_type: 'receive_data' },
      { step_id: 's2', sequence: 2, action: 'Write to HubSpot', action_type: 'write_data' },
    ],
    business_rules: [],
    exception_rules: [],
    // Filled so the base fixture is fully specified (score 100, no open gaps).
    // Individual tests override these to open a specific gap.
    retry_requirements: [{ system: 'HubSpot', max_retries: 3, after_final_failure: 'notify ops' }],
    notification_rules: [{ channel_system: 'Slack', condition: 'on failure', event: 'lead_write_failed', audience: 'ops team' }],
    human_approval: { required: false, approval_points: [] },
    volume: { estimated_executions: 100, period: 'month', confidence: 'user_stated' },
    constraints: {
      budget: null,
      technical_skill: null,
      self_hosting_required: null,
      security_requirements: [],
      compliance_requirements: [],
      latency_requirement: null,
      implementation_constraints: {
        required_platforms: [],
        prohibited_platforms: [],
        existing_platforms: [],
        platform_preferences: [],
      },
    },
    unknown_requirements: [],
    ...overrides,
  };
}

// A minimal importable n8n workflow shape.
export function baseWorkflow(overrides = {}) {
  return {
    name: 'WF',
    nodes: [
      { id: '1', name: 'On new lead', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], parameters: {} },
      { id: '2', name: 'Write', type: 'n8n-nodes-base.set', typeVersion: 3, position: [220, 0], parameters: {} },
    ],
    connections: {
      'On new lead': { main: [[{ node: 'Write', type: 'main', index: 0 }]] },
    },
    ...overrides,
  };
}
