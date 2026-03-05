import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  getUserByEmail,
  addTokens,
  updateUserTier,
  linkSellfCustomer,
  getUserBySellfCustomerId,
  prisma,
} from '@reelstack/database';
import { rateLimit } from '@/lib/api/rate-limit';

/**
 * POST /api/webhooks/sellf
 *
 * Universal webhook for purchases. Accepts any of these formats:
 *
 * Direct:  {"email": "x@y.com", "product": "prod_pro", "reference": "order_123"}
 * Sellf:   {"event": "purchase.completed", "data": {"customer": {"email": "..."}, "product": {"slug": "..."}, "order": {"sessionId": "..."}}}
 *
 * Auth: HMAC signature (SELLF_WEBHOOK_SECRET) via X-Sellf-Signature or X-Webhook-Signature header.
 * Product-to-action mapping configured via SELLF_PRODUCT_* env vars.
 */

// ── Auth ──────────────────────────────────────────────────

function verifyWebhook(body: string, request: NextRequest): boolean {
  const secret = process.env.SELLF_WEBHOOK_SECRET;
  if (!secret) return false;

  const signature = request.headers.get('x-sellf-signature')
    ?? request.headers.get('x-webhook-signature')
    ?? '';

  if (!signature) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  // Constant-time comparison (safe even if lengths differ)
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return false;

  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

// ── Normalize ─────────────────────────────────────────────

interface NormalizedData {
  email: string;
  product: string;
  reference: string;
  userId?: string;
}

/**
 * Normalize incoming payload to flat format.
 * Sellf sends: { event, data: { customer: { email }, product: { slug, id }, order: { sessionId } } }
 * Direct sends: { email, product, reference }
 */
function normalizePayload(raw: Record<string, unknown>): NormalizedData {
  // Sellf format: nested event + data
  if ('event' in raw && 'data' in raw) {
    const data = raw.data as Record<string, unknown>;
    const customer = (data.customer ?? {}) as Record<string, string>;
    const product = (data.product ?? {}) as Record<string, string>;
    const order = (data.order ?? {}) as Record<string, string>;

    return {
      email: customer.email ?? '',
      product: product.slug ?? product.id ?? '',
      reference: data.reference as string
        ?? `${raw.event}:${order.sessionId ?? ''}`,
      userId: (data.userId ?? customer.userId) as string | undefined,
    };
  }

  // Direct format: flat object
  return {
    email: (raw.email as string) ?? '',
    product: (raw.product as string) ?? '',
    reference: (raw.reference as string) ?? '',
    userId: raw.userId as string | undefined,
  };
}

// ── Product action mapping ────────────────────────────────

type ProductAction =
  | { type: 'tier'; tier: 'SOLO' | 'PRO' | 'AGENCY' }
  | { type: 'tokens'; amount: number };

function getProductAction(productId: string): ProductAction | null {
  const mapping: Record<string, ProductAction> = {
    // Subscription tiers
    [process.env.SELLF_PRODUCT_SOLO ?? 'sellf_solo']: { type: 'tier', tier: 'SOLO' },
    [process.env.SELLF_PRODUCT_PRO ?? 'sellf_pro']: { type: 'tier', tier: 'PRO' },
    [process.env.SELLF_PRODUCT_AGENCY ?? 'sellf_agency']: { type: 'tier', tier: 'AGENCY' },
    // Token packs
    [process.env.SELLF_PRODUCT_10_TOKENS ?? 'sellf_10_tokens']: { type: 'tokens', amount: 10 },
    [process.env.SELLF_PRODUCT_50_TOKENS ?? 'sellf_50_tokens']: { type: 'tokens', amount: 50 },
    [process.env.SELLF_PRODUCT_150_TOKENS ?? 'sellf_150_tokens']: { type: 'tokens', amount: 150 },
    [process.env.SELLF_PRODUCT_500_TOKENS ?? 'sellf_500_tokens']: { type: 'tokens', amount: 500 },
  };
  return mapping[productId] ?? null;
}

// ── Resolve user ──────────────────────────────────────────

async function resolveUser(data: NormalizedData) {
  // By userId hint
  if (data.userId) {
    const user = await getUserByEmail(data.userId).catch(() => null);
    if (user) return user;
  }

  // By sellfCustomerId (email used as customer ID)
  const byCustomerId = await getUserBySellfCustomerId(data.email).catch(() => null);
  if (byCustomerId) return byCustomerId;

  // By email
  const byEmail = await getUserByEmail(data.email).catch(() => null);
  return byEmail;
}

// ── Handler ───────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Rate limit by IP — 30 per minute (legitimate providers retry slowly)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`webhook:${ip}`, { maxRequests: 30, windowMs: 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      { status: 429 },
    );
  }

  const rawBody = await request.text();

  // Verify HMAC signature
  if (!verifyWebhook(rawBody, request)) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid webhook signature' } },
      { status: 401 },
    );
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON' } },
      { status: 400 },
    );
  }

  // Sellf sends events - only process purchase.completed
  if ('event' in raw && raw.event !== 'purchase.completed') {
    return NextResponse.json({ received: true });
  }

  // Normalize payload (Sellf nested → flat)
  const data = normalizePayload(raw);

  // Resolve product action
  const action = getProductAction(data.product);
  if (!action) {
    console.warn(`Webhook: unknown product "${data.product}"`);
    return NextResponse.json({ received: true, warning: 'Unknown product' });
  }

  // Find user
  const user = await resolveUser(data);
  if (!user) {
    console.error(`Webhook: user not found for email "${data.email}"`);
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'User not found' } },
      { status: 404 },
    );
  }

  // Link Sellf customer on first purchase
  if (data.email) {
    await linkSellfCustomer(user.id, data.email).catch(() => {});
  }

  // Idempotency — reject duplicate events
  const reference = data.reference || `${data.product}:${data.email}`;
  try {
    await prisma.webhookEvent.create({ data: { eventId: reference } });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      // Already processed — return 200 so the provider stops retrying
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw e;
  }

  if (action.type === 'tier') {
    await updateUserTier(user.id, action.tier);
    console.log(`Webhook: upgraded ${user.email} to ${action.tier}`);
  } else {
    await addTokens(user.id, action.amount, 'purchase', reference);
    console.log(`Webhook: added ${action.amount} tokens to ${user.email}`);
  }

  return NextResponse.json({
    received: true,
    action: action.type,
    userId: user.id,
  });
}
