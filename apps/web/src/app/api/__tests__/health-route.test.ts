import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQueryRaw = vi.fn();
vi.mock('@reelstack/database', () => ({
  prisma: {
    $queryRawUnsafe: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

vi.mock('@reelstack/queue', () => ({
  detectDeploymentMode: () => 'local',
}));

const { GET } = await import('../health/route');

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ok status when DB is connected', async () => {
    mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe(true);
    expect(body.mode).toBe('local');
    expect(body.timestamp).toBeDefined();
  });

  it('returns ok with db=false when DB is down', async () => {
    mockQueryRaw.mockRejectedValue(new Error('Connection refused'));
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe(false);
  });
});
