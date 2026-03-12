import { describe, it, expect } from 'vitest';
import { selectMontageProfile, buildProfileGuidelines } from '../montage-profile';

describe('selectMontageProfile', () => {
  it('selects network-chuck for coding/terminal topics', () => {
    expect(selectMontageProfile('How to use Docker containers in Linux terminal').id).toBe('network-chuck');
    expect(selectMontageProfile('Python scripting for cybersecurity hacking').id).toBe('network-chuck');
    expect(selectMontageProfile('DevOps pipeline z Kubernetes').id).toBe('network-chuck');
  });

  it('selects leadgen-man for business/marketing topics', () => {
    expect(selectMontageProfile('Jak zwiększyć sprzedaż w SaaS business').id).toBe('leadgen-man');
    expect(selectMontageProfile('LinkedIn growth marketing strategy').id).toBe('leadgen-man');
    expect(selectMontageProfile('Entrepreneur motivation sales funnel').id).toBe('leadgen-man');
  });

  it('selects ai-tool-showcase for AI tool reviews', () => {
    expect(selectMontageProfile('5 best AI tools for content creation tutorial').id).toBe('ai-tool-showcase');
    expect(selectMontageProfile('ChatGPT vs Claude comparison review').id).toBe('ai-tool-showcase');
    expect(selectMontageProfile('Speed-run through top software tools').id).toBe('ai-tool-showcase');
  });

  it('defaults to network-chuck when no keywords match', () => {
    expect(selectMontageProfile('Random topic about nothing specific').id).toBe('network-chuck');
  });

  it('returns explicit profile when provided', () => {
    expect(selectMontageProfile('Business marketing tips', 'ai-tool-showcase').id).toBe('ai-tool-showcase');
  });

  it('falls back to auto-selection for unknown explicit profile', () => {
    const profile = selectMontageProfile('Docker containers tutorial', 'nonexistent-profile');
    expect(profile.id).toBe('network-chuck');
  });
});

describe('buildProfileGuidelines', () => {
  it('includes profile name and description', () => {
    const guidelines = buildProfileGuidelines(selectMontageProfile('Docker tutorial'));
    expect(guidelines).toContain('network-chuck');
    expect(guidelines).toContain('Cyber-Retro Terminal');
  });

  it('includes pacing and max shot duration', () => {
    const guidelines = buildProfileGuidelines(selectMontageProfile('Docker tutorial'));
    expect(guidelines).toContain('4');  // maxShotDurationSec
  });

  it('includes allowed transitions', () => {
    const lm = buildProfileGuidelines(selectMontageProfile('SaaS business marketing'));
    expect(lm).toContain('crossfade');
    expect(lm).not.toContain('"none"'); // leadgen-man forbids hard cuts
  });

  it('includes SFX mapping', () => {
    const guidelines = buildProfileGuidelines(selectMontageProfile('Docker tutorial'));
    expect(guidelines).toContain('glitch'); // network-chuck text-appear SFX
  });

  it('includes director rules', () => {
    const guidelines = buildProfileGuidelines(selectMontageProfile('Docker tutorial'));
    expect(guidelines).toContain('Visual change every');
  });

  it('includes color palette', () => {
    const guidelines = buildProfileGuidelines(selectMontageProfile('Docker tutorial'));
    expect(guidelines).toContain('#ff0055'); // network-chuck danger color
  });
});
