import { randomUUID } from 'node:crypto';
import type { ProductionTool } from '../registry/tool-interface';
import type {
  ToolCapability,
  AssetGenerationRequest,
  AssetGenerationJob,
  AssetGenerationStatus,
} from '../types';
import { createLogger } from '@reelstack/logger';
import { addCost } from '../context';
import { calculateToolCost } from '../config/pricing';
import { HEYGEN_GUIDELINES } from './prompt-guidelines';

const log = createLogger('heygen-tool');

const HEYGEN_API = 'https://api.heygen.com';

/**
 * HeyGen avatar video generation tool.
 *
 * Supports two quality tiers via the same /v2/video/generate endpoint:
 * - standard: Engine III (1 credit/min)
 * - premium:  Avatar IV with realistic movements (6 credits/min)
 *
 * Avatar IV adds motion prompts (gesture descriptions) and higher quality
 * face/body animation. Premium tier is toggled by request.avatarQuality.
 */
export class HeyGenTool implements ProductionTool {
  readonly id = 'heygen';
  readonly name = 'HeyGen Avatar';
  readonly promptGuidelines = HEYGEN_GUIDELINES;
  readonly capabilities: ToolCapability[] = [
    {
      assetType: 'avatar-video',
      supportsPrompt: false,
      supportsScript: true,
      maxDurationSeconds: 300,
      estimatedLatencyMs: 120_000,
      isAsync: true,
      costTier: 'expensive',
    },
  ];

  private get apiKey(): string | undefined {
    return process.env.HEYGEN_API_KEY;
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) return { available: false, reason: 'HEYGEN_API_KEY not set' };

    try {
      const res = await fetch(`${HEYGEN_API}/v2/user/remaining_quota`, {
        headers: { 'x-api-key': this.apiKey },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        return { available: false, reason: `HeyGen API returned ${res.status}` };
      }

      const data = (await res.json()) as { data?: { remaining_quota?: number } };
      const quota = data.data?.remaining_quota;

      if (quota !== undefined && quota <= 0) {
        return { available: false, reason: 'HeyGen quota exhausted' };
      }

      return { available: true };
    } catch (err) {
      return { available: false, reason: `HeyGen unreachable: ${err}` };
    }
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey) {
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: 'HEYGEN_API_KEY not set',
      };
    }

    if (!request.script) {
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: 'Script is required for avatar generation',
      };
    }

    const avatarId =
      request.avatarId ?? process.env.HEYGEN_AVATAR_ID ?? 'Abigail_expressive_2024112501';
    const voiceId =
      request.voice ?? process.env.HEYGEN_VOICE_ID ?? '0cbf3f0556f74c84abdf598a297ae810';
    const isPremium = request.avatarQuality === 'premium';

    const dimension =
      request.aspectRatio === '16:9'
        ? { width: 1920, height: 1080 }
        : request.aspectRatio === '1:1'
          ? { width: 1080, height: 1080 }
          : { width: 1080, height: 1920 };

    // Build voice config with optional emotion/speed
    const voice: Record<string, unknown> = {
      type: 'text',
      voice_id: voiceId,
      input_text: request.script,
    };
    if (request.voiceEmotion) voice.emotion = request.voiceEmotion;
    if (request.voiceSpeed != null) voice.speed = request.voiceSpeed;

    // Build character config — Avatar IV uses flag on same endpoint
    const character: Record<string, unknown> = {
      type: 'avatar',
      avatar_id: avatarId,
      avatar_style: 'normal',
    };
    if (isPremium) {
      character.use_avatar_iv_model = true;
      if (request.motionPrompt) {
        character.prompt = request.motionPrompt;
        character.keep_original_prompt = false;
      }
    }

    const body: Record<string, unknown> = {
      video_inputs: [{ character, voice, background: { type: 'color', value: '#000000' } }],
      dimension,
      test: process.env.HEYGEN_TEST_MODE === 'true',
    };

    try {
      const res = await fetch(`${HEYGEN_API}/v2/video/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const errBody = await res.text();
        log.warn(
          { status: res.status, errorPreview: errBody.substring(0, 300) },
          'HeyGen generate failed'
        );
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: `HeyGen API error (${res.status}): ${errBody.substring(0, 200)}`,
        };
      }

      const data = (await res.json()) as { data?: { video_id?: string }; error?: string };

      if (!data.data?.video_id) {
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: data.error ?? 'No video_id returned',
        };
      }

      log.info(
        { videoId: data.data.video_id, isPremium, avatarId },
        'HeyGen video generation started'
      );

      return { jobId: data.data.video_id, toolId: this.id, status: 'processing' };
    } catch (err) {
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: `HeyGen request failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  async poll(jobId: string): Promise<AssetGenerationStatus> {
    if (!this.apiKey) {
      return { jobId, toolId: this.id, status: 'failed', error: 'HEYGEN_API_KEY not set' };
    }

    if (!jobId || jobId.length > 256 || !/^[a-zA-Z0-9\-_]+$/.test(jobId)) {
      return { jobId, toolId: this.id, status: 'failed', error: 'Invalid jobId format' };
    }

    try {
      const res = await fetch(`${HEYGEN_API}/v2/videos/${encodeURIComponent(jobId)}`, {
        headers: { 'x-api-key': this.apiKey },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        return { jobId, toolId: this.id, status: 'processing' };
      }

      const data = (await res.json()) as {
        data?: {
          status?: string;
          video_url?: string;
          duration?: number;
          error?: string;
        };
      };

      const status = data.data?.status;

      if (status === 'completed') {
        addCost({
          step: `asset:${this.id}`,
          provider: 'heygen',
          type: 'video',
          costUSD: calculateToolCost(this.id, data.data?.duration ?? 5),
          inputUnits: 1,
        });
        return {
          jobId,
          toolId: this.id,
          status: 'completed',
          url: data.data!.video_url,
          durationSeconds: data.data!.duration,
        };
      }

      if (status === 'failed') {
        return {
          jobId,
          toolId: this.id,
          status: 'failed',
          error: data.data?.error ?? 'HeyGen video generation failed',
        };
      }

      return { jobId, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ jobId, err }, 'HeyGen poll error');
      return { jobId, toolId: this.id, status: 'processing' };
    }
  }
}
