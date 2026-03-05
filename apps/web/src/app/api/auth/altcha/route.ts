import { NextRequest, NextResponse } from 'next/server';
import { createChallenge, verifySolution } from 'altcha-lib';

const ALTCHA_HMAC_KEY = process.env.ALTCHA_HMAC_KEY ?? process.env.AUTH_SECRET ?? 'altcha-fallback-key';

/** GET /api/auth/altcha — Generate a new proof-of-work challenge */
export async function GET() {
  const challenge = await createChallenge({
    hmacKey: ALTCHA_HMAC_KEY,
    maxNumber: 50_000, // ~1s on modern hardware
  });
  return NextResponse.json(challenge);
}

/** POST /api/auth/altcha — Verify a solved challenge */
export async function POST(req: NextRequest) {
  const { payload } = await req.json().catch(() => ({ payload: null }));
  if (!payload) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const ok = await verifySolution(payload, ALTCHA_HMAC_KEY);
  return NextResponse.json({ ok });
}
