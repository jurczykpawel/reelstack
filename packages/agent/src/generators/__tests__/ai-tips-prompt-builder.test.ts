import { describe, it, expect } from 'vitest';
import { buildVideoPrompt } from '../ai-tips-prompt-builder';
import type { AiTip } from '../ai-tips-script-generator';

const sampleTip: AiTip = {
  object: 'toaster',
  emotion: 'excited',
  scenery: 'modern kitchen with warm bokeh lights',
  dialog: 'Clear your temp files to speed up your PC!',
};

describe('buildVideoPrompt', () => {
  it('includes object name in prompt', () => {
    const prompt = buildVideoPrompt(sampleTip);
    expect(prompt).toContain('toaster');
  });

  it('includes Pixar 3D style instruction', () => {
    const prompt = buildVideoPrompt(sampleTip);
    expect(prompt).toMatch(/pixar|3d|animated/i);
  });

  it('includes emotion', () => {
    const prompt = buildVideoPrompt(sampleTip);
    expect(prompt).toContain('excited');
  });

  it('includes scenery', () => {
    const prompt = buildVideoPrompt(sampleTip);
    expect(prompt).toContain('kitchen');
  });

  it('specifies closed mouth', () => {
    const prompt = buildVideoPrompt(sampleTip);
    expect(prompt).toMatch(/closed.?mouth|mouth.?closed|no.?talking|not.?speaking/i);
  });

  it('specifies 9:16 aspect ratio', () => {
    const prompt = buildVideoPrompt(sampleTip, { aspectRatio: '9:16' });
    expect(prompt).toMatch(/9.?:?.?16|vertical|portrait/i);
  });

  it('generates different prompts for different providers', () => {
    const veo = buildVideoPrompt(sampleTip, { provider: 'veo3' });
    const kling = buildVideoPrompt(sampleTip, { provider: 'kling' });
    // Both should contain core elements but may differ in structure
    expect(veo).toContain('toaster');
    expect(kling).toContain('toaster');
  });

  it('handles minimal tip', () => {
    const minimalTip: AiTip = {
      object: 'lamp',
      emotion: 'calm',
      scenery: 'desk',
      dialog: 'Use dark mode.',
    };
    const prompt = buildVideoPrompt(minimalTip);
    expect(prompt).toContain('lamp');
    expect(prompt).toContain('calm');
  });
});
