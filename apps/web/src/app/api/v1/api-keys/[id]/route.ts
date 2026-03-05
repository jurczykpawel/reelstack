import { auth } from '@/lib/auth';
import { revokeApiKey } from '@reelstack/database';
import { successResponse, errorResponse } from '@/lib/api/v1/middleware';

/** DELETE /api/v1/api-keys/:id - Revoke an API key (session only) */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse('UNAUTHORIZED', 'Session required', 401);
  }

  const { id } = await params;
  const result = await revokeApiKey(id, session.user.id);

  if (result.count === 0) {
    return errorResponse('NOT_FOUND', 'API key not found', 404);
  }

  return successResponse({ revoked: true });
}
