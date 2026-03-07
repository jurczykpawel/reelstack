import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetReelJobInternal = vi.fn();
const mockUpdateReelJobStatus = vi.fn();
const mockMarkCallbackSent = vi.fn();
const mockResetCallbackSent = vi.fn();

vi.mock('@reelstack/database', () => ({
  getReelJobInternal: (...args: unknown[]) => mockGetReelJobInternal(...args),
  updateReelJobStatus: (...args: unknown[]) => mockUpdateReelJobStatus(...args),
  markCallbackSent: (...args: unknown[]) => mockMarkCallbackSent(...args),
  resetCallbackSent: (...args: unknown[]) => mockResetCallbackSent(...args),
}));

const mockAgentProduce = vi.fn();
const mockProduceComposition = vi.fn();
vi.mock('@reelstack/agent', () => ({
  produce: (...args: unknown[]) => mockAgentProduce(...args),
  produceComposition: (...args: unknown[]) => mockProduceComposition(...args),
}));

const mockUpload = vi.fn();
const mockGetSignedUrl = vi.fn();
vi.mock('@reelstack/storage', () => ({
  createStorage: () => Promise.resolve({
    upload: mockUpload,
    getSignedUrl: mockGetSignedUrl,
  }),
}));

const mockReadFile = vi.fn();
const mockUnlink = vi.fn();
vi.mock('fs/promises', () => ({
  default: {
    readFile: (...args: unknown[]) => mockReadFile(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
  },
  readFile: (...args: unknown[]) => mockReadFile(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
}));

const { processReelPipelineJob } = await import('../reel-pipeline-worker');

const makeJob = (overrides: Record<string, unknown> = {}) => ({
  id: 'reel-1',
  script: 'Hello world',
  callbackUrl: null,
  language: null,
  parentJobId: null,
  reelConfig: {
    mode: 'generate',
    layout: 'split-screen',
    style: 'cinematic',
  },
  ...overrides,
});

describe('processReelPipelineJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateReelJobStatus.mockResolvedValue({});
    mockMarkCallbackSent.mockResolvedValue(true);
    mockResetCallbackSent.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue(Buffer.from('fake-mp4'));
    mockUpload.mockResolvedValue(undefined);
    mockGetSignedUrl.mockResolvedValue('https://storage.example.com/signed-url');
    mockUnlink.mockResolvedValue(undefined);
    mockAgentProduce.mockResolvedValue({ outputPath: '/tmp/out.mp4', steps: [], generatedAssets: [] });
    mockProduceComposition.mockResolvedValue({ outputPath: '/tmp/out.mp4', steps: [] });
  });

  it('throws when job not found', async () => {
    mockGetReelJobInternal.mockResolvedValue(null);
    await expect(processReelPipelineJob('nonexistent')).rejects.toThrow('not found');
  });

  it('sets status to PROCESSING on start', async () => {
    mockGetReelJobInternal.mockResolvedValue(makeJob());

    await processReelPipelineJob('reel-1');

    expect(mockUpdateReelJobStatus).toHaveBeenCalledWith('reel-1', expect.objectContaining({
      status: 'PROCESSING',
      progress: 0,
    }));
  });

  // ── generate mode ─────────────────────────────────────────

  it('calls agentProduce for mode=generate', async () => {
    mockGetReelJobInternal.mockResolvedValue(makeJob({ reelConfig: { mode: 'generate', layout: 'split-screen', style: 'cinematic' } }));

    await processReelPipelineJob('reel-1');

    expect(mockAgentProduce).toHaveBeenCalledWith(expect.objectContaining({
      script: 'Hello world',
      layout: 'split-screen',
      style: 'cinematic',
    }));
    expect(mockProduceComposition).not.toHaveBeenCalled();
  });

  it('defaults to generate mode when reelConfig is null', async () => {
    mockGetReelJobInternal.mockResolvedValue(makeJob({ reelConfig: null }));

    await processReelPipelineJob('reel-1');

    expect(mockAgentProduce).toHaveBeenCalled();
  });

  // ── compose mode ──────────────────────────────────────────

  it('calls produceComposition for mode=compose', async () => {
    mockGetReelJobInternal.mockResolvedValue(makeJob({
      reelConfig: {
        mode: 'compose',
        assets: [{ id: 'v1', url: 'https://example.com/v.mp4', type: 'video', description: 'Video', isPrimary: true }],
      },
    }));

    await processReelPipelineJob('reel-1');

    expect(mockProduceComposition).toHaveBeenCalledWith(expect.objectContaining({
      script: 'Hello world',
      assets: expect.arrayContaining([expect.objectContaining({ id: 'v1' })]),
    }));
    expect(mockAgentProduce).not.toHaveBeenCalled();
  });

  // ── captions mode ─────────────────────────────────────────

  it('calls produceComposition for mode=captions with script', async () => {
    mockGetReelJobInternal.mockResolvedValue(makeJob({
      script: 'Hello world',
      reelConfig: {
        mode: 'captions',
        captionsMode: 'script',
        videoUrl: 'https://example.com/video.mp4',
      },
    }));

    await processReelPipelineJob('reel-1');

    expect(mockProduceComposition).toHaveBeenCalledWith(expect.objectContaining({
      script: 'Hello world',
      assets: expect.arrayContaining([expect.objectContaining({ url: 'https://example.com/video.mp4', isPrimary: true })]),
    }));
    expect(mockAgentProduce).not.toHaveBeenCalled();
  });

  it('passes existingCues for mode=captions with cues', async () => {
    const cues = [{ id: '1', text: 'Hello', startTime: 0, endTime: 1.5 }];
    mockGetReelJobInternal.mockResolvedValue(makeJob({
      reelConfig: {
        mode: 'captions',
        captionsMode: 'cues',
        videoUrl: 'https://example.com/video.mp4',
        cues,
      },
    }));

    await processReelPipelineJob('reel-1');

    expect(mockProduceComposition).toHaveBeenCalledWith(expect.objectContaining({
      existingCues: cues,
    }));
  });

  // ── post-render ───────────────────────────────────────────

  it('uploads output to storage', async () => {
    mockGetReelJobInternal.mockResolvedValue(makeJob());

    await processReelPipelineJob('reel-1');

    expect(mockReadFile).toHaveBeenCalledWith('/tmp/out.mp4');
    expect(mockUpload).toHaveBeenCalledWith(expect.any(Buffer), 'reels/reel-1/output.mp4');
  });

  it('gets signed URL with 24h expiry', async () => {
    mockGetReelJobInternal.mockResolvedValue(makeJob());

    await processReelPipelineJob('reel-1');

    expect(mockGetSignedUrl).toHaveBeenCalledWith('reels/reel-1/output.mp4', 86400);
  });

  it('sets status to COMPLETED with output URL', async () => {
    mockGetReelJobInternal.mockResolvedValue(makeJob());

    await processReelPipelineJob('reel-1');

    expect(mockUpdateReelJobStatus).toHaveBeenCalledWith('reel-1', expect.objectContaining({
      status: 'COMPLETED',
      progress: 100,
      outputUrl: 'https://storage.example.com/signed-url',
    }));
  });

  it('cleans up local file after upload', async () => {
    mockGetReelJobInternal.mockResolvedValue(makeJob());

    await processReelPipelineJob('reel-1');

    expect(mockUnlink).toHaveBeenCalledWith('/tmp/out.mp4');
  });

  it('sets status to FAILED on error', async () => {
    mockGetReelJobInternal.mockResolvedValue(makeJob());
    mockAgentProduce.mockRejectedValue(new Error('render crashed'));

    await expect(processReelPipelineJob('reel-1')).rejects.toThrow('render crashed');

    expect(mockUpdateReelJobStatus).toHaveBeenCalledWith('reel-1', expect.objectContaining({
      status: 'FAILED',
      error: 'render crashed',
    }));
  });
});
