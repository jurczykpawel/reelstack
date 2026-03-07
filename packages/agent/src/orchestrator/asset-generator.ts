import type { ProductionPlan, ShotPlan, AssetGenerationJob, GeneratedAsset } from '../types';
import type { ToolRegistry } from '../registry/tool-registry';
import { pollUntilDone } from '../polling';
import { GenerationError } from '../errors';
import { isPublicUrl } from '../planner/production-planner';
import { createLogger } from '@reelstack/logger';

const log = createLogger('asset-generator');

interface GenerationTask {
  readonly shotId?: string;
  readonly toolId: string;
  readonly request: {
    purpose: string;
    prompt?: string;
    script?: string;
    voice?: string;
    avatarId?: string;
    durationSeconds?: number;
    aspectRatio?: '9:16' | '16:9' | '1:1';
    searchQuery?: string;
  };
}

/**
 * Generates all assets needed by a production plan in parallel.
 * Returns generated assets mapped to their shot IDs.
 */
export async function generateAssets(
  plan: ProductionPlan,
  registry: ToolRegistry,
  onProgress?: (msg: string) => void,
): Promise<GeneratedAsset[]> {
  const tasks = collectTasks(plan);

  if (tasks.length === 0) {
    log.info('No assets to generate');
    return [];
  }

  onProgress?.(`Generating ${tasks.length} asset(s)...`);

  // Limit concurrency to avoid rate limiting and resource exhaustion
  const MAX_CONCURRENT = 5;
  const results: PromiseSettledResult<GeneratedAsset | null>[] = [];

  for (let i = 0; i < tasks.length; i += MAX_CONCURRENT) {
    const batch = tasks.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.allSettled(
      batch.map((task) => generateSingle(task, registry)),
    );
    results.push(...batchResults);
  }

  const assets: GeneratedAsset[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const task = tasks[i];
    if (result.status === 'fulfilled' && result.value) {
      assets.push(result.value);
      onProgress?.(`Asset ready: ${task.toolId} for ${task.shotId ?? 'primary'}`);
    } else if (result.status === 'rejected') {
      log.warn({ task, err: result.reason }, 'Asset generation failed');
      onProgress?.(`Asset failed: ${task.toolId} for ${task.shotId ?? 'primary'} - ${result.reason}`);
    }
  }

  return assets;
}

function collectTasks(plan: ProductionPlan): GenerationTask[] {
  const tasks: GenerationTask[] = [];

  // Primary source generation (avatar or AI video)
  if (plan.primarySource.type === 'avatar') {
    tasks.push({
      toolId: plan.primarySource.toolId,
      request: {
        purpose: 'Primary talking head avatar',
        script: plan.primarySource.script,
        voice: plan.primarySource.voice,
        avatarId: plan.primarySource.avatarId,
        aspectRatio: '9:16',
      },
    });
  } else if (plan.primarySource.type === 'ai-video') {
    tasks.push({
      toolId: plan.primarySource.toolId,
      request: {
        purpose: 'Primary AI video',
        prompt: plan.primarySource.prompt,
        aspectRatio: '9:16',
      },
    });
  }

  // Shot-level assets
  for (const shot of plan.shots) {
    const task = shotToTask(shot);
    if (task) tasks.push(task);
  }

  return tasks;
}

function shotToTask(shot: ShotPlan): GenerationTask | null {
  switch (shot.visual.type) {
    case 'b-roll':
      return {
        shotId: shot.id,
        toolId: shot.visual.toolId,
        request: {
          purpose: `B-roll: ${shot.reason}`,
          searchQuery: shot.visual.searchQuery,
          durationSeconds: shot.endTime - shot.startTime,
        },
      };
    case 'ai-video':
      return {
        shotId: shot.id,
        toolId: shot.visual.toolId,
        request: {
          purpose: `AI video: ${shot.reason}`,
          prompt: shot.visual.prompt,
          durationSeconds: shot.endTime - shot.startTime,
          aspectRatio: '9:16',
        },
      };
    case 'ai-image':
      return {
        shotId: shot.id,
        toolId: shot.visual.toolId,
        request: {
          purpose: `AI image: ${shot.reason}`,
          prompt: shot.visual.prompt,
        },
      };
    case 'primary':
    case 'text-card':
      return null;
  }
}

async function generateSingle(
  task: GenerationTask,
  registry: ToolRegistry,
): Promise<GeneratedAsset | null> {
  const tool = registry.get(task.toolId);
  if (!tool) {
    log.warn({ toolId: task.toolId }, 'Tool not found in registry');
    return null;
  }

  log.info({ toolId: task.toolId, shotId: task.shotId }, 'Starting generation');
  const job = await tool.generate(task.request);

  if (job.status === 'failed') {
    throw new GenerationError(job.error ?? 'Generation failed', task.toolId);
  }

  // If the tool is async, poll for completion
  let finalJob: AssetGenerationJob = job;
  if (job.status === 'pending' || job.status === 'processing') {
    finalJob = await pollUntilDone(tool, job.jobId);
  }

  if (finalJob.status !== 'completed' || !finalJob.url) {
    throw new GenerationError(finalJob.error ?? 'Generation did not complete', task.toolId);
  }

  // Validate returned URL: allow public URLs and local temp file paths
  const url = finalJob.url;
  if (!url.startsWith('/') && !isPublicUrl(url)) {
    throw new GenerationError(`Tool returned invalid URL: blocked by security policy`, task.toolId);
  }

  const assetType = tool.capabilities[0]?.assetType ?? 'stock-video';

  return {
    toolId: task.toolId,
    shotId: task.shotId,
    url,
    type: assetType,
    durationSeconds: finalJob.durationSeconds,
  };
}
