import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateAiTipsScript, type AiTipsScript } from '../ai-tips-script-generator';

describe('generateAiTipsScript', () => {
  const mockLlmCall = vi.fn();

  beforeEach(() => {
    mockLlmCall.mockReset();
  });

  const validResponse: AiTipsScript = {
    tips: [
      {
        object: 'toaster',
        emotion: 'excited',
        scenery: 'modern kitchen with bokeh lights',
        dialog: 'Hey! Did you know you can speed up your computer by clearing the temp files?',
      },
      {
        object: 'blender',
        emotion: 'confident',
        scenery: 'cozy kitchen counter',
        dialog: 'Press Windows+R, type %temp%, and delete everything inside!',
      },
    ],
    hook: 'Your kitchen appliances know more IT tricks than your IT department',
    cta: 'Follow for more tips from unexpected places!',
  };

  it('generates script with tips array', async () => {
    mockLlmCall.mockResolvedValue(JSON.stringify(validResponse));

    const script = await generateAiTipsScript({
      topic: '2 IT tips for Windows',
      llmCall: mockLlmCall,
    });

    expect(script.tips).toHaveLength(2);
    expect(script.tips[0].object).toBe('toaster');
    expect(script.tips[0].emotion).toBe('excited');
    expect(script.tips[0].scenery).toContain('kitchen');
    expect(script.tips[0].dialog).toBeTruthy();
    expect(script.hook).toBeTruthy();
    expect(script.cta).toBeTruthy();
  });

  it('passes topic and language to LLM', async () => {
    mockLlmCall.mockResolvedValue(JSON.stringify(validResponse));

    await generateAiTipsScript({
      topic: '3 skróty klawiaturowe macOS',
      llmCall: mockLlmCall,
      language: 'pl',
      numberOfTips: 3,
    });

    const prompt = mockLlmCall.mock.calls[0][0];
    expect(prompt).toContain('3');
    expect(prompt).toMatch(/polish|polski|pl/i);
    expect(prompt).toContain('macOS');
  });

  it('passes variant to LLM', async () => {
    mockLlmCall.mockResolvedValue(JSON.stringify(validResponse));

    await generateAiTipsScript({
      topic: 'IT tips',
      llmCall: mockLlmCall,
      variant: 'single-object',
    });

    const prompt = mockLlmCall.mock.calls[0][0];
    expect(prompt).toMatch(/single.?object/i);
  });

  it('throws on invalid JSON response', async () => {
    mockLlmCall.mockResolvedValue('not json');

    await expect(
      generateAiTipsScript({ topic: 'test', llmCall: mockLlmCall }),
    ).rejects.toThrow();
  });

  it('throws on response missing tips', async () => {
    mockLlmCall.mockResolvedValue(JSON.stringify({ hook: 'test', cta: 'test' }));

    await expect(
      generateAiTipsScript({ topic: 'test', llmCall: mockLlmCall }),
    ).rejects.toThrow(/tips/i);
  });

  it('defaults to 5 tips', async () => {
    mockLlmCall.mockResolvedValue(JSON.stringify(validResponse));

    await generateAiTipsScript({
      topic: 'IT tips',
      llmCall: mockLlmCall,
    });

    const prompt = mockLlmCall.mock.calls[0][0];
    expect(prompt).toContain('5');
  });
});
