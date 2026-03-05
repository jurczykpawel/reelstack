import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mockAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuth(),
}));

const mockFindFirst = vi.fn();
const mockUpdate = vi.fn();
const mockCreate = vi.fn();
vi.mock('@reelstack/database', () => ({
  prisma: {
    apiKey: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

const mockGenerateApiKey = vi.fn();
vi.mock('@/lib/api/v1/api-keys', () => ({
  generateApiKey: (...args: unknown[]) => mockGenerateApiKey(...args),
}));

const { POST } = await import('../../v1/api-keys/[id]/rotate/route');

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/v1/api-keys/[id]/rotate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no session', async () => {
    mockAuth.mockResolvedValue(null);
    const response = await POST(new Request('http://localhost') as unknown as NextRequest, makeParams('key-1'));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when session has no user id', async () => {
    mockAuth.mockResolvedValue({ user: {} });
    const response = await POST(new Request('http://localhost') as unknown as NextRequest, makeParams('key-1'));
    expect(response.status).toBe(401);
  });

  it('returns 404 when API key not found', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockFindFirst.mockResolvedValue(null);
    const response = await POST(new Request('http://localhost') as unknown as NextRequest, makeParams('nonexistent'));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('rotates API key and returns new key', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockFindFirst.mockResolvedValue({
      id: 'key-old',
      name: 'My Key',
      scopes: ['*'],
      rateLimitPerMinute: 60,
      expiresAt: null,
    });
    mockUpdate.mockResolvedValue({});
    mockGenerateApiKey.mockReturnValue({
      plaintext: 'rs_live_new_key',
      prefix: 'rs_live_newp',
      hash: 'new_hash',
    });
    mockCreate.mockResolvedValue({
      id: 'key-new',
      name: 'My Key',
      keyPrefix: 'rs_live_newp',
      scopes: ['*'],
      expiresAt: null,
      createdAt: new Date('2024-01-01'),
    });

    const response = await POST(new Request('http://localhost') as unknown as NextRequest, makeParams('key-old'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.id).toBe('key-new');
    expect(body.data.key).toBe('rs_live_new_key');
    expect(body.data.rotatedFrom).toBe('key-old');
  });

  it('revokes old key during rotation', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockFindFirst.mockResolvedValue({
      id: 'key-old',
      name: 'My Key',
      scopes: ['*'],
      rateLimitPerMinute: 60,
      expiresAt: null,
    });
    mockUpdate.mockResolvedValue({});
    mockGenerateApiKey.mockReturnValue({
      plaintext: 'rs_live_new_key',
      prefix: 'rs_live_newp',
      hash: 'new_hash',
    });
    mockCreate.mockResolvedValue({
      id: 'key-new',
      name: 'My Key',
      keyPrefix: 'rs_live_newp',
      scopes: ['*'],
      expiresAt: null,
      createdAt: new Date('2024-01-01'),
    });

    await POST(new Request('http://localhost') as unknown as NextRequest, makeParams('key-old'));

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'key-old' },
      data: expect.objectContaining({
        revokedReason: 'Rotated',
        isActive: false,
      }),
    });
  });
});
