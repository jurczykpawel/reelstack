import { getAuthUser } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/api/errors';
import { getMonthlyRenderCount, getTokenBalance } from '@reelstack/database';
import { getTierLimits } from '@/lib/api/validation';
import type { TierName } from '@/lib/api/validation';

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return apiError(401, 'Unauthorized');

  const tier = auth.dbUser.tier as TierName;
  const [rendersThisMonth, tokenBalance] = await Promise.all([
    getMonthlyRenderCount(auth.dbUser.id),
    getTokenBalance(auth.dbUser.id),
  ]);
  const limits = await getTierLimits(tier);

  return apiSuccess({
    id: auth.dbUser.id,
    email: auth.dbUser.email,
    tier,
    rendersThisMonth,
    monthlyLimit: limits.rendersPerMonth,
    tokenBalance,
    createdAt: auth.dbUser.createdAt,
  });
}
