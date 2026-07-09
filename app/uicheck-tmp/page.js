'use client';

// TEMPORARY verification fixture — deleted after checking.
import BlueprintSheet from '@/components/BlueprintSheet';

const BP = {
  business_intent: { business_goal: 'Route inbound leads', desired_outcome: null },
  trigger: { trigger_type: 'webhook', event: 'unknown', source_system: 'Facebook' },
  systems: [{ role: 'source', name: 'Facebook Lead Ads' }],
  process_steps: [{ step_id: 's1', sequence: 1, action: 'Receive lead' }],
  business_rules: [],
  volume: { estimated_executions: null, period: 'day' },
  human_approval: { required: null },
  unknown_requirements: [],
};

export default function UiCheck() {
  return (
    <div className="h-screen">
      <BlueprintSheet
        blueprint={BP}
        readiness={{ status: 'requirements_complete', score: 100, blocking_unknowns: [] }}
        version={3}
        blueprintId="abcd1234efgh"
        onGenerate={() => {}}
        generating={false}
        workflow={null}
        onViewWorkflow={() => {}}
      />
    </div>
  );
}
