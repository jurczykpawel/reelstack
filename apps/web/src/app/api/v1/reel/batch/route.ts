import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { createReelJob, consumeCredits, getCreditCost, updateReelJobStatus } from '@reelstack/database';
import { getTierLimits } from '@/lib/api/validation';
import { createQueue } from '@reelstack/queue';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import { batchReelSchema } from '@/lib/api/v1/reel-schemas';
import type { AuthContext } from '@/lib/api/v1/types';
import { randomUUID } from 'crypto';

/**
 * POST /api/v1/reel/batch
 *
 * Create up to 20 reel jobs in a single request.
 * Each reel consumes one render credit. Partial success is possible:
 * if credits run out mid-batch, already-created jobs proceed.
 */
export const POST = withAuth(
  { scope: API_SCOPES.REEL_WRITE, rateLimit: { maxRequests: 2, windowMs: 60_000 } },
  async (req: NextRequest, ctx: AuthContext) => {
    const body = await req.json().catch(() => null);
    if (!body) {
      return errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 400);
    }

    const parsed = batchReelSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join(', '),
        400,
      );
    }

    const limits = await getTierLimits(ctx.user.tier as import('@/lib/api/validation').TierName);
    const cost = await getCreditCost('video');
    const batchId = randomUUID();
    const results: Array<{ index: number; jobId: string; status: 'queued' } | { index: number; error: string }> = [];

    let queue: Awaited<ReturnType<typeof createQueue>> | null = null;
    try {
      queue = await createQueue();
    } catch {
      return errorResponse('SERVICE_UNAVAILABLE', 'Reel render queue unavailable', 503);
    }

    for (let i = 0; i < parsed.data.reels.length; i++) {
      const reel = parsed.data.reels[i];

      // Check credits per reel
      const { consumed, source: _source } = await consumeCredits(ctx.user.id, limits.creditsPerMonth, cost);
      if (!consumed) {
        results.push({ index: i, error: 'Quota exceeded - no credits remaining' });
        continue;
      }

      const job = await createReelJob({
        userId: ctx.user.id,
        script: reel.script,
        reelConfig: {
          layout: reel.layout,
          style: reel.style,
          tts: reel.tts,
          primaryVideoUrl: reel.primaryVideoUrl,
          secondaryVideoUrl: reel.secondaryVideoUrl,
          brandPreset: reel.brandPreset,
        },
        apiKeyId: ctx.apiKeyId ?? undefined,
        creditCost: cost,
        callbackUrl: reel.callbackUrl ?? parsed.data.callbackUrl,
        parentJobId: batchId,
      });

      try {
        await queue.enqueue(job.id, { jobId: job.id }, 'reel-render');
        results.push({ index: i, jobId: job.id, status: 'queued' });
      } catch {
        await updateReelJobStatus(job.id, { status: 'FAILED', error: 'Queue unavailable' }).catch(() => {});
        results.push({ index: i, jobId: job.id, error: 'Queue unavailable' } as { index: number; error: string });
      }
    }

    const queued = results.filter((r) => 'jobId' in r).length;
    const failed = results.filter((r) => 'error' in r).length;

    return successResponse(
      {
        batchId,
        total: parsed.data.reels.length,
        queued,
        failed,
        jobs: results,
      },
      201,
    );
  },
);
