import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVideoGenerator } from '../video-generator';
import type { ProductionTool } from '../../registry/tool-interface';
import type { AssetGenerationJob, AssetGenerationStatus } from '../../types';

function createMockTool(overrides?: Partial<ProductionTool>): ProductionTool {
  return {
    id: 'mock-video',
    name: 'Mock Video Tool',
    capabilities: [{
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 8,
      estimatedLatencyMs: 5000,
      isAsync: true,
      costTier: 'moderate',
    }],
    healthCheck: vi.fn().mockResolvedValue({ available: true }),
    generate: vi.fn().mockResolvedValue({
      jobId: 'job-123',
      toolId: 'mock-video',
      status: 'processing',
    } satisfies AssetGenerationJob),
    poll: vi.fn().mockResolvedValue({
      jobId: 'job-123',
      toolId: 'mock-video',
      status: 'completed',
      url: 'https://cdn.example.com/video.mp4',
      durationSeconds: 5,
    } satisfies AssetGenerationStatus),
    ...overrides,
  };
}

describe('VideoGenerator', () => {
  it('generates video and polls until complete', async () => {
    const tool = createMockTool();
    const generator = createVideoGenerator(tool, { pollIntervalMs: 10 });

    const result = await generator.generate({
      prompt: 'A toaster giving cooking tips, Pixar 3D style',
      duration: 5,
      aspectRatio: '9:16',
    });

    expect(result.videoUrl).toBe('https://cdn.example.com/video.mp4');
    expect(result.durationSeconds).toBe(5);
    expect(tool.generate).toHaveBeenCalledOnce();
    expect(tool.poll).toHaveBeenCalledOnce();
  });

  it('polls multiple times for async generation', async () => {
    let pollCount = 0;
    const tool = createMockTool({
      poll: vi.fn().mockImplementation(async () => {
        pollCount++;
        if (pollCount < 3) {
          return { jobId: 'job-123', toolId: 'mock-video', status: 'processing' };
        }
        return {
          jobId: 'job-123',
          toolId: 'mock-video',
          status: 'completed',
          url: 'https://cdn.example.com/final.mp4',
          durationSeconds: 8,
        };
      }),
    });

    const generator = createVideoGenerator(tool, { pollIntervalMs: 10, maxPollAttempts: 10 });
    const result = await generator.generate({
      prompt: 'Test video',
      duration: 8,
      aspectRatio: '9:16',
    });

    expect(result.videoUrl).toBe('https://cdn.example.com/final.mp4');
    expect(tool.poll).toHaveBeenCalledTimes(3);
  });

  it('throws on generation failure', async () => {
    const tool = createMockTool({
      generate: vi.fn().mockResolvedValue({
        jobId: 'job-fail',
        toolId: 'mock-video',
        status: 'failed',
        error: 'API rate limited',
      }),
    });

    const generator = createVideoGenerator(tool);

    await expect(generator.generate({
      prompt: 'Test',
      duration: 5,
      aspectRatio: '9:16',
    })).rejects.toThrow('API rate limited');
  });

  it('throws on poll failure', async () => {
    const tool = createMockTool({
      poll: vi.fn().mockResolvedValue({
        jobId: 'job-123',
        toolId: 'mock-video',
        status: 'failed',
        error: 'Content policy violation',
      }),
    });

    const generator = createVideoGenerator(tool, { pollIntervalMs: 10 });

    await expect(generator.generate({
      prompt: 'Bad prompt',
      duration: 5,
      aspectRatio: '9:16',
    })).rejects.toThrow('Content policy violation');
  });

  it('throws on poll timeout (max attempts exceeded)', async () => {
    const tool = createMockTool({
      poll: vi.fn().mockResolvedValue({
        jobId: 'job-123',
        toolId: 'mock-video',
        status: 'processing',
      }),
    });

    const generator = createVideoGenerator(tool, { pollIntervalMs: 10, maxPollAttempts: 3 });

    await expect(generator.generate({
      prompt: 'Slow video',
      duration: 5,
      aspectRatio: '9:16',
    })).rejects.toThrow(/timeout|exceeded/i);
  });

  it('handles tool without poll method (sync generation)', async () => {
    const tool = createMockTool({
      generate: vi.fn().mockResolvedValue({
        jobId: 'job-sync',
        toolId: 'mock-video',
        status: 'completed',
        url: 'https://cdn.example.com/instant.mp4',
        durationSeconds: 3,
      }),
      poll: undefined,
    });

    const generator = createVideoGenerator(tool);
    const result = await generator.generate({
      prompt: 'Instant video',
      duration: 3,
      aspectRatio: '9:16',
    });

    expect(result.videoUrl).toBe('https://cdn.example.com/instant.mp4');
  });

  it('exposes toolId from underlying tool', () => {
    const tool = createMockTool();
    const generator = createVideoGenerator(tool);
    expect(generator.toolId).toBe('mock-video');
  });
});
