import { randomUUID } from 'node:crypto';
import type { ProductionTool } from '../registry/tool-interface';
import type { ToolCapability, AssetGenerationRequest, AssetGenerationJob, AssetGenerationStatus } from '../types';
import { createLogger } from '@reelstack/logger';

const log = createLogger('kie-tool');

const KIE_BASE = 'https://kieai.erweima.ai/api/v1';

const JOB_ID_RE = /^[a-zA-Z0-9\-_.~:]+$/;

function validateJobId(jobId: string): boolean {
  return jobId.length > 0 && jobId.length <= 256 && JOB_ID_RE.test(jobId);
}

interface KieTaskOutput {
  video_url?: string;
  image_url?: string;
}

interface KieTaskData {
  status?: string;
  output?: KieTaskOutput;
  error?: string;
}

interface KieModelConfig {
  id: string;
  name: string;
  model: string;
  task_type: 'txt2video' | 'txt2img';
  capabilities: ToolCapability[];
  promptGuidelines?: string;
  buildInput(req: AssetGenerationRequest): Record<string, unknown>;
  parseOutput(data: KieTaskData): string | undefined;
}

class KieTool implements ProductionTool {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ToolCapability[];
  readonly promptGuidelines?: string;

  private readonly model: string;
  private readonly task_type: 'txt2video' | 'txt2img';
  private readonly buildInput: (req: AssetGenerationRequest) => Record<string, unknown>;
  private readonly parseOutput: (data: KieTaskData) => string | undefined;

  constructor(config: KieModelConfig) {
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
    return process.env.KIE_API_KEY;
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) return { available: false, reason: 'KIE_API_KEY not set' };
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'KIE_API_KEY not set' };
    }

    try {
      const res = await fetch(`${KIE_BASE}/task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
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
        log.warn({ toolId: this.id, status: res.status, errorPreview: errBody.substring(0, 200) }, 'kie generate failed');
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `kie.ai API error (${res.status})` };
      }

      const data = (await res.json()) as { code?: number; data?: { task_id?: string } };

      if (!data.data?.task_id) {
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'No task_id returned' };
      }

      log.info({ toolId: this.id, taskId: data.data.task_id }, 'kie generation started');

      return { jobId: data.data.task_id, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ toolId: this.id, err }, 'kie generate error');
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `kie.ai request failed: ${err instanceof Error ? err.message : 'unknown'}` };
    }
  }

  async poll(jobId: string): Promise<AssetGenerationStatus> {
    if (!this.apiKey) {
      return { jobId, toolId: this.id, status: 'failed', error: 'KIE_API_KEY not set' };
    }

    if (!validateJobId(jobId)) {
      return { jobId, toolId: this.id, status: 'failed', error: 'Invalid jobId format' };
    }

    try {
      const res = await fetch(`${KIE_BASE}/task/${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        log.warn({ toolId: this.id, jobId, status: res.status }, 'kie poll failed');
        return { jobId, toolId: this.id, status: 'processing' };
      }

      const body = (await res.json()) as { data?: KieTaskData };
      const taskData = body.data;

      if (!taskData) return { jobId, toolId: this.id, status: 'processing' };

      if (taskData.status === 'failed') {
        return { jobId, toolId: this.id, status: 'failed', error: taskData.error ?? 'kie.ai generation failed' };
      }

      if (taskData.status === 'completed') {
        const url = this.parseOutput(taskData);
        if (!url) {
          return { jobId, toolId: this.id, status: 'failed', error: 'No URL in kie.ai result' };
        }
        return { jobId, toolId: this.id, status: 'completed', url };
      }

      return { jobId, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ toolId: this.id, jobId, err }, 'kie poll error');
      return { jobId, toolId: this.id, status: 'processing' };
    }
  }
}

// ── Exported instances ────────────────────────────────────────

export const kieKlingTool: ProductionTool = new KieTool({
  id: 'kling-kie',
  name: 'Kling via kie.ai',
  model: 'kling-video',
  task_type: 'txt2video',
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
    version: '2.1',
    mode: 'std',
  }),
  parseOutput: (data) => data.output?.video_url,
});

export const kieWanTool: ProductionTool = new KieTool({
  id: 'wan-kie',
  name: 'WAN 2.1 via kie.ai',
  model: 'wan-2.1',
  task_type: 'txt2video',
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
    duration: req.durationSeconds ?? 5,
    aspect_ratio: req.aspectRatio ?? '9:16',
    resolution: '480p',
  }),
  parseOutput: (data) => data.output?.video_url,
});

export const kieFluxTool: ProductionTool = new KieTool({
  id: 'flux-kie',
  name: 'FLUX Schnell via kie.ai',
  model: 'flux-schnell',
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
    aspect_ratio: req.aspectRatio ?? '9:16',
    steps: 4,
  }),
  parseOutput: (data) => data.output?.image_url,
});

export const kieNanaBanana2Tool: ProductionTool = new KieTool({
  id: 'nanobanana2-kie',
  name: 'NanoBanana 2 via kie.ai',
  model: 'nano-banana-2',
  task_type: 'txt2img',
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
    aspect_ratio: req.aspectRatio ?? '9:16',
  }),
  parseOutput: (data) => data.output?.image_url,
});
