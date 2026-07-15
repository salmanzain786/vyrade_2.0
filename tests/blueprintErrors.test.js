import { describe, it, expect } from 'vitest';
import { BlueprintNotReadyError, StaleVersionError } from '../lib/services/blueprintErrors.js';

// QA cases 5 & 6 — the server-side gates that reject generating a workflow from
// a non-current or not-ready Blueprint surface as 409s.
describe('blueprint generation gate errors', () => {
  it('BlueprintNotReadyError is a 409 and names the missing requirements', () => {
    const err = new BlueprintNotReadyError('collecting_requirements', ['human_approval.required']);
    expect(err.statusCode).toBe(409);
    expect(err.message).toMatch(/human_approval\.required/);
  });

  it('StaleVersionError is a 409 and reports the current version', () => {
    const err = new StaleVersionError(5, 6);
    expect(err.statusCode).toBe(409);
    expect(err.currentVersion).toBe(6);
  });
});
