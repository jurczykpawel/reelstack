import { describe, it, expect, vi } from 'vitest';
import { resolveBoardImage, type BoardImageResolverDeps } from '../board-image-resolver';
import type { BoardImageSpec } from '../presenter-script-generator';

describe('resolveBoardImage', () => {
  const mockDeps: BoardImageResolverDeps = {
    generateImage: vi.fn<(prompt: string) => Promise<string>>().mockResolvedValue('https://cdn.example.com/generated.png'),
    searchImage: vi.fn<(query: string) => Promise<string>>().mockResolvedValue('https://cdn.example.com/found.jpg'),
    takeScreenshot: vi.fn<(url: string) => Promise<string>>().mockResolvedValue('https://cdn.example.com/screenshot.png'),
  };

  it('resolves ai-gen spec via generateImage', async () => {
    const spec: BoardImageSpec = { type: 'ai-gen', prompt: 'a laptop on fire' };
    const url = await resolveBoardImage(spec, mockDeps);
    expect(url).toBe('https://cdn.example.com/generated.png');
    expect(mockDeps.generateImage).toHaveBeenCalledWith('a laptop on fire');
  });

  it('resolves web-search spec via searchImage', async () => {
    const spec: BoardImageSpec = { type: 'web-search', searchQuery: 'task manager windows' };
    const url = await resolveBoardImage(spec, mockDeps);
    expect(url).toBe('https://cdn.example.com/found.jpg');
    expect(mockDeps.searchImage).toHaveBeenCalledWith('task manager windows');
  });

  it('resolves screenshot spec via takeScreenshot', async () => {
    const spec: BoardImageSpec = { type: 'screenshot', url: 'https://example.com/page' };
    const url = await resolveBoardImage(spec, mockDeps);
    expect(url).toBe('https://cdn.example.com/screenshot.png');
    expect(mockDeps.takeScreenshot).toHaveBeenCalledWith('https://example.com/page');
  });

  it('resolves infographic spec via generateImage with prefix', async () => {
    const spec: BoardImageSpec = { type: 'infographic', prompt: 'comparison chart SaaS vs self-hosted' };
    const url = await resolveBoardImage(spec, mockDeps);
    expect(url).toBe('https://cdn.example.com/generated.png');
    expect(mockDeps.generateImage).toHaveBeenCalledWith(
      expect.stringContaining('comparison chart'),
    );
  });

  it('falls back to ai-gen when web-search has no query', async () => {
    const spec: BoardImageSpec = { type: 'web-search', prompt: 'fallback prompt' };
    const url = await resolveBoardImage(spec, mockDeps);
    expect(url).toBe('https://cdn.example.com/generated.png');
    expect(mockDeps.generateImage).toHaveBeenCalledWith('fallback prompt');
  });

  it('falls back to ai-gen when screenshot has no url', async () => {
    const spec: BoardImageSpec = { type: 'screenshot', prompt: 'fallback prompt' };
    const url = await resolveBoardImage(spec, mockDeps);
    expect(url).toBe('https://cdn.example.com/generated.png');
    expect(mockDeps.generateImage).toHaveBeenCalledWith('fallback prompt');
  });
});
