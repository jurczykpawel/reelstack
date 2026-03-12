/**
 * VideoGenerator adapter: wraps a ProductionTool into a simple
 * generate-and-wait interface for all-in-one video generation.
 *
 * Used by ai-tips and presenter-explainer modes where the pipeline
 * needs to generate complete video clips (prompt → video with audio).
 */
import type { ProductionTool } from '../registry/tool-interface';

export interface VideoGeneratorInput {
  prompt: string;
  duration: number;
  aspectRatio: '9:16' | '16:9' | '1:1';
}

export interface VideoGeneratorResult {
  videoUrl: string;
  audioUrl?: string;
  durationSeconds?: number;
}

export interface VideoGeneratorOptions {
  /** Polling interval in ms (default: 5000) */
  pollIntervalMs?: number;
  /** Max polling attempts before timeout (default: 60) */
  maxPollAttempts?: number;
}

export interface VideoGenerator {
  readonly toolId: string;
  generate(input: VideoGeneratorInput): Promise<VideoGeneratorResult>;
}

/**
 * Create a VideoGenerator from any ProductionTool that supports video generation.
 * Handles the full lifecycle: generate → poll until done → return URL.
 */
export function createVideoGenerator(
  tool: ProductionTool,
  options?: VideoGeneratorOptions,
): VideoGenerator {
  const pollIntervalMs = options?.pollIntervalMs ?? 5000;
  const maxPollAttempts = options?.maxPollAttempts ?? 60;

  return {
    toolId: tool.id,

    async generate(input: VideoGeneratorInput): Promise<VideoGeneratorResult> {
      const job = await tool.generate({
        purpose: `AI video: ${input.prompt.slice(0, 100)}`,
        prompt: input.prompt,
        durationSeconds: input.duration,
        aspectRatio: input.aspectRatio,
      });

      if (job.status === 'failed') {
        throw new Error(job.error ?? `${tool.name} generation failed`);
      }

      // Sync tool - result is immediate
      if (job.status === 'completed') {
        if (!job.url) throw new Error(`${tool.name} returned completed but no URL`);
        return { videoUrl: job.url, durationSeconds: job.durationSeconds };
      }

      // Async tool - poll until done
      if (!tool.poll) {
        throw new Error(`${tool.name} returned async job but has no poll method`);
      }

      for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
        await sleep(pollIntervalMs);
        const status = await tool.poll(job.jobId);

        if (status.status === 'completed') {
          if (!status.url) throw new Error(`${tool.name} completed but no URL`);
          return { videoUrl: status.url, durationSeconds: status.durationSeconds };
        }

        if (status.status === 'failed') {
          throw new Error(status.error ?? `${tool.name} generation failed during processing`);
        }
      }

      throw new Error(`${tool.name} generation timeout: exceeded ${maxPollAttempts} poll attempts`);
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
