import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { getMonthlyRenderCount, getTokenBalance } from '@reelstack/database';
import { withAuth, successResponse } from '@/lib/api/v1/middleware';
import { getTierLimits } from '@/lib/api/validation';
import type { TierName } from '@/lib/api/validation';
import type { AuthContext } from '@/lib/api/v1/types';

/** GET /api/v1/user/usage - Get current usage stats */
export const GET = withAuth(
  { scope: API_SCOPES.REEL_READ },
  async (_req: NextRequest, ctx: AuthContext) => {
    const tier = (ctx.user.tier ?? 'FREE') as TierName;
    const [rendersThisMonth, tokenBalance] = await Promise.all([
      getMonthlyRenderCount(ctx.user.id),
      getTokenBalance(ctx.user.id),
    ]);
    const limits = await getTierLimits(tier);

    return successResponse({
      tier,
      rendersThisMonth,
      monthlyLimit: limits.rendersPerMonth,
      tokenBalance,
    });
  }
);
