import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock PrismaClient
const mockUserFindUnique = vi.fn();
const mockUserFindFirst = vi.fn();
const mockUserUpsert = vi.fn();
const mockReelJobCount = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    user: {
      findUnique: mockUserFindUnique,
      findFirst: mockUserFindFirst,
      upsert: mockUserUpsert,
    },
    reelJob: {
      count: mockReelJobCount,
    },
  })),
}));

const {
  getUserByEmail,
  getUserById,
  upsertUser,
  getMonthlyRenderCount,
} = await import('../index');

describe('User helpers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getUserByEmail queries by email', async () => {
    mockUserFindUnique.mockResolvedValue({ id: '1', email: 'a@b.com' });
    const user = await getUserByEmail('a@b.com');
    expect(user).toEqual({ id: '1', email: 'a@b.com' });
    expect(mockUserFindUnique).toHaveBeenCalledWith({ where: { email: 'a@b.com' } });
  });

  it('getUserById queries by id', async () => {
    mockUserFindUnique.mockResolvedValue({ id: '1' });
    await getUserById('1');
    expect(mockUserFindUnique).toHaveBeenCalledWith({ where: { id: '1' } });
  });

  it('upsertUser creates or updates', async () => {
    mockUserUpsert.mockResolvedValue({ id: '1', email: 'a@b.com' });
    await upsertUser('1', 'a@b.com');
    expect(mockUserUpsert).toHaveBeenCalledWith({
      where: { id: '1' },
      update: { email: 'a@b.com' },
      create: { id: '1', email: 'a@b.com' },
    });
  });
});

describe('getMonthlyRenderCount', () => {
  beforeEach(() => vi.clearAllMocks());

  it('counts reelJobs from start of current month', async () => {
    mockReelJobCount.mockResolvedValue(7);
    const count = await getMonthlyRenderCount('user-1');
    expect(count).toBe(7);
    const callArgs = mockReelJobCount.mock.calls[0][0];
    expect(callArgs.where.userId).toBe('user-1');
    expect(callArgs.where.createdAt.gte).toBeInstanceOf(Date);
    // Should be first day of month
    const gte = callArgs.where.createdAt.gte as Date;
    expect(gte.getDate()).toBe(1);
    expect(gte.getHours()).toBe(0);
  });
});
