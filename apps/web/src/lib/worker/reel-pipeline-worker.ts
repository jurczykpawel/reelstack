import { createStorage } from '@reelstack/storage';
import {
  getReelJobInternal,
  updateReelJobStatus,
  markCallbackSent,
  resetCallbackSent,
} from '@reelstack/database';
import { createLogger } from '@reelstack/logger';
import { reelJobsTotal, reelRenderDuration } from '@/lib/metrics';
import { createReel } from '@reelstack/remotion/pipeline';
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

    let lastStepStart: number | null = null;
    let lastStepName: string | null = null;

    const result = await createReel(
      {
        script: job.script ?? '',
        layout: (config.layout as 'split-screen' | 'fullscreen' | 'picture-in-picture') ?? 'fullscreen',
        style: config.style as 'dynamic' | 'calm' | 'cinematic' | 'educational' | undefined,
        tts: config.tts as { provider?: 'edge-tts' | 'elevenlabs' | 'openai'; voice?: string; language?: string } | undefined,
        primaryVideoUrl: config.primaryVideoUrl as string | undefined,
        secondaryVideoUrl: config.secondaryVideoUrl as string | undefined,
        brandPreset: config.brandPreset as Record<string, string> | undefined,
      },
      (step) => {
        // Map step names to progress percentages and metric labels
        const stepInfo: Record<string, { progress: number; metric: string }> = {
          'Generating voiceover...': { progress: 10, metric: 'tts' },
          'Normalizing audio...': { progress: 20, metric: 'normalize' },
          'Transcribing audio...': { progress: 30, metric: 'transcribe' },
          'Grouping into subtitle cues...': { progress: 40, metric: 'subtitles' },
          'AI Director analyzing content...': { progress: 50, metric: 'ai_director' },
          'Building composition...': { progress: 60, metric: 'bundle' },
          'Rendering video...': { progress: 70, metric: 'render' },
        };

        // Record duration for the previous step
        if (lastStepStart && lastStepName) {
          reelRenderDuration.observe({ step: lastStepName }, (Date.now() - lastStepStart) / 1000);
        }

        const info = stepInfo[step];
        if (info) {
          lastStepStart = Date.now();
          lastStepName = info.metric;
          updateReelJobStatus(jobId, { progress: info.progress }).catch(err => log.warn({ jobId, err }, 'Progress update failed'));
        }
      },
    );

    // Record duration for the final step
    if (lastStepStart && lastStepName) {
      reelRenderDuration.observe({ step: lastStepName }, (Date.now() - lastStepStart) / 1000);
    }

    // Upload rendered MP4 to storage
    const storage = await createStorage();
    const outputBuffer = await readFile(result.outputPath);
    const outputKey = `reels/${jobId}/output.mp4`;
    await storage.upload(outputBuffer, outputKey);
    const outputUrl = await storage.getSignedUrl(outputKey, 86400);

    // Clean up local file
    await unlink(result.outputPath).catch(err => log.warn({ jobId, err }, 'Cleanup failed'));

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

    // Deliver failure webhook callback (fire-and-forget)
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
