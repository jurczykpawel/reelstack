import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock PrismaClient with token/reel models
const mockReelJobCount = vi.fn();
const mockReelJobCreate = vi.fn();
const mockReelJobFindFirst = vi.fn();
const mockReelJobFindUnique = vi.fn();
const mockReelJobUpdate = vi.fn();
const mockReelJobFindMany = vi.fn();
const mockUserFindUnique = vi.fn();
const mockUserFindUniqueOrThrow = vi.fn();
const mockUserUpdate = vi.fn();
const mockTokenTransactionCreate = vi.fn();
const mockTokenTransactionFindMany = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    user: {
      findUnique: mockUserFindUnique,
      findUniqueOrThrow: mockUserFindUniqueOrThrow,
      update: mockUserUpdate,
    },
    reelJob: {
      count: mockReelJobCount,
      create: mockReelJobCreate,
      findFirst: mockReelJobFindFirst,
      findUnique: mockReelJobFindUnique,
      update: mockReelJobUpdate,
      findMany: mockReelJobFindMany,
    },
    tokenTransaction: {
      create: mockTokenTransactionCreate,
      findMany: mockTokenTransactionFindMany,
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        reelJob: { count: mockReelJobCount },
        user: {
          findUniqueOrThrow: mockUserFindUniqueOrThrow,
          update: mockUserUpdate,
        },
        tokenTransaction: { create: mockTokenTransactionCreate },
      });
    }),
  })),
}));

const {
  consumeTokenOrCredit,
  addTokens,
  getTokenBalance,
  getTokenTransactions,
  updateUserTier,
  createReelJob,
  getReelJob,
  getReelJobInternal,
  updateReelJobStatus,
  getReelJobsByUser,
} = await import('../index');

describe('consumeTokenOrCredit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('consumes from tier when under monthly limit', async () => {
    mockReelJobCount.mockResolvedValue(5);

    const result = await consumeTokenOrCredit('user-1', 10);
    expect(result).toEqual({ consumed: true, source: 'tier' });
  });

  it('falls back to tokens when tier limit exhausted', async () => {
    mockReelJobCount.mockResolvedValue(10); // at limit
    mockUserFindUniqueOrThrow.mockResolvedValue({ id: 'user-1', tokenBalance: 5 });
    mockUserUpdate.mockResolvedValue({});
    mockTokenTransactionCreate.mockResolvedValue({});

    const result = await consumeTokenOrCredit('user-1', 10);
    expect(result).toEqual({ consumed: true, source: 'token' });
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { tokenBalance: { decrement: 1 } },
    });
    expect(mockTokenTransactionCreate).toHaveBeenCalledWith({
      data: { userId: 'user-1', amount: -1, reason: 'render' },
    });
  });

  it('returns consumed false when both tier and tokens exhausted', async () => {
    mockReelJobCount.mockResolvedValue(10);
    mockUserFindUniqueOrThrow.mockResolvedValue({ id: 'user-1', tokenBalance: 0 });

    const result = await consumeTokenOrCredit('user-1', 10);
    expect(result).toEqual({ consumed: false, source: null });
  });

  it('counts reelJobs towards monthly total', async () => {
    mockReelJobCount.mockResolvedValue(9); // under limit of 10

    const result = await consumeTokenOrCredit('user-1', 10);
    expect(result).toEqual({ consumed: true, source: 'tier' });
    expect(mockReelJobCount).toHaveBeenCalled();
  });
});

describe('addTokens', () => {
  beforeEach(() => vi.clearAllMocks());

  it('increments balance and creates transaction', async () => {
    mockUserUpdate.mockResolvedValue({});
    mockTokenTransactionCreate.mockResolvedValue({ id: 'tx-1' });

    await addTokens('user-1', 50, 'purchase', 'order-123');
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { tokenBalance: { increment: 50 } },
    });
    expect(mockTokenTransactionCreate).toHaveBeenCalledWith({
      data: { userId: 'user-1', amount: 50, reason: 'purchase', sellfOrderId: 'order-123' },
    });
  });

  it('creates transaction without sellfOrderId', async () => {
    mockUserUpdate.mockResolvedValue({});
    mockTokenTransactionCreate.mockResolvedValue({ id: 'tx-2' });

    await addTokens('user-1', 10, 'refund');
    expect(mockTokenTransactionCreate).toHaveBeenCalledWith({
      data: { userId: 'user-1', amount: 10, reason: 'refund', sellfOrderId: undefined },
    });
  });
});

describe('getTokenBalance', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns user token balance', async () => {
    mockUserFindUnique.mockResolvedValue({ tokenBalance: 42 });
    const balance = await getTokenBalance('user-1');
    expect(balance).toBe(42);
  });

  it('returns 0 when user not found', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const balance = await getTokenBalance('nonexistent');
    expect(balance).toBe(0);
  });
});

describe('getTokenTransactions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ordered transactions with limit', async () => {
    const mockTxns = [{ id: 'tx-1', amount: 50 }];
    mockTokenTransactionFindMany.mockResolvedValue(mockTxns);
    const result = await getTokenTransactions('user-1', 10);
    expect(result).toEqual(mockTxns);
    expect(mockTokenTransactionFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  });
});

describe('updateUserTier', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates user tier', async () => {
    mockUserUpdate.mockResolvedValue({ id: 'user-1', tier: 'PRO' });
    await updateUserTier('user-1', 'PRO');
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { tier: 'PRO' },
    });
  });
});

describe('ReelJob CRUD', () => {
  beforeEach(() => vi.clearAllMocks());

  it('createReelJob creates with all fields', async () => {
    mockReelJobCreate.mockResolvedValue({ id: 'reel-1' });
    await createReelJob({
      userId: 'user-1',
      script: 'Hello world',
      reelConfig: { layout: 'fullscreen' },
      apiKeyId: 'key-1',
    });
    expect(mockReelJobCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        script: 'Hello world',
        reelConfig: { layout: 'fullscreen' },
        apiKeyId: 'key-1',
      },
    });
  });

  it('getReelJob scopes by userId', async () => {
    mockReelJobFindFirst.mockResolvedValue({ id: 'reel-1' });
    await getReelJob('reel-1', 'user-1');
    expect(mockReelJobFindFirst).toHaveBeenCalledWith({
      where: { id: 'reel-1', userId: 'user-1' },
    });
  });

  it('getReelJobInternal reads without userId scope', async () => {
    mockReelJobFindUnique.mockResolvedValue({ id: 'reel-1' });
    await getReelJobInternal('reel-1');
    expect(mockReelJobFindUnique).toHaveBeenCalledWith({ where: { id: 'reel-1' } });
  });

  it('updateReelJobStatus updates subset of fields', async () => {
    mockReelJobUpdate.mockResolvedValue({ id: 'reel-1', status: 'COMPLETED' });
    await updateReelJobStatus('reel-1', { status: 'COMPLETED', progress: 100 });
    expect(mockReelJobUpdate).toHaveBeenCalledWith({
      where: { id: 'reel-1' },
      data: { status: 'COMPLETED', progress: 100 },
    });
  });

  it('getReelJobsByUser returns ordered list', async () => {
    mockReelJobFindMany.mockResolvedValue([]);
    await getReelJobsByUser('user-1', 5);
    expect(mockReelJobFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
  });
});
