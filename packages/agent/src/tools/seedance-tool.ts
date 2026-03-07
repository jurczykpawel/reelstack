import { randomUUID } from 'node:crypto';
import type { ProductionTool } from '../registry/tool-interface';
import type { ToolCapability, AssetGenerationRequest, AssetGenerationJob, AssetGenerationStatus } from '../types';
import { createLogger } from '@reelstack/logger';
import { isPublicUrl } from '../planner/production-planner';

const log = createLogger('seedance-tool');

const SEEDANCE_API = 'https://api.seedance.ai';

/**
 * Seedance (ByteDance) video generation tool.
 * Generates AI video clips from text prompts.
 *
 * Requires: SEEDANCE_API_KEY
 * Optional: SEEDANCE_MODEL (default: seedance-1.0)
 *
 * Note: Seedance API may be accessed through third-party providers.
 * Set SEEDANCE_API_BASE to override the base URL if using a proxy.
 */
export class SeedanceTool implements ProductionTool {
  readonly id = 'seedance';
  readonly name = 'Seedance Video';
  readonly promptGuidelines = `Seedance 2.0 prompt framework (5 layers):
SUBJECT + ACTION + CAMERA + STYLE + SOUND

CRITICAL RULE: Subject + Action must appear in the FIRST 20-30 words. The model weights early tokens heavily.

Complexity levels:
- L1 (≤30 words): atmospheric, let the model decide — "Foggy mountain lake at dawn, still water, bird call. Locked wide shot."
- L2 (30-100 words): directed shot with clear subject + camera + lighting
- L3 (100-300 words): add timestamps — "0-3s: Wide shot. 3-6s: Slow dolly push. 6-10s: Close-up."
- L4 (300-1000w): full choreography per shot with physics and reactions

Camera parameters:
- Framing: wide | medium | close-up | ECU | over-shoulder | full body
- Movement: locked-off | dolly push | dolly pull | pan | tilt | orbit | handheld | crane | tracking
- Speed: slow | moderate | fast | "over 8 seconds"
- Angle: eye level | low angle | high angle | bird's eye | Dutch angle

Lighting parameters:
- Direction: camera-left | camera-right | above | below | behind (rim)
- Contrast: low-key (shadows) | high-key (bright, flat)
- Temperature: warm amber | cool blue | neutral white
- Shadows: hard-edged | soft wrap | absent

Style tokens (max 2-3): anamorphic | film grain | digital clean | muted | neon-saturated | warm/cold contrast

FORBIDDEN words (degrade quality): cinematic, epic, masterpiece, ultra-real, award-winning, stunning, 8K, beautiful, breathtaking, immersive, ethereal, magical
Use measurable descriptions instead:
- WRONG: "cinematic lighting" → RIGHT: "45-degree hard key camera-left, warm amber, deep shadow"
- WRONG: "epic scale" → RIGHT: "wide shot, subject occupies 10% of frame, mountain backdrop"

Good for: product reveals, lifestyle B-roll, mood pieces, architecture, social proof moments`;
  readonly capabilities: ToolCapability[] = [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 10,
      estimatedLatencyMs: 180_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ];

  private get apiKey(): string | undefined {
    return process.env.SEEDANCE_API_KEY;
  }

  private get apiBase(): string {
    const base = process.env.SEEDANCE_API_BASE ?? SEEDANCE_API;
    if (!isPublicUrl(base)) {
      log.warn({ base }, 'Blocked non-public SEEDANCE_API_BASE');
      return SEEDANCE_API;
    }
    return base;
  }

  private get model(): string {
    return process.env.SEEDANCE_MODEL ?? 'seedance-1.0';
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) return { available: false, reason: 'SEEDANCE_API_KEY not set' };
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'SEEDANCE_API_KEY not set' };
    }

    const prompt = request.prompt ?? 'abstract cinematic background';
    const duration = Math.min(request.durationSeconds ?? 5, 10);
    const aspectRatio = request.aspectRatio === '16:9' ? '16:9'
      : request.aspectRatio === '1:1' ? '1:1'
        : '9:16';

    try {
      const res = await fetch(`${this.apiBase}/v1/videos/text2video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          duration,
          aspect_ratio: aspectRatio,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const errBody = await res.text();
        log.warn({ status: res.status, errorPreview: errBody.substring(0, 200) }, 'Seedance generate failed');
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `Seedance API error (${res.status})` };
      }

      const data = (await res.json()) as { data?: { task_id?: string }; message?: string };

      if (!data.data?.task_id) {
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: data.message ?? 'No task_id returned' };
      }

      log.info({ taskId: data.data.task_id }, 'Seedance video generation started');

      return {
        jobId: data.data.task_id,
        toolId: this.id,
        status: 'processing',
      };
    } catch (err) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `Seedance request failed: ${err instanceof Error ? err.message : 'unknown'}` };
    }
  }

  async poll(jobId: string): Promise<AssetGenerationStatus> {
    if (!this.apiKey) {
      return { jobId, toolId: this.id, status: 'failed', error: 'SEEDANCE_API_KEY not set' };
    }

    if (!jobId || jobId.length > 256 || !/^[a-zA-Z0-9\-_]+$/.test(jobId)) {
      return { jobId, toolId: this.id, status: 'failed', error: 'Invalid jobId format' };
    }

    try {
      const res = await fetch(`${this.apiBase}/v1/videos/text2video/${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        return { jobId, toolId: this.id, status: 'processing' };
      }

      const data = (await res.json()) as {
        data?: {
          task_status: string;
          task_result?: { videos?: Array<{ url: string; duration?: number }> };
          error_msg?: string;
        };
      };

      const task = data.data;
      if (!task) return { jobId, toolId: this.id, status: 'processing' };

      if (task.task_status === 'succeed' || task.task_status === 'completed') {
        const videoUrl = task.task_result?.videos?.[0]?.url;
        if (videoUrl) {
          return {
            jobId,
            toolId: this.id,
            status: 'completed',
            url: videoUrl,
            durationSeconds: task.task_result?.videos?.[0]?.duration,
          };
        }
        return { jobId, toolId: this.id, status: 'failed', error: 'No video URL in result' };
      }

      if (task.task_status === 'failed') {
        return { jobId, toolId: this.id, status: 'failed', error: task.error_msg ?? 'Seedance generation failed' };
      }

      return { jobId, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ jobId, err }, 'Seedance poll error');
      return { jobId, toolId: this.id, status: 'processing' };
    }
  }
}
