import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mockAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuth(),
}));

const mockRevokeApiKey = vi.fn();
vi.mock('@reelstack/database', () => ({
  revokeApiKey: (...args: unknown[]) => mockRevokeApiKey(...args),
}));

const { DELETE } = await import('../../v1/api-keys/[id]/route');

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('DELETE /api/v1/api-keys/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no session', async () => {
    mockAuth.mockResolvedValue(null);
    const response = await DELETE(new Request('http://localhost') as unknown as NextRequest, makeParams('key-1'));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when session has no user id', async () => {
    mockAuth.mockResolvedValue({ user: {} });
    const response = await DELETE(new Request('http://localhost') as unknown as NextRequest, makeParams('key-1'));
    expect(response.status).toBe(401);
  });

  it('returns 404 when API key not found', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockRevokeApiKey.mockResolvedValue({ count: 0 });
    const response = await DELETE(new Request('http://localhost') as unknown as NextRequest, makeParams('nonexistent'));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('revokes API key and returns success', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockRevokeApiKey.mockResolvedValue({ count: 1 });
    const response = await DELETE(new Request('http://localhost') as unknown as NextRequest, makeParams('key-1'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.revoked).toBe(true);
    expect(mockRevokeApiKey).toHaveBeenCalledWith('key-1', 'user-1');
  });
});
