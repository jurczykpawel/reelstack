import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockExecSync = vi.fn();
const mockRenderMedia = vi.fn();
const mockSelectComposition = vi.fn();
const mockMkdirSync = vi.fn();
const mockStatSync = vi.fn();
const mockExistsSync = vi.fn();
const mockRmSync = vi.fn();

vi.mock('child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

vi.mock('@remotion/renderer', () => ({
  renderMedia: (...args: unknown[]) => mockRenderMedia(...args),
  selectComposition: (...args: unknown[]) => mockSelectComposition(...args),
}));

vi.mock('fs', () => ({
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  statSync: (...args: unknown[]) => mockStatSync(...args),
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  rmSync: (...args: unknown[]) => mockRmSync(...args),
}));

const { LocalRenderer } = await import('../render/local-renderer');

const minimalProps = {
  layout: 'fullscreen' as const,
  cues: [],
  bRollSegments: [],
  musicVolume: 0,
  showProgressBar: false,
  backgroundColor: '#000',
};

const mockComposition = {
  id: 'Reel',
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 150,
  defaultProps: {},
};

describe('LocalRenderer', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    savedEnv.REMOTION_BUNDLE_PATH = process.env.REMOTION_BUNDLE_PATH;
    savedEnv.REMOTION_CONCURRENCY = process.env.REMOTION_CONCURRENCY;

    mockSelectComposition.mockResolvedValue(mockComposition);
    mockRenderMedia.mockResolvedValue(undefined);
    mockStatSync.mockReturnValue({ size: 50000 });
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it('uses pre-built bundle when REMOTION_BUNDLE_PATH set', async () => {
    process.env.REMOTION_BUNDLE_PATH = '/app/remotion-bundle';
    const renderer = new LocalRenderer();
    await renderer.render(minimalProps, { outputPath: '/tmp/out.mp4' });

    expect(mockExecSync).not.toHaveBeenCalledWith(
      expect.stringContaining('bunx remotion bundle'),
      expect.anything(),
    );
    expect(mockSelectComposition).toHaveBeenCalledWith(
      expect.objectContaining({ serveUrl: '/app/remotion-bundle' }),
    );
  });

  it('bundles via CLI when REMOTION_BUNDLE_PATH not set', async () => {
    delete process.env.REMOTION_BUNDLE_PATH;
    const renderer = new LocalRenderer();
    await renderer.render(minimalProps, { outputPath: '/tmp/out.mp4' });

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('bunx remotion bundle'),
      expect.objectContaining({ cwd: expect.any(String) }),
    );
  });

  it('uses explicit concurrency option', async () => {
    delete process.env.REMOTION_CONCURRENCY;
    process.env.REMOTION_BUNDLE_PATH = '/app/bundle';
    const renderer = new LocalRenderer();
    await renderer.render(minimalProps, { outputPath: '/tmp/out.mp4', concurrency: 3 });

    expect(mockRenderMedia).toHaveBeenCalledWith(
      expect.objectContaining({ concurrency: 3 }),
    );
  });

  it('respects REMOTION_CONCURRENCY env var', async () => {
    process.env.REMOTION_CONCURRENCY = '2';
    process.env.REMOTION_BUNDLE_PATH = '/app/bundle';
    const renderer = new LocalRenderer();
    await renderer.render(minimalProps, { outputPath: '/tmp/out.mp4' });

    expect(mockRenderMedia).toHaveBeenCalledWith(
      expect.objectContaining({ concurrency: 2 }),
    );
  });

  it('selects h264 codec by default', async () => {
    process.env.REMOTION_BUNDLE_PATH = '/app/bundle';
    const renderer = new LocalRenderer();
    await renderer.render(minimalProps, { outputPath: '/tmp/out.mp4' });

    expect(mockRenderMedia).toHaveBeenCalledWith(
      expect.objectContaining({ codec: 'h264' }),
    );
  });

  it('selects h265 when requested', async () => {
    process.env.REMOTION_BUNDLE_PATH = '/app/bundle';
    const renderer = new LocalRenderer();
    await renderer.render(minimalProps, { outputPath: '/tmp/out.mp4', codec: 'h265' });

    expect(mockRenderMedia).toHaveBeenCalledWith(
      expect.objectContaining({ codec: 'h265' }),
    );
  });

  it('returns correct render result', async () => {
    process.env.REMOTION_BUNDLE_PATH = '/app/bundle';
    mockStatSync.mockReturnValue({ size: 123456 });
    const renderer = new LocalRenderer();
    const result = await renderer.render(minimalProps, { outputPath: '/tmp/out.mp4' });

    expect(result.outputPath).toBe('/tmp/out.mp4');
    expect(result.sizeBytes).toBe(123456);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('creates output directory', async () => {
    process.env.REMOTION_BUNDLE_PATH = '/app/bundle';
    const renderer = new LocalRenderer();
    await renderer.render(minimalProps, { outputPath: '/tmp/deep/dir/out.mp4' });

    expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/deep/dir', { recursive: true });
  });
});
