import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const mockAuthenticate = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

vi.mock('@/lib/api/v1/middleware', () => {
  function withAuth(
    _options: unknown,
    handler: (req: NextRequest, ctx: unknown) => Promise<NextResponse>
  ) {
    return async (req: NextRequest) => {
      const ctx = await mockAuthenticate(req);
      if (!ctx) {
        return NextResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
          { status: 401 },
        );
      }
      try {
        return await handler(req, ctx);
      } catch (err) {
        console.error(err);
        return NextResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
          { status: 500 },
        );
      }
    };
  }
  function successResponse(data: unknown, status = 200) {
    return NextResponse.json({ data }, { status });
  }
  function errorResponse(code: string, message: string, status: number) {
    return NextResponse.json({ error: { code, message } }, { status });
  }
  return { withAuth, successResponse, errorResponse, authenticate: mockAuthenticate };
});

vi.mock('@/lib/api/validation', () => ({
  getTierLimits: () => Promise.resolve({ maxFileSize: 100 * 1024 * 1024, maxDuration: 120, rendersPerMonth: 3 }),
}));

vi.mock('@/lib/api/rate-limit', () => ({
  rateLimit: () => ({ success: true, remaining: 9 }),
}));

const mockCreateReelJob = vi.fn();
const mockConsumeTokenOrCredit = vi.fn();
vi.mock('@reelstack/database', () => ({
  createReelJob: (...args: unknown[]) => mockCreateReelJob(...args),
  consumeTokenOrCredit: (...args: unknown[]) => mockConsumeTokenOrCredit(...args),
}));

const mockEnqueue = vi.fn();
vi.mock('@reelstack/queue', () => ({
  createQueue: () => Promise.resolve({ enqueue: mockEnqueue }),
}));

const { POST } = await import('../../v1/reel/create/route');

const mockUser = { id: 'user-1', email: 'test@test.com', tier: 'FREE' };
const mockAuthCtx = { user: mockUser, apiKeyId: 'key-1', scopes: ['*'] };

function makeRequest(body: unknown): NextRequest {
  return new Request('http://localhost/api/v1/reel/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe('POST /api/v1/reel/create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuthenticate.mockResolvedValue(null);
    const response = await POST(makeRequest({ script: 'Hello' }));
    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    const req = new Request('http://localhost/api/v1/reel/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    }) as unknown as NextRequest;
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it('returns 400 for empty script', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    const response = await POST(makeRequest({ script: '' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 429 when credits and tokens exhausted', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockConsumeTokenOrCredit.mockResolvedValue({ consumed: false, source: null });
    const response = await POST(makeRequest({ script: 'Hello world' }));
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error.code).toBe('QUOTA_EXCEEDED');
  });

  it('creates reel job and returns 201 with tier credit', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockConsumeTokenOrCredit.mockResolvedValue({ consumed: true, source: 'tier' });
    mockCreateReelJob.mockResolvedValue({ id: 'reel-1' });
    mockEnqueue.mockResolvedValue(undefined);

    const response = await POST(makeRequest({ script: 'Hello world' }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.jobId).toBe('reel-1');
    expect(body.data.status).toBe('queued');
    expect(body.data.creditSource).toBe('tier');
    expect(body.data.pollUrl).toBe('/api/v1/reel/render/reel-1');
  });

  it('returns creditSource token when token consumed', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockConsumeTokenOrCredit.mockResolvedValue({ consumed: true, source: 'token' });
    mockCreateReelJob.mockResolvedValue({ id: 'reel-2' });
    mockEnqueue.mockResolvedValue(undefined);

    const response = await POST(makeRequest({ script: 'Hello' }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.creditSource).toBe('token');
  });

  it('enqueues to reel-render queue', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockConsumeTokenOrCredit.mockResolvedValue({ consumed: true, source: 'tier' });
    mockCreateReelJob.mockResolvedValue({ id: 'reel-3' });
    mockEnqueue.mockResolvedValue(undefined);

    await POST(makeRequest({ script: 'Hello' }));
    expect(mockEnqueue).toHaveBeenCalledWith('reel-3', { jobId: 'reel-3' }, 'reel-render');
  });

  it('returns 503 when queue unavailable', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockConsumeTokenOrCredit.mockResolvedValue({ consumed: true, source: 'tier' });
    mockCreateReelJob.mockResolvedValue({ id: 'reel-4' });
    mockEnqueue.mockRejectedValue(new Error('queue down'));

    const response = await POST(makeRequest({ script: 'Hello' }));
    expect(response.status).toBe(503);
  });

  it('passes config to createReelJob', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockConsumeTokenOrCredit.mockResolvedValue({ consumed: true, source: 'tier' });
    mockCreateReelJob.mockResolvedValue({ id: 'reel-5' });
    mockEnqueue.mockResolvedValue(undefined);

    await POST(makeRequest({
      script: 'Hello world',
      layout: 'split-screen',
      style: 'cinematic',
    }));

    expect(mockCreateReelJob).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        script: 'Hello world',
        reelConfig: expect.objectContaining({ layout: 'split-screen', style: 'cinematic' }),
      }),
    );
  });
});
