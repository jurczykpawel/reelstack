import type { ReelProps } from '../schemas/reel-props';

export interface RenderOptions {
  outputPath: string;
  codec?: 'h264' | 'h265';
  crf?: number;
  /** Number of parallel frame rendering threads. Default: 50% of CPU cores. */
  concurrency?: number;
}

export interface RenderResult {
  outputPath: string;
  sizeBytes: number;
  durationMs: number;
}

export interface RemotionRenderer {
  render(props: ReelProps, options: RenderOptions): Promise<RenderResult>;
}
