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

const mockCreateReel = vi.fn();
vi.mock('@reelstack/remotion/pipeline', () => ({
  createReel: (...args: unknown[]) => mockCreateReel(...args),
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

const mockJob = {
  id: 'reel-1',
  script: 'Hello world',
  reelConfig: {
    layout: 'split-screen',
    style: 'cinematic',
    primaryVideoUrl: 'https://example.com/video.mp4',
  },
};

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
  });

  it('throws when job not found', async () => {
    mockGetReelJobInternal.mockResolvedValue(null);
    await expect(processReelPipelineJob('nonexistent')).rejects.toThrow('not found');
  });

  it('sets status to PROCESSING on start', async () => {
    mockGetReelJobInternal.mockResolvedValue(mockJob);
    mockCreateReel.mockResolvedValue({ outputPath: '/tmp/out.mp4' });

    await processReelPipelineJob('reel-1');

    expect(mockUpdateReelJobStatus).toHaveBeenCalledWith('reel-1', expect.objectContaining({
      status: 'PROCESSING',
      progress: 0,
    }));
  });

  it('calls createReel with correct config', async () => {
    mockGetReelJobInternal.mockResolvedValue(mockJob);
    mockCreateReel.mockResolvedValue({ outputPath: '/tmp/out.mp4' });

    await processReelPipelineJob('reel-1');

    expect(mockCreateReel).toHaveBeenCalledWith(
      expect.objectContaining({
        script: 'Hello world',
        layout: 'split-screen',
        style: 'cinematic',
        primaryVideoUrl: 'https://example.com/video.mp4',
      }),
      expect.any(Function),
    );
  });

  it('uploads output to storage', async () => {
    mockGetReelJobInternal.mockResolvedValue(mockJob);
    mockCreateReel.mockResolvedValue({ outputPath: '/tmp/out.mp4' });

    await processReelPipelineJob('reel-1');

    expect(mockReadFile).toHaveBeenCalledWith('/tmp/out.mp4');
    expect(mockUpload).toHaveBeenCalledWith(expect.any(Buffer), 'reels/reel-1/output.mp4');
  });

  it('gets signed URL with 24h expiry', async () => {
    mockGetReelJobInternal.mockResolvedValue(mockJob);
    mockCreateReel.mockResolvedValue({ outputPath: '/tmp/out.mp4' });

    await processReelPipelineJob('reel-1');

    expect(mockGetSignedUrl).toHaveBeenCalledWith('reels/reel-1/output.mp4', 86400);
  });

  it('sets status to COMPLETED with output URL', async () => {
    mockGetReelJobInternal.mockResolvedValue(mockJob);
    mockCreateReel.mockResolvedValue({ outputPath: '/tmp/out.mp4' });

    await processReelPipelineJob('reel-1');

    expect(mockUpdateReelJobStatus).toHaveBeenCalledWith('reel-1', expect.objectContaining({
      status: 'COMPLETED',
      progress: 100,
      outputUrl: 'https://storage.example.com/signed-url',
    }));
  });

  it('cleans up local file after upload', async () => {
    mockGetReelJobInternal.mockResolvedValue(mockJob);
    mockCreateReel.mockResolvedValue({ outputPath: '/tmp/out.mp4' });

    await processReelPipelineJob('reel-1');

    expect(mockUnlink).toHaveBeenCalledWith('/tmp/out.mp4');
  });

  it('sets status to FAILED on error', async () => {
    mockGetReelJobInternal.mockResolvedValue(mockJob);
    mockCreateReel.mockRejectedValue(new Error('render crashed'));

    await expect(processReelPipelineJob('reel-1')).rejects.toThrow('render crashed');

    expect(mockUpdateReelJobStatus).toHaveBeenCalledWith('reel-1', expect.objectContaining({
      status: 'FAILED',
      error: 'render crashed',
    }));
  });

  it('handles default config when reelConfig is null', async () => {
    mockGetReelJobInternal.mockResolvedValue({ ...mockJob, reelConfig: null, script: 'Test' });
    mockCreateReel.mockResolvedValue({ outputPath: '/tmp/out.mp4' });

    await processReelPipelineJob('reel-1');

    expect(mockCreateReel).toHaveBeenCalledWith(
      expect.objectContaining({ layout: 'fullscreen' }),
      expect.any(Function),
    );
  });

  it('maps progress step names to percentages', async () => {
    mockGetReelJobInternal.mockResolvedValue(mockJob);
    mockCreateReel.mockImplementation(async (_req: unknown, onStep: (step: string) => void) => {
      onStep('Generating voiceover...');
      onStep('Rendering video...');
      return { outputPath: '/tmp/out.mp4' };
    });

    await processReelPipelineJob('reel-1');

    expect(mockUpdateReelJobStatus).toHaveBeenCalledWith('reel-1', { progress: 10 });
    expect(mockUpdateReelJobStatus).toHaveBeenCalledWith('reel-1', { progress: 70 });
  });
});
