import { randomUUID } from 'node:crypto';
import type { ProductionTool } from '../registry/tool-interface';
import type { ToolCapability, AssetGenerationRequest, AssetGenerationJob, AssetGenerationStatus } from '../types';
import { createLogger } from '@reelstack/logger';

const log = createLogger('fal-tool');

const FAL_QUEUE_BASE = 'https://queue.fal.run';

const JOB_ID_RE = /^[a-zA-Z0-9\-_.~:]+$/;

function validateJobId(jobId: string): boolean {
  return jobId.length > 0 && jobId.length <= 256 && JOB_ID_RE.test(jobId);
}

interface FalModelConfig {
  id: string;
  name: string;
  modelId: string;
  capabilities: ToolCapability[];
  promptGuidelines?: string;
  buildInput(req: AssetGenerationRequest): Record<string, unknown>;
  parseOutput(result: unknown): { url?: string; durationSeconds?: number };
}

class FalTool implements ProductionTool {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ToolCapability[];
  readonly promptGuidelines?: string;

  private readonly modelId: string;
  private readonly buildInput: (req: AssetGenerationRequest) => Record<string, unknown>;
  private readonly parseOutput: (result: unknown) => { url?: string; durationSeconds?: number };

  constructor(config: FalModelConfig) {
    this.id = config.id;
    this.name = config.name;
    this.modelId = config.modelId;
    this.capabilities = config.capabilities;
    this.promptGuidelines = config.promptGuidelines;
    this.buildInput = config.buildInput;
    this.parseOutput = config.parseOutput;
  }

  private get apiKey(): string | undefined {
    return process.env.FAL_KEY;
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) return { available: false, reason: 'FAL_KEY not set' };
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'FAL_KEY not set' };
    }

    try {
      const res = await fetch(`${FAL_QUEUE_BASE}/${this.modelId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${this.apiKey}`,
        },
        body: JSON.stringify(this.buildInput(request)),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const errBody = await res.text();
        log.warn({ toolId: this.id, status: res.status, errorPreview: errBody.substring(0, 200) }, 'fal generate failed');
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `fal API error (${res.status})` };
      }

      const data = (await res.json()) as { request_id?: string };

      if (!data.request_id) {
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'No request_id returned' };
      }

      log.info({ toolId: this.id, requestId: data.request_id }, 'fal generation started');

      return { jobId: data.request_id, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ toolId: this.id, err }, 'fal generate error');
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `fal request failed: ${err instanceof Error ? err.message : 'unknown'}` };
    }
  }

  async poll(jobId: string): Promise<AssetGenerationStatus> {
    if (!this.apiKey) {
      return { jobId, toolId: this.id, status: 'failed', error: 'FAL_KEY not set' };
    }

    if (!validateJobId(jobId)) {
      return { jobId, toolId: this.id, status: 'failed', error: 'Invalid jobId format' };
    }

    try {
      const statusRes = await fetch(`${FAL_QUEUE_BASE}/${this.modelId}/requests/${encodeURIComponent(jobId)}/status`, {
        headers: { Authorization: `Key ${this.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!statusRes.ok) {
        log.warn({ toolId: this.id, jobId, status: statusRes.status }, 'fal status check failed');
        return { jobId, toolId: this.id, status: 'processing' };
      }

      const statusData = (await statusRes.json()) as { status?: string; error?: { msg?: string } };

      if (statusData.status === 'FAILED') {
        return { jobId, toolId: this.id, status: 'failed', error: statusData.error?.msg ?? 'fal generation failed' };
      }

      if (statusData.status !== 'COMPLETED') {
        return { jobId, toolId: this.id, status: 'processing' };
      }

      // Fetch result
      const resultRes = await fetch(`${FAL_QUEUE_BASE}/${this.modelId}/requests/${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Key ${this.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!resultRes.ok) {
        log.warn({ toolId: this.id, jobId, status: resultRes.status }, 'fal result fetch failed');
        return { jobId, toolId: this.id, status: 'failed', error: `fal result error (${resultRes.status})` };
      }

      const result = await resultRes.json();
      const parsed = this.parseOutput(result);

      if (!parsed.url) {
        return { jobId, toolId: this.id, status: 'failed', error: 'No URL in fal result' };
      }

      return { jobId, toolId: this.id, status: 'completed', url: parsed.url, durationSeconds: parsed.durationSeconds };
    } catch (err) {
      log.warn({ toolId: this.id, jobId, err }, 'fal poll error');
      return { jobId, toolId: this.id, status: 'processing' };
    }
  }
}

// ── Exported instances ────────────────────────────────────────

export const falKlingTool: ProductionTool = new FalTool({
  id: 'kling-fal',
  name: 'Kling via fal.ai',
  modelId: 'fal-ai/kling-video/v2.1/text-to-video/master',
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 10,
      estimatedLatencyMs: 180_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract cinematic background',
    duration: req.durationSeconds != null ? Math.min(Math.max(5, req.durationSeconds), 10) : 5,
    aspect_ratio: req.aspectRatio ?? '9:16',
    mode: 'std',
  }),
  parseOutput: (result: unknown) => {
    const r = result as { video?: { url?: string; duration?: number } };
    return { url: r.video?.url, durationSeconds: r.video?.duration };
  },
});

export const falSeedanceTool: ProductionTool = new FalTool({
  id: 'seedance-fal',
  name: 'Seedance via fal.ai',
  modelId: 'fal-ai/seedance-1-pro',
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 10,
      estimatedLatencyMs: 120_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract cinematic background',
    duration_seconds: req.durationSeconds ?? 5,
    aspect_ratio: req.aspectRatio ?? '9:16',
  }),
  parseOutput: (result: unknown) => {
    const r = result as { video?: { url?: string } };
    return { url: r.video?.url };
  },
});

export const falHailuoTool: ProductionTool = new FalTool({
  id: 'hailuo-fal',
  name: 'MiniMax Hailuo via fal.ai',
  modelId: 'fal-ai/minimax/video-01-live',
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 6,
      estimatedLatencyMs: 120_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract cinematic background',
  }),
  parseOutput: (result: unknown) => {
    const r = result as { video?: { url?: string } };
    return { url: r.video?.url };
  },
});

export const falWanTool: ProductionTool = new FalTool({
  id: 'wan-fal',
  name: 'WAN 2.1 via fal.ai',
  modelId: 'fal-ai/wan-t2v-1.3b',
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 5,
      estimatedLatencyMs: 90_000,
      isAsync: true,
      costTier: 'cheap',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract cinematic background',
    num_frames: Math.round((req.durationSeconds ?? 5) * 16),
    resolution: '480p',
  }),
  parseOutput: (result: unknown) => {
    const r = result as { video?: { url?: string } };
    return { url: r.video?.url };
  },
});

export const falFluxTool: ProductionTool = new FalTool({
  id: 'flux-fal',
  name: 'FLUX Schnell via fal.ai',
  modelId: 'fal-ai/flux/schnell',
  capabilities: [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 8_000,
      isAsync: true,
      costTier: 'cheap',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract background',
    image_size: req.aspectRatio === '16:9' ? 'landscape_16_9' : req.aspectRatio === '1:1' ? 'square' : 'portrait_16_9',
    num_inference_steps: 4,
  }),
  parseOutput: (result: unknown) => {
    const r = result as { images?: Array<{ url?: string }> };
    return { url: r.images?.[0]?.url };
  },
});

export const falImagen4Tool: ProductionTool = new FalTool({
  id: 'imagen4-fal',
  name: 'Google Imagen 4 via fal.ai',
  modelId: 'fal-ai/imagen4/preview',
  capabilities: [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 15_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract background',
    aspect_ratio: req.aspectRatio ?? '9:16',
    safety_filter_level: 'block_only_high',
  }),
  parseOutput: (result: unknown) => {
    const r = result as { images?: Array<{ url?: string }> };
    return { url: r.images?.[0]?.url };
  },
});

const falImageOutput = (result: unknown) => {
  const r = result as { images?: Array<{ url?: string }> };
  return { url: r.images?.[0]?.url };
};

const falImageSize = (aspectRatio: string | undefined) =>
  aspectRatio === '16:9' ? 'landscape_16_9' : aspectRatio === '1:1' ? 'square' : 'portrait_16_9';

export const falNanaBanana2Tool: ProductionTool = new FalTool({
  id: 'nanobanana2-fal',
  name: 'NanoBanana 2 via fal.ai',
  modelId: 'fal-ai/nano-banana-2',
  promptGuidelines: `NanoBanana 2 (Gemini Flash image): fast, cheap, great for B-roll stills and backgrounds.
Use structured prompts: Scene + Subject + Lighting + Camera. Keep under 100 words.
Negative prompt suffix always: "blurry, distorted, text, watermark, low quality".`,
  capabilities: [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 6_000,
      isAsync: true,
      costTier: 'cheap',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract background',
    image_size: falImageSize(req.aspectRatio),
  }),
  parseOutput: falImageOutput,
});

export const falIdeogramTool: ProductionTool = new FalTool({
  id: 'ideogram-fal',
  name: 'Ideogram v3 via fal.ai',
  modelId: 'fal-ai/ideogram/v3',
  promptGuidelines: `Ideogram v3: best model for images WITH TEXT (titles, captions, labels in frame).
Include quoted text exactly as it should appear: 'A neon sign reading "SALE 50% OFF"'.
For pure visuals without text, prefer FLUX or NanoBanana instead.
Aspect ratio support: 9:16, 16:9, 1:1. rendering_speed: TURBO (fast) or QUALITY (better).`,
  capabilities: [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 12_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract background',
    aspect_ratio: req.aspectRatio ?? '9:16',
    rendering_speed: 'TURBO',
  }),
  parseOutput: falImageOutput,
});

export const falRecraftTool: ProductionTool = new FalTool({
  id: 'recraft-fal',
  name: 'Recraft v3 via fal.ai',
  modelId: 'fal-ai/recraft-v3',
  promptGuidelines: `Recraft v3: best for design-style images, illustrations, icons, UI mockups, vector-like artwork.
Style options via prompt suffix: "realistic_image" | "digital_illustration" | "vector_illustration" | "icon".
Good for: infographic elements, product mockups, flat design, brand imagery.
Avoid for: photorealistic scenes (use FLUX or Imagen4 instead).`,
  capabilities: [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 15_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract background',
    image_size: falImageSize(req.aspectRatio),
    style: 'realistic_image',
  }),
  parseOutput: falImageOutput,
});

export const falFluxProTool: ProductionTool = new FalTool({
  id: 'flux-pro-fal',
  name: 'FLUX Pro via fal.ai',
  modelId: 'fal-ai/flux-pro',
  promptGuidelines: `FLUX Pro: higher quality than FLUX Schnell, better prompt adherence, photorealistic.
Use for hero shots, key visuals, thumbnail-quality images. Budget accordingly (10x cost of Schnell).
Prompts work best with detailed scene description + lighting + camera specs.`,
  capabilities: [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 20_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract background',
    image_size: falImageSize(req.aspectRatio),
    num_inference_steps: 28,
    safety_tolerance: '5',
  }),
  parseOutput: falImageOutput,
});

export const falSd35Tool: ProductionTool = new FalTool({
  id: 'sd35-fal',
  name: 'Stable Diffusion 3.5 via fal.ai',
  modelId: 'fal-ai/stable-diffusion-v3-5-large',
  capabilities: [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 25_000,
      isAsync: true,
      costTier: 'cheap',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract background',
    negative_prompt: 'blurry, low quality, distorted, text, watermark',
    image_size: falImageSize(req.aspectRatio),
    num_inference_steps: 28,
    cfg_scale: 4.5,
  }),
  parseOutput: falImageOutput,
});

export const falNanaBananaProTool: ProductionTool = new FalTool({
  id: 'nanobanana-pro-fal',
  name: 'NanoBanana Pro via fal.ai',
  modelId: 'fal-ai/nano-banana-pro',
  promptGuidelines: `NanoBanana Pro (Gemini 3 Pro Image): highest quality Google image model.
Understands conversational prompts — no keyword stuffing needed.
Excellent for: text in images (signs, labels, Polish text), complex compositions, marketing visuals.
$0.15/image — use for hero shots, thumbnails, key visuals. Use NanoBanana 2 for bulk B-roll.`,
  capabilities: [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 20_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract background',
    image_size: falImageSize(req.aspectRatio),
  }),
  parseOutput: falImageOutput,
});

export const falSeedream45Tool: ProductionTool = new FalTool({
  id: 'seedream45-fal',
  name: 'Seedream 4.5 via fal.ai',
  modelId: 'fal-ai/bytedance/seedream/v4.5/text-to-image',
  promptGuidelines: `Seedream 4.5 (ByteDance): photorealistic images in 2-3s, up to 4MP (2048×2048), $0.04/image.
Best for: product shots, lifestyle photos, editorial imagery, social media visuals.
Prompts: natural language works well, no special syntax needed.
Supports: text-in-image (Chinese and English), photorealistic, illustration styles.`,
  capabilities: [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 5_000,
      isAsync: true,
      costTier: 'cheap',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract background',
    aspect_ratio: req.aspectRatio ?? '9:16',
  }),
  parseOutput: falImageOutput,
});

export const falFluxDevTool: ProductionTool = new FalTool({
  id: 'flux-dev-fal',
  name: 'FLUX Dev via fal.ai',
  modelId: 'fal-ai/flux/dev',
  promptGuidelines: `FLUX Dev: 12B parameter model, higher quality than Schnell (28 steps vs 4).
Better prompt adherence, more detail, photorealistic. ~2-3x slower and costlier than Schnell.
Use for: key hero images where quality > speed. Use Schnell for quick B-roll.`,
  capabilities: [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 20_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract background',
    image_size: falImageSize(req.aspectRatio),
    num_inference_steps: 28,
    guidance_scale: 3.5,
  }),
  parseOutput: falImageOutput,
});

// ── Additional video models ────────────────────────────────────

const falVideoOutput = (result: unknown) => {
  const r = result as { video?: { url?: string; duration?: number } };
  return { url: r.video?.url, durationSeconds: r.video?.duration };
};

export const falPika22Tool: ProductionTool = new FalTool({
  id: 'pika22-fal',
  name: 'Pika 2.2 via fal.ai',
  modelId: 'fal-ai/pika/v2.2/text-to-video',
  promptGuidelines: `Pika 2.2: cinematic text-to-video, up to 1080p. Great for transitions and product reveals.
Lead with action: "A coffee cup slides into frame on a marble surface".
Duration: 5s or 10s. Supports camera motion hints: "slow zoom", "pan left", "tracking shot".`,
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 10,
      estimatedLatencyMs: 120_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract cinematic background',
    duration: req.durationSeconds != null ? (req.durationSeconds <= 5 ? 5 : 10) : 5,
    aspect_ratio: req.aspectRatio ?? '9:16',
    resolution: '720p',
  }),
  parseOutput: falVideoOutput,
});

export const falLtx23Tool: ProductionTool = new FalTool({
  id: 'ltx23-fal',
  name: 'LTX-2.3 via fal.ai',
  modelId: 'fal-ai/ltx-2.3/text-to-video',
  promptGuidelines: `LTX-2.3 (Lightricks): open-source, fast, up to 4K, up to 20s, native audio support.
Good for: atmospheric B-roll, nature, abstract, motion graphics.
Negative prompt important: always include "blurry, low quality, distorted, flickering".`,
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 10,
      estimatedLatencyMs: 60_000,
      isAsync: true,
      costTier: 'cheap',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract cinematic background',
    negative_prompt: 'blurry, low quality, distorted, flickering, worst quality',
    duration: req.durationSeconds ?? 5,
    aspect_ratio: req.aspectRatio ?? '9:16',
  }),
  parseOutput: falVideoOutput,
});

export const falLumaDreamMachineTool: ProductionTool = new FalTool({
  id: 'luma-fal',
  name: 'Luma Dream Machine via fal.ai',
  modelId: 'fal-ai/luma-dream-machine',
  promptGuidelines: `Luma Dream Machine: smooth cinematic motion, great physics simulation.
Strengths: fluid motion, reflections, caustics, natural environments.
Keep prompt focused on one scene: "Ocean waves crash on rocky shore at golden hour, slow motion, handheld".
Duration: "5s" or "10s" (as string).`,
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 10,
      estimatedLatencyMs: 150_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract cinematic background',
    duration: req.durationSeconds != null ? (req.durationSeconds <= 5 ? '5s' : '10s') : '5s',
    aspect_ratio: req.aspectRatio ?? '9:16',
  }),
  parseOutput: falVideoOutput,
});
