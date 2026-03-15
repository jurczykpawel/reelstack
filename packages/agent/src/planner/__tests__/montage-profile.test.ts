import { describe, it, expect } from 'vitest';
import { selectMontageProfile, buildProfileGuidelines } from '../montage-profile';

describe('selectMontageProfile', () => {
  it('selects default profile for general topics', () => {
    expect(selectMontageProfile('A general how-to tutorial about tips').id).toBe('default');
  });

  it('defaults to default when no keywords match', () => {
    expect(selectMontageProfile('Random topic about nothing specific').id).toBe('default');
  });

  it('returns explicit profile when provided and it exists', () => {
    // default always exists in the public registry
    expect(selectMontageProfile('Something', 'default').id).toBe('default');
  });

  it('falls back to auto-selection for unknown explicit profile', () => {
    const profile = selectMontageProfile('A how-to tutorial', 'nonexistent-profile');
    // should not crash, returns best match or default
    expect(profile.id).toBeTruthy();
  });

  it('picks profile with most keyword matches', () => {
    // Default has keywords: general, tips, how-to, explainer, tutorial
    const profile = selectMontageProfile('tutorial tips how-to explainer');
    expect(profile.id).toBe('default');
  });
});

describe('buildProfileGuidelines', () => {
  it('includes profile name and description', () => {
    const guidelines = buildProfileGuidelines(selectMontageProfile('A general tutorial'));
    expect(guidelines).toContain('default');
    expect(guidelines).toContain('Dynamic General');
  });

  it('includes pacing and max shot duration', () => {
    const guidelines = buildProfileGuidelines(selectMontageProfile('A general tutorial'));
    expect(guidelines).toContain('4'); // maxShotDurationSec
  });

  it('includes allowed transitions', () => {
    const guidelines = buildProfileGuidelines(selectMontageProfile('A general tutorial'));
    expect(guidelines).toContain('crossfade');
  });

  it('includes SFX mapping', () => {
    const guidelines = buildProfileGuidelines(selectMontageProfile('A general tutorial'));
    expect(guidelines).toContain('pop'); // default text-appear SFX
  });

  it('includes director rules', () => {
    const guidelines = buildProfileGuidelines(selectMontageProfile('A general tutorial'));
    expect(guidelines).toContain('Visual change every');
  });

  it('includes color palette', () => {
    const guidelines = buildProfileGuidelines(selectMontageProfile('A general tutorial'));
    expect(guidelines).toContain('#3B82F6'); // default accent color
  });

  it('includes arc template when present', () => {
    const guidelines = buildProfileGuidelines(selectMontageProfile('A general tutorial'));
    expect(guidelines).toContain('HOOK');
  });
});
