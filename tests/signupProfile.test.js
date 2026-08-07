import { describe, it, expect, vi, beforeEach } from 'vitest';

// Isolate seedSignupProfile from the DB/OTP/email side effects of registration:
// mock the two adoption repositories it composes, plus the mailer + db pool so
// importing authService.js has no live dependencies.
const upsertProfile = vi.fn();
const seedOpportunitiesForProfile = vi.fn();
vi.mock('../lib/services/adoption/profileRepository.js', () => ({ upsertProfile: (...a) => upsertProfile(...a) }));
vi.mock('../lib/services/adoption/opportunityRepository.js', () => ({ seedOpportunitiesForProfile: (...a) => seedOpportunitiesForProfile(...a) }));
vi.mock('../lib/services/mailer.js', () => ({ sendOtpEmail: vi.fn() }));
vi.mock('../lib/config/db.js', () => ({ pool: { query: vi.fn() } }));

const { seedSignupProfile } = await import('../lib/services/authService.js');

describe('seedSignupProfile — registration-time profile capture (1.1)', () => {
  beforeEach(() => { upsertProfile.mockReset(); seedOpportunitiesForProfile.mockReset(); });

  it('fields provided → creates the profile AND seeds the opportunity map', async () => {
    const profile = { department: 'finance', completed: true };
    upsertProfile.mockResolvedValue(profile);
    await seedSignupProfile('u1', { role: 'Finance Manager', department: 'finance', industry: 'SaaS', password: 'secret123', name: 'X' });
    // Only the three profile fields are forwarded — password/name are stripped.
    expect(upsertProfile).toHaveBeenCalledWith('u1', { role: 'Finance Manager', department: 'finance', industry: 'SaaS' });
    expect(seedOpportunitiesForProfile).toHaveBeenCalledWith('u1', profile);
  });

  it('partial fields (department only) still seeds', async () => {
    upsertProfile.mockResolvedValue({ department: 'marketing' });
    await seedSignupProfile('u1', { department: 'marketing' });
    expect(upsertProfile).toHaveBeenCalledWith('u1', { role: undefined, department: 'marketing', industry: undefined });
    expect(seedOpportunitiesForProfile).toHaveBeenCalledTimes(1);
  });

  it('no profile fields → does nothing (no writes)', async () => {
    await seedSignupProfile('u1', { name: 'X', email: 'a@b.com', password: 'secret123' });
    expect(upsertProfile).not.toHaveBeenCalled();
    expect(seedOpportunitiesForProfile).not.toHaveBeenCalled();
  });

  it('empty/nullish input → does nothing, never throws', async () => {
    await expect(seedSignupProfile('u1', undefined)).resolves.toBeUndefined();
    await expect(seedSignupProfile('u1', {})).resolves.toBeUndefined();
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it('a seeding failure is NON-FATAL — it resolves, never throws (proving the claim)', async () => {
    upsertProfile.mockRejectedValue(new Error('db down'));
    await expect(seedSignupProfile('u1', { department: 'finance' })).resolves.toBeUndefined();
    // upsert was attempted; the seed step never ran because upsert threw first.
    expect(upsertProfile).toHaveBeenCalledTimes(1);
    expect(seedOpportunitiesForProfile).not.toHaveBeenCalled();
  });

  it('a failure in the opportunity-seed step is also swallowed', async () => {
    upsertProfile.mockResolvedValue({ department: 'finance' });
    seedOpportunitiesForProfile.mockRejectedValue(new Error('seed exploded'));
    await expect(seedSignupProfile('u1', { department: 'finance' })).resolves.toBeUndefined();
  });
});
