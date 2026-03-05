import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export function createDB(): PrismaClient {
  return prisma;
}

// ==========================================
// User queries
// ==========================================

export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function getUserById(userId: string) {
  return prisma.user.findUnique({ where: { id: userId } });
}

export async function upsertUser(id: string, email: string) {
  return prisma.user.upsert({
    where: { id },
    update: { email },
    create: { id, email },
  });
}


export async function getUserPreferences(userId: string): Promise<Record<string, unknown>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  return (user?.preferences as Record<string, unknown>) ?? {};
}

export async function updateUserPreferences(
  userId: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const existing = await getUserPreferences(userId);
  const merged = { ...existing, ...data };
  await prisma.user.update({
    where: { id: userId },
    data: { preferences: merged as Record<string, unknown> as Parameters<typeof prisma.user.update>[0]['data']['preferences'] },
  });
  return merged;
}

export async function updateUserTier(userId: string, tier: 'FREE' | 'SOLO' | 'PRO' | 'AGENCY') {
  return prisma.user.update({
    where: { id: userId },
    data: { tier },
  });
}

export async function getUserBySellfCustomerId(sellfCustomerId: string) {
  return prisma.user.findUnique({ where: { sellfCustomerId } });
}

export async function linkSellfCustomer(userId: string, sellfCustomerId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { sellfCustomerId },
  });
}

// ==========================================
// Usage queries
// ==========================================

export async function getMonthlyRenderCount(userId: string): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  return prisma.reelJob.count({
    where: { userId, createdAt: { gte: startOfMonth } },
  });
}

// ==========================================
// Template queries
// ==========================================

export async function createTemplate(data: {
  userId: string;
  name: string;
  description?: string;
  style: object;
  category?: string;
  isPublic?: boolean;
}) {
  return prisma.template.create({
    data: {
      userId: data.userId,
      name: data.name,
      description: data.description ?? '',
      style: data.style,
      category: data.category ?? 'custom',
      isPublic: data.isPublic ?? false,
    },
  });
}

export async function getTemplatesByUser(userId: string) {
  return prisma.template.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getTemplateById(id: string, userId: string) {
  return prisma.template.findFirst({ where: { id, userId } });
}

export async function getPublicTemplates(cursor?: string, limit = 20) {
  return prisma.template.findMany({
    where: { isPublic: true },
    orderBy: { usageCount: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
}

export async function updateTemplate(
  id: string,
  userId: string,
  data: {
    name?: string;
    description?: string;
    style?: object;
    category?: string;
    isPublic?: boolean;
  }
) {
  return prisma.template.updateMany({
    where: { id, userId },
    data,
  });
}

export async function deleteTemplate(id: string, userId: string) {
  return prisma.template.deleteMany({ where: { id, userId } });
}

export async function incrementTemplateUsage(id: string) {
  return prisma.template.update({
    where: { id },
    data: { usageCount: { increment: 1 } },
  });
}

// ==========================================
// ApiKey queries
// ==========================================

export async function createApiKey(data: {
  userId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes?: string[];
  rateLimitPerMinute?: number;
  expiresAt?: Date;
}) {
  return prisma.apiKey.create({
    data: {
      userId: data.userId,
      name: data.name,
      keyPrefix: data.keyPrefix,
      keyHash: data.keyHash,
      scopes: data.scopes ?? ['*'],
      rateLimitPerMinute: data.rateLimitPerMinute ?? 60,
      expiresAt: data.expiresAt,
    },
  });
}

export async function getApiKeysByUser(userId: string) {
  return prisma.apiKey.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      rateLimitPerMinute: true,
      isActive: true,
      expiresAt: true,
      lastUsedAt: true,
      usageCount: true,
      createdAt: true,
    },
  });
}

export async function getApiKeyByHash(keyHash: string) {
  return prisma.apiKey.findUnique({
    where: { keyHash },
    include: { user: true },
  });
}

export async function revokeApiKey(id: string, userId: string, reason?: string) {
  return prisma.apiKey.updateMany({
    where: { id, userId, revokedAt: null },
    data: {
      revokedAt: new Date(),
      revokedReason: reason ?? 'User revoked',
      isActive: false,
    },
  });
}

export async function touchApiKey(id: string, ip?: string) {
  return prisma.apiKey.update({
    where: { id },
    data: {
      lastUsedAt: new Date(),
      lastUsedIp: ip,
      usageCount: { increment: 1 },
    },
  });
}

// ==========================================
// Token & credit queries
// ==========================================

/**
 * Consume a render credit: first checks tier monthly limit,
 * then falls back to token balance. Returns true if consumed.
 */
export async function consumeTokenOrCredit(
  userId: string,
  monthlyLimit: number
): Promise<{ consumed: boolean; source: 'tier' | 'token' | null }> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const reelCount = await tx.reelJob.count({
        where: { userId, createdAt: { gte: startOfMonth } },
      });

      if (reelCount < monthlyLimit) {
        return { consumed: true, source: 'tier' as const };
      }

      // Tier limit exhausted - try token balance
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.tokenBalance > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { tokenBalance: { decrement: 1 } },
        });
        await tx.tokenTransaction.create({
          data: { userId, amount: -1, reason: 'render' },
        });
        return { consumed: true, source: 'token' as const };
      }

      return { consumed: false, source: null };
    });
    return result;
  } catch (err) {
    throw err;
  }
}

export async function addTokens(
  userId: string,
  amount: number,
  reason: string,
  sellfOrderId?: string
) {
  return prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { tokenBalance: { increment: amount } },
    });
    return tx.tokenTransaction.create({
      data: { userId, amount, reason, sellfOrderId },
    });
  });
}

export async function getTokenBalance(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokenBalance: true },
  });
  return user?.tokenBalance ?? 0;
}

export async function getTokenTransactions(userId: string, limit = 50) {
  return prisma.tokenTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

// ==========================================
// ReelJob queries
// ==========================================

export async function createReelJob(data: {
  userId: string;
  script?: string;
  reelConfig?: object;
  apiKeyId?: string;
}) {
  return prisma.reelJob.create({
    data: {
      userId: data.userId,
      script: data.script,
      reelConfig: data.reelConfig as object | undefined,
      apiKeyId: data.apiKeyId,
    },
  });
}

export async function getReelJob(id: string, userId: string) {
  return prisma.reelJob.findFirst({ where: { id, userId } });
}

export async function getReelJobInternal(id: string) {
  return prisma.reelJob.findUnique({ where: { id } });
}

export async function updateReelJobStatus(
  id: string,
  updates: {
    status?: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    progress?: number;
    outputUrl?: string;
    error?: string;
    publishStatus?: object;
    startedAt?: Date;
    completedAt?: Date;
  }
) {
  return prisma.reelJob.update({ where: { id }, data: updates });
}

export async function getReelJobsByUser(userId: string, limit = 20) {
  return prisma.reelJob.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

// ==========================================
// TierConfig queries
// ==========================================

const TIER_CONFIG_DEFAULTS = [
  { tier: 'FREE',   rendersPerMonth: 3,   maxFileSizeMb: 100,    maxDurationSec: 120  },
  { tier: 'SOLO',   rendersPerMonth: 30,  maxFileSizeMb: 500,    maxDurationSec: 300  },
  { tier: 'PRO',    rendersPerMonth: 100, maxFileSizeMb: 2048,   maxDurationSec: 1800 },
  { tier: 'AGENCY', rendersPerMonth: 500, maxFileSizeMb: 10240,  maxDurationSec: -1   },
] as const;

export async function getAllTierConfigs(productSlug = 'reelstack') {
  return prisma.tierConfig.findMany({ where: { productSlug } });
}

export async function upsertTierConfig(
  tier: string,
  productSlug: string,
  data: { rendersPerMonth: number; maxFileSizeMb: number; maxDurationSec: number; active?: boolean }
) {
  return prisma.tierConfig.upsert({
    where: { tier_productSlug: { tier, productSlug } },
    update: data,
    create: { tier, productSlug, ...data },
  });
}

/** Idempotent seed — inserts defaults only for missing (tier, productSlug) pairs. */
export async function seedTierDefaults(productSlug = 'reelstack') {
  for (const row of TIER_CONFIG_DEFAULTS) {
    await prisma.tierConfig.upsert({
      where: { tier_productSlug: { tier: row.tier, productSlug } },
      update: {},
      create: { ...row, productSlug },
    });
  }
}

export { PrismaClient };
export type * from '@prisma/client';
