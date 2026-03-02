import { describe, it, expect } from 'vitest';
import { LambdaRenderer } from '../render/lambda-renderer';

describe('LambdaRenderer', () => {
  it('throws not implemented error', async () => {
    const renderer = new LambdaRenderer();
    const props = { layout: 'fullscreen' as const, cues: [], bRollSegments: [], musicVolume: 0, showProgressBar: false, backgroundColor: '#000' };
    await expect(renderer.render(props, { outputPath: '/tmp/out.mp4' }))
      .rejects.toThrow('Lambda renderer not yet implemented');
  });

  it('includes Remotion Lambda docs link in error', async () => {
    const renderer = new LambdaRenderer();
    const props = { layout: 'fullscreen' as const, cues: [], bRollSegments: [], musicVolume: 0, showProgressBar: false, backgroundColor: '#000' };
    await expect(renderer.render(props, { outputPath: '/tmp/out.mp4' }))
      .rejects.toThrow('remotion.dev/docs/lambda');
  });
});
