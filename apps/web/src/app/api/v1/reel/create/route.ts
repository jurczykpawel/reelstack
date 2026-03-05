import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { createReelJob, consumeTokenOrCredit } from '@reelstack/database';
import { getTierLimits } from '@/lib/api/validation';
import { createQueue } from '@reelstack/queue';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import { createReelSchema } from '@/lib/api/v1/reel-schemas';
import type { AuthContext } from '@/lib/api/v1/types';

/**
 * POST /api/v1/reel/create
 *
 * Full pipeline: script text → TTS → Whisper → AI Director → Remotion render → MP4.
 * Returns a job ID for polling status.
 */
export const POST = withAuth(
  { scope: API_SCOPES.REEL_WRITE, rateLimit: { maxRequests: 10, windowMs: 60_000 } },
  async (req: NextRequest, ctx: AuthContext) => {
    const body = await req.json().catch(() => null);
    if (!body) {
      return errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 400);
    }

    const parsed = createReelSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join(', '),
        400,
      );
    }

    // Check render credits (tier limit + token fallback)
    const limits = await getTierLimits(ctx.user.tier as import('@/lib/api/validation').TierName);
    const { consumed, source } = await consumeTokenOrCredit(ctx.user.id, limits.rendersPerMonth);
    if (!consumed) {
      return errorResponse(
        'QUOTA_EXCEEDED',
        'Monthly render limit reached and no tokens available. Upgrade or purchase tokens.',
        429,
      );
    }

    // Create reel job
    const job = await createReelJob({
      userId: ctx.user.id,
      script: parsed.data.script,
      reelConfig: {
        layout: parsed.data.layout,
        style: parsed.data.style,
        tts: parsed.data.tts,
        primaryVideoUrl: parsed.data.primaryVideoUrl,
        secondaryVideoUrl: parsed.data.secondaryVideoUrl,
        brandPreset: parsed.data.brandPreset,
      },
      apiKeyId: ctx.apiKeyId ?? undefined,
    });

    // Enqueue pipeline job
    try {
      const queue = await createQueue();
      await Promise.race([
        queue.enqueue(job.id, { jobId: job.id }, 'reel-render'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Queue timeout')), 5000),
        ),
      ]);
    } catch {
      return errorResponse('SERVICE_UNAVAILABLE', 'Reel render queue unavailable', 503);
    }

    return successResponse(
      {
        jobId: job.id,
        status: 'queued',
        creditSource: source,
        pollUrl: `/api/v1/reel/render/${job.id}`,
      },
      201,
    );
  },
);
