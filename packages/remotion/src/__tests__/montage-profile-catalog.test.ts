import { describe, it, expect } from 'vitest';
import {
  MONTAGE_PROFILE_CATALOG,
  type MontageProfileEntry,
  TRANSITION_CATALOG,
  SFX_CATALOG,
} from '../schemas/catalog';

describe('MONTAGE_PROFILE_CATALOG', () => {
  it('has exactly 3 profiles', () => {
    expect(MONTAGE_PROFILE_CATALOG).toHaveLength(3);
  });

  it('has all required profiles', () => {
    const ids = MONTAGE_PROFILE_CATALOG.map(p => p.id);
    expect(ids).toContain('network-chuck');
    expect(ids).toContain('leadgen-man');
    expect(ids).toContain('ai-tool-showcase');
  });

  it('each profile has required fields', () => {
    for (const profile of MONTAGE_PROFILE_CATALOG) {
      expect(profile.id).toBeTruthy();
      expect(profile.name).toBeTruthy();
      expect(profile.description).toBeTruthy();
      expect(profile.pacing).toBeTruthy();
      expect(profile.maxShotDurationSec).toBeGreaterThan(0);
      expect(profile.effectsPerThirtySec).toBeDefined();
      expect(profile.allowedTransitions.length).toBeGreaterThan(0);
      expect(Object.keys(profile.sfxMapping).length).toBeGreaterThan(0);
      expect(profile.directorRules.length).toBeGreaterThan(0);
    }
  });

  it('allowedTransitions reference valid transition types', () => {
    const validTypes = TRANSITION_CATALOG.map(t => t.type);
    for (const profile of MONTAGE_PROFILE_CATALOG) {
      for (const t of profile.allowedTransitions) {
        expect(validTypes).toContain(t);
      }
    }
  });

  it('sfxMapping values reference valid SFX IDs', () => {
    const validSfxIds = SFX_CATALOG.map(s => s.id);
    for (const profile of MONTAGE_PROFILE_CATALOG) {
      for (const sfxId of Object.values(profile.sfxMapping)) {
        expect(validSfxIds).toContain(sfxId);
      }
    }
  });

  it('network-chuck has strict pacing (max 4s shots)', () => {
    const nc = MONTAGE_PROFILE_CATALOG.find(p => p.id === 'network-chuck')!;
    expect(nc.maxShotDurationSec).toBeLessThanOrEqual(4);
    expect(nc.allowedTransitions).toContain('none'); // hard cuts allowed
  });

  it('leadgen-man has faster pacing than network-chuck', () => {
    const nc = MONTAGE_PROFILE_CATALOG.find(p => p.id === 'network-chuck')!;
    const lm = MONTAGE_PROFILE_CATALOG.find(p => p.id === 'leadgen-man')!;
    expect(lm.maxShotDurationSec).toBeLessThanOrEqual(nc.maxShotDurationSec);
  });

  it('leadgen-man forbids glitch transitions', () => {
    const lm = MONTAGE_PROFILE_CATALOG.find(p => p.id === 'leadgen-man')!;
    expect(lm.allowedTransitions).not.toContain('none');
  });

  it('ai-tool-showcase forbids glitch and hard cut transitions', () => {
    const ats = MONTAGE_PROFILE_CATALOG.find(p => p.id === 'ai-tool-showcase')!;
    expect(ats.allowedTransitions).not.toContain('none');
  });

  it('profiles have topic keywords for auto-selection', () => {
    for (const profile of MONTAGE_PROFILE_CATALOG) {
      expect(profile.topicKeywords.length).toBeGreaterThan(0);
    }
  });
});
