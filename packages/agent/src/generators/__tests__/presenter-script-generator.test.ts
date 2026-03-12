import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatePresenterScript, type PresenterScript } from '../presenter-script-generator';

describe('generatePresenterScript', () => {
  const mockLlmCall = vi.fn();

  beforeEach(() => {
    mockLlmCall.mockReset();
  });

  const validResponse: PresenterScript = {
    sections: [
      {
        text: 'Your computer is slow because you installed 47 browser toolbars.',
        boardImageSpec: { type: 'ai-gen', prompt: 'laptop drowning in browser toolbars' },
        emotion: 'sarcastic',
      },
      {
        text: 'But seriously, let me show you how to fix it.',
        boardImageSpec: { type: 'screenshot', url: 'https://example.com/task-manager' },
        emotion: 'helpful',
      },
    ],
    hook: 'Why is your computer slower than a 90s modem?',
    cta: 'Follow for more IT rants!',
    totalDuration: 60,
  };

  it('generates script with sections array', async () => {
    mockLlmCall.mockResolvedValue(JSON.stringify(validResponse));

    const script = await generatePresenterScript({
      topic: 'Why your computer is slow',
      llmCall: mockLlmCall,
    });

    expect(script.sections).toHaveLength(2);
    expect(script.sections[0].text).toContain('browser toolbars');
    expect(script.sections[0].boardImageSpec.type).toBe('ai-gen');
    expect(script.hook).toBeTruthy();
    expect(script.cta).toBeTruthy();
  });

  it('passes topic and persona to LLM', async () => {
    mockLlmCall.mockResolvedValue(JSON.stringify(validResponse));

    await generatePresenterScript({
      topic: 'Dlaczego Twój komputer jest wolny',
      llmCall: mockLlmCall,
      persona: 'prof-IT',
      language: 'pl',
    });

    const prompt = mockLlmCall.mock.calls[0][0];
    expect(prompt).toContain('komputer');
    expect(prompt).toMatch(/prof.?IT|professor/i);
    expect(prompt).toMatch(/polish|polski|pl/i);
  });

  it('passes style to LLM', async () => {
    mockLlmCall.mockResolvedValue(JSON.stringify(validResponse));

    await generatePresenterScript({
      topic: 'IT tips',
      llmCall: mockLlmCall,
      style: 'aggressive-funny',
    });

    const prompt = mockLlmCall.mock.calls[0][0];
    expect(prompt).toMatch(/aggressive.?funny/i);
  });

  it('throws on invalid JSON response', async () => {
    mockLlmCall.mockResolvedValue('not json');

    await expect(
      generatePresenterScript({ topic: 'test', llmCall: mockLlmCall }),
    ).rejects.toThrow();
  });

  it('throws on response missing sections', async () => {
    mockLlmCall.mockResolvedValue(JSON.stringify({ hook: 'test', cta: 'test' }));

    await expect(
      generatePresenterScript({ topic: 'test', llmCall: mockLlmCall }),
    ).rejects.toThrow(/sections/i);
  });

  it('defaults to edu-casual style', async () => {
    mockLlmCall.mockResolvedValue(JSON.stringify(validResponse));

    await generatePresenterScript({
      topic: 'IT tips',
      llmCall: mockLlmCall,
    });

    const prompt = mockLlmCall.mock.calls[0][0];
    expect(prompt).toMatch(/edu.?casual/i);
  });

  it('defaults totalDuration to 60', async () => {
    const responseWithoutDuration = { ...validResponse };
    delete (responseWithoutDuration as Record<string, unknown>).totalDuration;
    mockLlmCall.mockResolvedValue(JSON.stringify(responseWithoutDuration));

    const script = await generatePresenterScript({
      topic: 'test',
      llmCall: mockLlmCall,
    });

    expect(script.totalDuration).toBe(60);
  });
});
