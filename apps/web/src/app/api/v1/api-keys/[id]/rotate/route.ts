import { auth } from '@/lib/auth';
import { prisma } from '@reelstack/database';
import { generateApiKey } from '@/lib/api/v1/api-keys';
import { successResponse, errorResponse } from '@/lib/api/v1/middleware';

/** POST /api/v1/api-keys/:id/rotate - Rotate an API key (session only) */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse('UNAUTHORIZED', 'Session required', 401);
  }

  const { id } = await params;

  // Find existing key
  const existing = await prisma.apiKey.findFirst({
    where: { id, userId: session.user.id, revokedAt: null, isActive: true },
  });

  if (!existing) {
    return errorResponse('NOT_FOUND', 'API key not found', 404);
  }

  // Revoke old key
  await prisma.apiKey.update({
    where: { id },
    data: {
      revokedAt: new Date(),
      revokedReason: 'Rotated',
      isActive: false,
    },
  });

  // Create new key with same settings
  const { plaintext, prefix, hash } = generateApiKey('live');

  const newKey = await prisma.apiKey.create({
    data: {
      userId: session.user.id,
      name: existing.name,
      keyPrefix: prefix,
      keyHash: hash,
      scopes: existing.scopes ?? ['*'],
      rateLimitPerMinute: existing.rateLimitPerMinute,
      expiresAt: existing.expiresAt,
    },
  });

  return successResponse({
    id: newKey.id,
    name: newKey.name,
    key: plaintext,
    keyPrefix: prefix,
    scopes: newKey.scopes,
    expiresAt: newKey.expiresAt,
    createdAt: newKey.createdAt,
    rotatedFrom: id,
  });
}
