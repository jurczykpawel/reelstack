import { randomUUID } from 'node:crypto';
import type { ProductionTool } from '../registry/tool-interface';
import type { ToolCapability, AssetGenerationRequest, AssetGenerationJob, AssetGenerationStatus } from '../types';
import { createLogger } from '@reelstack/logger';

const log = createLogger('piapi-tool');

const PIAPI_BASE = 'https://api.piapi.ai/api/v1';

const JOB_ID_RE = /^[a-zA-Z0-9\-_.~:]+$/;

function validateJobId(jobId: string): boolean {
  return jobId.length > 0 && jobId.length <= 256 && JOB_ID_RE.test(jobId);
}

interface PiapiModelConfig {
  id: string;
  name: string;
  model: string;
  task_type: 'txt2video' | 'txt2img' | 'imagine' | 'video_generation';
  capabilities: ToolCapability[];
  promptGuidelines?: string;
  buildInput(req: AssetGenerationRequest): Record<string, unknown>;
  parseOutput(data: PiapiTaskData): string | undefined;
}

interface PiapiTaskData {
  status?: string;
  output?: {
    // Image models
    image_url?: string;
    image_urls?: string[];
    // Video models (simple)
    video_url?: string;
    // Kling output format
    works?: Array<{ resource?: { resource?: string } }>;
    // Hailuo output format
    video?: { url?: string };
  };
  error?: { message?: string };
}

class PiapiTool implements ProductionTool {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ToolCapability[];
  readonly promptGuidelines?: string;

  private readonly model: string;
  private readonly task_type: 'txt2video' | 'txt2img' | 'imagine' | 'video_generation';
  private readonly buildInput: (req: AssetGenerationRequest) => Record<string, unknown>;
  private readonly parseOutput: (data: PiapiTaskData) => string | undefined;

  constructor(config: PiapiModelConfig) {
    this.id = config.id;
    this.name = config.name;
    this.model = config.model;
    this.task_type = config.task_type;
    this.capabilities = config.capabilities;
    this.promptGuidelines = config.promptGuidelines;
    this.buildInput = config.buildInput;
    this.parseOutput = config.parseOutput;
  }

  private get apiKey(): string | undefined {
    return process.env.PIAPI_KEY;
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) return { available: false, reason: 'PIAPI_KEY not set' };
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'PIAPI_KEY not set' };
    }

    try {
      const res = await fetch(`${PIAPI_BASE}/task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify({
          model: this.model,
          task_type: this.task_type,
          input: this.buildInput(request),
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const errBody = await res.text();
        log.warn({ toolId: this.id, status: res.status, errorPreview: errBody.substring(0, 200) }, 'piapi generate failed');
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `piapi API error (${res.status})` };
      }

      const data = (await res.json()) as { code?: number; data?: { task_id?: string } };

      if (!data.data?.task_id) {
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'No task_id returned' };
      }

      log.info({ toolId: this.id, taskId: data.data.task_id }, 'piapi generation started');

      return { jobId: data.data.task_id, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ toolId: this.id, err }, 'piapi generate error');
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `piapi request failed: ${err instanceof Error ? err.message : 'unknown'}` };
    }
  }

  async poll(jobId: string): Promise<AssetGenerationStatus> {
    if (!this.apiKey) {
      return { jobId, toolId: this.id, status: 'failed', error: 'PIAPI_KEY not set' };
    }

    if (!validateJobId(jobId)) {
      return { jobId, toolId: this.id, status: 'failed', error: 'Invalid jobId format' };
    }

    try {
      const res = await fetch(`${PIAPI_BASE}/task/${encodeURIComponent(jobId)}`, {
        headers: { 'X-API-Key': this.apiKey },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        log.warn({ toolId: this.id, jobId, status: res.status }, 'piapi poll failed');
        return { jobId, toolId: this.id, status: 'processing' };
      }

      const body = (await res.json()) as { data?: PiapiTaskData };
      const taskData = body.data;

      if (!taskData) return { jobId, toolId: this.id, status: 'processing' };

      if (taskData.status === 'failed') {
        return { jobId, toolId: this.id, status: 'failed', error: taskData.error?.message ?? 'piapi generation failed' };
      }

      if (taskData.status === 'completed') {
        const url = this.parseOutput(taskData);
        if (!url) {
          return { jobId, toolId: this.id, status: 'failed', error: 'No URL in piapi result' };
        }
        return { jobId, toolId: this.id, status: 'completed', url };
      }

      return { jobId, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ toolId: this.id, jobId, err }, 'piapi poll error');
      return { jobId, toolId: this.id, status: 'processing' };
    }
  }
}

// ── Exported instances ────────────────────────────────────────

export const piapiKlingTool: ProductionTool = new PiapiTool({
  id: 'kling-piapi',
  name: 'Kling via piapi.ai',
  model: 'kling',
  task_type: 'video_generation',
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
    negative_prompt: 'blurry, low quality',
    duration: req.durationSeconds ?? 5,
    aspect_ratio: req.aspectRatio ?? '9:16',
    mode: 'std',
  }),
  // Kling returns works[].resource.resource
  parseOutput: (data) => data.output?.works?.[0]?.resource?.resource ?? data.output?.video_url,
});

// Seedance model name on piapi is not publicly documented — placeholder with best-guess.
// Will be retried with correct name once piapi confirms.
export const piapiSeedanceTool: ProductionTool = new PiapiTool({
  id: 'seedance-piapi',
  name: 'Seedance via piapi.ai',
  model: 'Qubico/seedance-video',
  task_type: 'txt2video',
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
    duration: req.durationSeconds ?? 5,
    aspect_ratio: req.aspectRatio ?? '9:16',
    resolution: '480p',
  }),
  parseOutput: (data) => data.output?.video_url,
});

export const piapiHailuoTool: ProductionTool = new PiapiTool({
  id: 'hailuo-piapi',
  name: 'MiniMax Hailuo via piapi.ai',
  model: 'hailuo',
  task_type: 'txt2video',
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 6,
      estimatedLatencyMs: 90_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => ({
    model_name: 't2v-01',
    prompt: req.prompt ?? 'abstract cinematic background',
  }),
  parseOutput: (data) => data.output?.video?.url ?? data.output?.video_url,
});

export const piapiFluxTool: ProductionTool = new PiapiTool({
  id: 'flux-piapi',
  name: 'FLUX Schnell via piapi.ai',
  model: 'Qubico/flux1-schnell',
  task_type: 'txt2img',
  capabilities: [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 10_000,
      isAsync: true,
      costTier: 'cheap',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract background',
    width: req.aspectRatio === '16:9' ? 1280 : req.aspectRatio === '1:1' ? 1024 : 720,
    height: req.aspectRatio === '16:9' ? 720 : req.aspectRatio === '1:1' ? 1024 : 1280,
  }),
  parseOutput: (data) => data.output?.image_url ?? data.output?.image_urls?.[0],
});

export const piapiSeedance2Tool: ProductionTool = new PiapiTool({
  id: 'seedance2-piapi',
  name: 'Seedance 2.0 via piapi.ai',
  model: 'Qubico/seedance-video-2',
  task_type: 'txt2video',
  promptGuidelines: `Seedance 2.0: cinematic multi-shot video, ultra-realistic, supports 720p/1080p.
Subject + Action first. Supports camera movement hints and multi-shot descriptions.
Better than Seedance 1.x for complex scenes and character consistency.`,
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
    duration: req.durationSeconds ?? 5,
    aspect_ratio: req.aspectRatio ?? '9:16',
    resolution: '720p',
  }),
  parseOutput: (data) => data.output?.video_url,
});

export const piapiHunyuanTool: ProductionTool = new PiapiTool({
  id: 'hunyuan-piapi',
  name: 'Hunyuan Video via piapi.ai',
  model: 'Qubico/hunyuan',
  task_type: 'txt2video',
  promptGuidelines: `Hunyuan Video (Tencent): excellent cinematic quality, strong motion realism.
Natural language prompts work well. Good for: people, urban scenes, product videos.
Keep prompts descriptive but not too long — 50-100 words optimal.`,
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 5,
      estimatedLatencyMs: 120_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract cinematic background',
    aspect_ratio: req.aspectRatio ?? '9:16',
  }),
  parseOutput: (data) => data.output?.video_url,
});

// Midjourney: discontinued on piapi.ai as of 2026.
// Ideogram v3: not available on piapi.ai — use replicate or direct API.
