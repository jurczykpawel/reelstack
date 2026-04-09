import { describe, it, expect, afterEach } from 'vitest';
import { createRenderer } from '../render/index';

describe('createRenderer', () => {
  const originalEnv = process.env.REMOTION_RENDERER;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.REMOTION_RENDERER;
    } else {
      process.env.REMOTION_RENDERER = originalEnv;
    }
  });

  it('returns LocalRenderer by default', () => {
    delete process.env.REMOTION_RENDERER;
    const renderer = createRenderer();
    expect(renderer.constructor.name).toBe('LocalRenderer');
  });

  it('returns LocalRenderer when REMOTION_RENDERER=local', () => {
    process.env.REMOTION_RENDERER = 'local';
    const renderer = createRenderer();
    expect(renderer.constructor.name).toBe('LocalRenderer');
  });

  it('returns LambdaRenderer when REMOTION_RENDERER=lambda', () => {
    process.env.REMOTION_RENDERER = 'lambda';
    const renderer = createRenderer();
    expect(renderer.constructor.name).toBe('LambdaRenderer');
  });
});
