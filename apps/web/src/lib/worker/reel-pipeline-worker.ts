import { createStorage } from '@reelstack/storage';
import {
  getReelJobInternal,
  updateReelJobStatus,
  markCallbackSent,
  resetCallbackSent,
} from '@reelstack/database';
import { createLogger } from '@reelstack/logger';
import { reelJobsTotal, reelRenderDuration } from '@/lib/metrics';
import { produce as agentProduce, produceComposition } from '@reelstack/agent';
import type { UserAsset, ComposeRequest, BrandPreset } from '@reelstack/agent';
import { readFile, unlink } from 'fs/promises';
import crypto from 'crypto';

const log = createLogger('reel-pipeline');

/**
 * Deliver webhook callback to client URL.
 * Signs payload with HMAC-SHA256 using WEBHOOK_CALLBACK_SECRET.
 * Uses atomic markCallbackSent to prevent duplicate deliveries.
 * Fire-and-forget with 5s timeout.
 */
async function deliverCallback(
  jobId: string,
  callbackUrl: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const secret = process.env.WEBHOOK_CALLBACK_SECRET;
  if (!secret) {
    log.warn({ jobId }, 'WEBHOOK_CALLBACK_SECRET not set, skipping callback');
    return;
  }

  // Atomically claim the callback slot - prevents duplicate deliveries
  const claimed = await markCallbackSent(jobId);
  if (!claimed) {
    log.info({ jobId }, 'Callback already sent, skipping');
    return;
  }

  const body = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

  try {
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ReelStack-Signature': signature,
        'X-ReelStack-Event': payload.status === 'completed' ? 'reel.completed' : 'reel.failed',
        'User-Agent': 'ReelStack-Webhook/1.0',
      },
      body,
      signal: AbortSignal.timeout(5_000),
      redirect: 'error', // Don't follow redirects (SSRF protection)
    });

    if (response.ok) {
      log.info({ jobId, callbackUrl, status: response.status }, 'Webhook delivered');
    } else {
      log.warn({ jobId, callbackUrl, status: response.status }, 'Webhook delivery failed');
      // Reset flag so a retry mechanism (cron/manual) can re-attempt
      await resetCallbackSent(jobId);
    }
  } catch (err) {
    log.warn({ jobId, callbackUrl, err }, 'Webhook delivery error');
    // Reset flag so a retry mechanism (cron/manual) can re-attempt
    await resetCallbackSent(jobId);
  }
}

function makeProgressCallback(jobId: string, progressMap: Record<string, number>) {
  return (step: string) => {
    for (const [prefix, progress] of Object.entries(progressMap)) {
      if (step.startsWith(prefix)) {
        updateReelJobStatus(jobId, { progress }).catch(err => log.warn({ jobId, err }, 'Progress update failed'));
        break;
      }
    }
  };
}

export async function processReelPipelineJob(jobId: string): Promise<void> {
  const job = await getReelJobInternal(jobId);
  if (!job) throw new Error(`Reel job ${jobId} not found`);

  await updateReelJobStatus(jobId, {
    status: 'PROCESSING',
    progress: 0,
    startedAt: new Date(),
  });

  const pipelineStart = Date.now();

  try {
    const config = (job.reelConfig as Record<string, unknown>) ?? {};
    const mode = (config.mode as string) ?? 'generate';

    let outputPath: string;

    if (mode === 'captions') {
      // ── Captions-only path ───────────────────────────────────
      log.info({ jobId, captionsMode: config.captionsMode }, 'Running captions pipeline');

      const videoUrl = config.videoUrl as string;
      const primaryAsset: UserAsset = {
        id: 'primary',
        url: videoUrl,
        type: 'video',
        description: 'Primary video to caption',
        isPrimary: true,
      };

      const composeRequest: ComposeRequest = {
        jobId,
        script: job.script ?? '',
        assets: [primaryAsset],
        style: config.style as ComposeRequest['style'],
        tts: config.tts as ComposeRequest['tts'],
        brandPreset: config.brandPreset as ComposeRequest['brandPreset'],
        existingCues: config.captionsMode === 'cues'
          ? (config.cues as ComposeRequest['existingCues'])
          : undefined,
        onProgress: makeProgressCallback(jobId, {
          'Transcribing audio...': 30,
          'Assembling composition...': 60,
          'Rendering video...': 70,
        }),
      };

      const result = await produceComposition(composeRequest);
      outputPath = result.outputPath;
      log.info({ jobId }, 'Captions pipeline complete');

    } else if (mode === 'compose') {
      // ── Compose path (user assets + LLM arrangement) ─────────
      log.info({ jobId }, 'Running compose pipeline');

      const assets = (config.assets as UserAsset[]) ?? [];

      const composeRequest: ComposeRequest = {
        jobId,
        script: job.script ?? '',
        assets,
        style: config.style as ComposeRequest['style'],
        layout: config.layout as ComposeRequest['layout'],
        tts: config.tts as ComposeRequest['tts'],
        whisper: config.whisper as ComposeRequest['whisper'],
        brandPreset: config.brandPreset as ComposeRequest['brandPreset'],
        directorNotes: config.directorNotes as string | undefined,
        onProgress: makeProgressCallback(jobId, {
          'Planning composition...': 10,
          'Generating voiceover...': 25,
          'Normalizing audio...': 35,
          'Transcribing audio...': 45,
          'Assembling composition...': 60,
          'Rendering video...': 70,
        }),
      };

      const result = await produceComposition(composeRequest);
      outputPath = result.outputPath;
      log.info({ jobId, steps: result.steps.length }, 'Compose pipeline complete');

    } else if (mode === 'ai-tips') {
      // ── ai-tips path ───────────────────────────────────────────
      log.info({ jobId }, 'Running ai-tips pipeline');

      const { produceAiTips, callLLM, createBestVideoGenerator } = await import('@reelstack/agent');

      const videoGenerator = await createBestVideoGenerator();

      const result = await produceAiTips({
        jobId,
        topic: config.topic as string,
        language: (config.language as string) ?? 'pl',
        numberOfTips: config.numberOfTips as number | undefined,
        variant: config.variant as 'multi-object' | 'single-object' | 'cutaway-demo' | undefined,
        provider: config.provider as string | undefined,
        tts: config.tts as ComposeRequest['tts'],
        whisper: config.whisper as ComposeRequest['whisper'],
        brandPreset: config.brandPreset as BrandPreset | undefined,
        llmCall: callLLM,
        videoGenerator,
        musicUrl: config.musicUrl as string | undefined,
        musicVolume: config.musicVolume as number | undefined,
        onProgress: makeProgressCallback(jobId, {
          'Generating ai-tips script...': 5,
          'Generating video clips...': 15,
          'Clip': 30,
          'Generating voiceover...': 50,
          'Transcribing audio...': 60,
          'Assembling composition...': 70,
          'Rendering video...': 80,
        }),
      });

      outputPath = result.outputPath;
      log.info({ jobId, tips: result.script.tips.length }, 'ai-tips pipeline complete');

    } else if (mode === 'presenter-explainer') {
      // ── presenter-explainer path ───────────────────────────────
      log.info({ jobId }, 'Running presenter-explainer pipeline');

      const { producePresenterExplainer, callLLM, createBestVideoGenerator } = await import('@reelstack/agent');

      const videoGenerator = await createBestVideoGenerator();

      // Board image resolver deps - use AI generation for now
      // TODO: add web search and screenshot support via tools
      const imageResolverDeps = {
        generateImage: async (prompt: string) => {
          const result = await videoGenerator.generate({
            prompt,
            duration: 1, // static image
            aspectRatio: '9:16',
          });
          return result.videoUrl; // first frame as image
        },
        searchImage: async (query: string) => {
          // Fallback to AI gen for now
          const result = await videoGenerator.generate({
            prompt: query,
            duration: 1,
            aspectRatio: '9:16',
          });
          return result.videoUrl;
        },
        takeScreenshot: async (url: string) => {
          // TODO: implement Playwright screenshot
          log.warn({ url }, 'Screenshot not yet implemented, using placeholder');
          return '';
        },
      };

      const result = await producePresenterExplainer({
        jobId,
        topic: config.topic as string,
        persona: config.persona as string | undefined,
        style: config.style as 'aggressive-funny' | 'edu-casual' | 'sarcastic-expert' | 'hype-energy' | undefined,
        language: (config.language as string) ?? 'pl',
        targetDuration: config.targetDuration as number | undefined,
        tts: config.tts as ComposeRequest['tts'],
        whisper: config.whisper as ComposeRequest['whisper'],
        brandPreset: config.brandPreset as BrandPreset | undefined,
        llmCall: callLLM,
        videoGenerator,
        imageResolverDeps,
        musicUrl: config.musicUrl as string | undefined,
        musicVolume: config.musicVolume as number | undefined,
        onProgress: makeProgressCallback(jobId, {
          'Generating presenter script...': 5,
          'Generating board images': 15,
          'Board image': 25,
          'Generating voiceover...': 40,
          'Transcribing audio...': 55,
          'Assembling composition...': 70,
          'Rendering video...': 80,
        }),
      });

      outputPath = result.outputPath;
      log.info({ jobId, sections: result.script.sections.length }, 'presenter-explainer pipeline complete');

    } else if (mode === 'n8n-explainer') {
      // ── n8n-explainer path ─────────────────────────────────────
      log.info({ jobId }, 'Running n8n-explainer pipeline');

      const { produceN8nExplainer, callLLM } = await import('@reelstack/agent');

      const result = await produceN8nExplainer({
        jobId,
        workflowUrl: config.workflowUrl as string,
        language: (config.language as string) ?? 'pl',
        tts: config.tts as ComposeRequest['tts'],
        whisper: config.whisper as ComposeRequest['whisper'],
        brandPreset: config.brandPreset as BrandPreset | undefined,
        llmCall: callLLM,
        onProgress: makeProgressCallback(jobId, {
          'Fetching n8n workflow...': 5,
          'Generating narration script...': 15,
          'Generating workflow diagrams...': 25,
          'Generating voiceover...': 35,
          'Transcribing audio...': 50,
          'Assembling composition...': 65,
          'Rendering video...': 75,
        }),
      });

      outputPath = result.outputPath;
      log.info({ jobId, sections: result.script.sections.length }, 'n8n-explainer pipeline complete');

    } else {
      // ── Full auto path (generate mode) ───────────────────────
      log.info({ jobId }, 'Running full auto pipeline');

      const agentResult = await agentProduce({
        jobId,
        script: job.script ?? '',
        layout: config.layout as 'fullscreen' | 'split-screen' | 'picture-in-picture' | undefined,
        style: config.style as 'dynamic' | 'calm' | 'cinematic' | 'educational' | undefined,
        tts: config.tts as { provider?: 'edge-tts' | 'elevenlabs' | 'openai'; voice?: string; language?: string } | undefined,
        whisper: config.whisper as { provider?: 'openrouter' | 'cloudflare' | 'ollama'; apiKey?: string } | undefined,
        brandPreset: config.brandPreset as BrandPreset | undefined,
        avatar: config.avatar as { avatarId?: string; voice?: string } | undefined,
        montageProfile: config.montageProfile as string | undefined,
        onProgress: makeProgressCallback(jobId, {
          'Discovering available tools...': 5,
          'Planning production...': 10,
          'Generating assets and voiceover...': 20,
          'Generating voiceover...': 25,
          'Normalizing audio...': 35,
          'Transcribing audio...': 45,
          'Assembling composition...': 60,
          'Rendering video...': 70,
        }),
      });

      outputPath = agentResult.outputPath;

      // Save production metadata to DB for debugging and traceability
      await updateReelJobStatus(jobId, {
        productionMeta: buildProductionMeta(agentResult),
      }).catch(err => log.warn({ jobId, err }, 'Failed to save production meta'));

      log.info({ jobId, steps: agentResult.steps.length, assets: agentResult.generatedAssets.length }, 'Auto pipeline complete');
    }

    // Upload rendered MP4 to storage
    const storage = await createStorage();
    const outputBuffer = await readFile(outputPath);
    const outputKey = `reels/${jobId}/output.mp4`;
    await storage.upload(outputBuffer, outputKey);
    const outputUrl = await storage.getSignedUrl(outputKey, 86400);

    // Clean up local file
    await unlink(outputPath).catch(err => log.warn({ jobId, err }, 'Cleanup failed'));

    reelJobsTotal.inc({ status: 'completed' });
    reelRenderDuration.observe({ step: 'total' }, (Date.now() - pipelineStart) / 1000);

    await updateReelJobStatus(jobId, {
      status: 'COMPLETED',
      progress: 100,
      outputUrl,
      completedAt: new Date(),
    });

    // Deliver webhook callback (fire-and-forget, atomic dedup inside)
    if (job.callbackUrl) {
      deliverCallback(jobId, job.callbackUrl, {
        event: 'reel.completed',
        jobId,
        status: 'completed',
        outputUrl,
        language: job.language ?? undefined,
        parentJobId: job.parentJobId ?? undefined,
        completedAt: new Date().toISOString(),
      }).catch((e) => log.warn({ jobId, err: e }, 'Callback delivery failed'));
    }
  } catch (err) {
    reelJobsTotal.inc({ status: 'failed' });
    reelRenderDuration.observe({ step: 'total' }, (Date.now() - pipelineStart) / 1000);

    log.error({ jobId, err }, 'Pipeline failed');
    await updateReelJobStatus(jobId, {
      status: 'FAILED',
      error: err instanceof Error ? err.message : 'Unknown error',
      completedAt: new Date(),
    });

    // Send generic error to external callback - detailed error stays in DB + logs only
    if (job.callbackUrl) {
      deliverCallback(jobId, job.callbackUrl, {
        event: 'reel.failed',
        jobId,
        status: 'failed',
        error: 'Reel rendering failed',
        language: job.language ?? undefined,
        parentJobId: job.parentJobId ?? undefined,
        failedAt: new Date().toISOString(),
      }).catch((e) => log.warn({ jobId, err: e }, 'Callback delivery failed'));
    }

    throw err;
  }
}

/**
 * Build production metadata object to persist in DB.
 * Contains everything needed to trace what happened during production:
 * - LLM plan (shots with prompts, effects, layout)
 * - Generated assets (toolId, URL, type)
 * - Pipeline steps with durations
 */
function buildProductionMeta(result: import('@reelstack/agent').ProductionResult): Record<string, unknown> {
  return {
    plan: result.plan ? {
      layout: result.plan.layout,
      primarySource: result.plan.primarySource,
      reasoning: result.plan.reasoning,
      shots: result.plan.shots.map(s => ({
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        visualType: s.visual.type,
        toolId: 'toolId' in s.visual ? s.visual.toolId : undefined,
        prompt: 'prompt' in s.visual ? s.visual.prompt : undefined,
        searchQuery: 'searchQuery' in s.visual ? s.visual.searchQuery : undefined,
        reason: s.reason,
      })),
      effectCount: result.plan.effects.length,
    } : null,
    assets: result.generatedAssets.map(a => ({
      toolId: a.toolId,
      shotId: a.shotId,
      type: a.type,
      url: a.url,
      durationSeconds: a.durationSeconds,
    })),
    steps: result.steps.map(s => ({
      name: s.name,
      durationMs: Math.round(s.durationMs),
      detail: s.detail,
    })),
    durationSeconds: result.durationSeconds,
  };
}
