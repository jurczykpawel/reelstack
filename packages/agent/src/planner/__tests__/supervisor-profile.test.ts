import { describe, it, expect } from 'vitest';
import { buildProfileSupervisorChecks } from '../montage-profile';
import { getMontageProfile } from '@reelstack/remotion/catalog';

describe('buildProfileSupervisorChecks', () => {
  it('includes max shot duration for default profile', () => {
    const profile = getMontageProfile('default')!;
    const checks = buildProfileSupervisorChecks(profile);
    expect(checks).toContain('4s');
    expect(checks).toContain('REJECT');
  });

  it('includes allowed transitions whitelist', () => {
    const profile = getMontageProfile('default')!;
    const checks = buildProfileSupervisorChecks(profile);
    expect(checks).toContain('crossfade');
    expect(checks).toContain('NOT in this list');
  });

  it('includes effect density requirement', () => {
    const profile = getMontageProfile('default')!;
    const checks = buildProfileSupervisorChecks(profile);
    expect(checks).toContain('10'); // effectsPerThirtySec
  });

  it('includes director rules for review', () => {
    const profile = getMontageProfile('default')!;
    const checks = buildProfileSupervisorChecks(profile);
    expect(checks).toContain('Visual change every');
  });

  it('includes SFX mapping check', () => {
    const profile = getMontageProfile('default')!;
    const checks = buildProfileSupervisorChecks(profile);
    expect(checks).toContain('SFX');
    expect(checks).toContain('pop');
  });
});
