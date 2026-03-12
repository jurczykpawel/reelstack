import { describe, it, expect } from 'vitest';
import { buildProfileSupervisorChecks } from '../montage-profile';
import { MONTAGE_PROFILE_CATALOG } from '@reelstack/remotion/catalog';

describe('buildProfileSupervisorChecks', () => {
  it('includes max shot duration for network-chuck', () => {
    const nc = MONTAGE_PROFILE_CATALOG.find(p => p.id === 'network-chuck')!;
    const checks = buildProfileSupervisorChecks(nc);
    expect(checks).toContain('4s');
    expect(checks).toContain('REJECT');
  });

  it('includes stricter shot duration for leadgen-man', () => {
    const lm = MONTAGE_PROFILE_CATALOG.find(p => p.id === 'leadgen-man')!;
    const checks = buildProfileSupervisorChecks(lm);
    expect(checks).toContain('3s');
  });

  it('includes allowed transitions whitelist', () => {
    const lm = MONTAGE_PROFILE_CATALOG.find(p => p.id === 'leadgen-man')!;
    const checks = buildProfileSupervisorChecks(lm);
    expect(checks).toContain('crossfade');
    // leadgen-man should NOT allow glitch/none
    expect(checks).toContain('NOT in this list');
  });

  it('includes effect density requirement', () => {
    const nc = MONTAGE_PROFILE_CATALOG.find(p => p.id === 'network-chuck')!;
    const checks = buildProfileSupervisorChecks(nc);
    expect(checks).toContain('12'); // effectsPerThirtySec
  });

  it('includes director rules for review', () => {
    const nc = MONTAGE_PROFILE_CATALOG.find(p => p.id === 'network-chuck')!;
    const checks = buildProfileSupervisorChecks(nc);
    expect(checks).toContain('Glitch transition');
  });

  it('includes SFX mapping check', () => {
    const nc = MONTAGE_PROFILE_CATALOG.find(p => p.id === 'network-chuck')!;
    const checks = buildProfileSupervisorChecks(nc);
    expect(checks).toContain('SFX');
    expect(checks).toContain('glitch');
  });
});
