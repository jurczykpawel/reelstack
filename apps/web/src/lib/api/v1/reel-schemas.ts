import { z } from 'zod';

/**
 * Validates callback URLs. Only HTTPS allowed in production (prevents SSRF to internal services).
 * HTTP allowed in development for local testing.
 */
/**
 * Check if a hostname is a private/internal IP (IPv4 or IPv6).
 * Blocks: loopback, private ranges, link-local, IPv4-mapped IPv6.
 */
function isPrivateHost(hostname: string): boolean {
  // Strip IPv6 brackets
  const host = hostname.replace(/^\[|\]$/g, '');

  // Block known internal hostnames
  const blocked = ['localhost', 'metadata.google.internal', 'metadata.google', 'kubernetes.default'];
  if (blocked.some((b) => host === b || host.endsWith(`.${b}`))) return true;

  // IPv6 checks (::1, fe80::, fc00::, fd00::, ::ffff:x.x.x.x mapped)
  if (host.includes(':')) {
    // Loopback
    if (host === '::1' || host === '::') return true;
    // Link-local (fe80::)
    if (host.toLowerCase().startsWith('fe80:')) return true;
    // Unique local (fc00::/7 = fc00:: and fd00::)
    if (/^f[cd]/i.test(host)) return true;
    // IPv4-mapped IPv6 (::ffff:x.x.x.x) - extract IPv4 and check
    const v4Match = host.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (v4Match) return isPrivateIPv4(v4Match[1]);
    // IPv4-mapped IPv6 in hex form (::ffff:7f00:1) - URL parser converts dotted to hex
    const v4HexMatch = host.match(/::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (v4HexMatch) {
      const hi = parseInt(v4HexMatch[1], 16);
      const lo = parseInt(v4HexMatch[2], 16);
      const ip = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      return isPrivateIPv4(ip);
    }
    // Any other IPv6 with embedded IPv4
    const embeddedV4 = host.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (embeddedV4) return isPrivateIPv4(embeddedV4[1]);
    return false;
  }

  // IPv4 checks
  return isPrivateIPv4(host);
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length === 1) {
    // Single decimal/hex number (e.g. 2130706433 = 127.0.0.1, 0x7f000001)
    const num = Number(ip);
    if (isNaN(num) || num < 0 || num > 0xffffffff) return false;
    const a = (num >>> 24) & 0xff;
    const b = (num >>> 16) & 0xff;
    return checkPrivateOctets(a, b);
  }
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return false;
  return checkPrivateOctets(parts[0], parts[1]);
}

function checkPrivateOctets(a: number, b: number): boolean {
  if (a === 127) return true;                         // 127.0.0.0/8
  if (a === 10) return true;                          // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
  if (a === 192 && b === 168) return true;             // 192.168.0.0/16
  if (a === 169 && b === 254) return true;             // 169.254.0.0/16
  if (a === 0) return true;                            // 0.0.0.0/8
  return false;
}

const callbackUrlSchema = z.string().url().max(2048).refine(
  (url) => {
    try {
      const parsed = new URL(url);
      // Only HTTP(S) protocols
      if (!['http:', 'https:'].includes(parsed.protocol)) return false;
      // In production, require HTTPS
      if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') return false;
      // Block URLs with credentials (user:pass@host)
      if (parsed.username || parsed.password) return false;
      // Block private/internal hosts
      if (isPrivateHost(parsed.hostname)) return false;
      return true;
    } catch { return false; }
  },
  { message: 'Callback URL must be a valid public HTTPS URL' },
);

const SUPPORTED_LANGUAGES = [
  'pl', 'en', 'es', 'de', 'fr', 'it', 'pt', 'nl', 'ru', 'uk', 'cs', 'sk',
  'ja', 'ko', 'zh', 'ar', 'hi', 'sv', 'da', 'no', 'fi', 'hu', 'ro', 'bg',
  'hr', 'sr', 'sl', 'tr', 'vi', 'th',
] as const;

export const createReelSchema = z.object({
  script: z.string().min(1).max(10000),
  layout: z.enum(['split-screen', 'fullscreen', 'picture-in-picture']).default('fullscreen'),
  style: z.enum(['dynamic', 'calm', 'cinematic', 'educational']).optional(),
  tts: z.object({
    provider: z.enum(['edge-tts', 'elevenlabs', 'openai']).default('edge-tts'),
    voice: z.string().optional(),
    language: z.string().default('pl-PL'),
  }).optional(),
  primaryVideoUrl: z.string().url().optional(),
  secondaryVideoUrl: z.string().url().optional(),
  brandPreset: z.object({
    captionTemplate: z.string().optional(),
    highlightColor: z.string().optional(),
    backgroundColor: z.string().optional(),
    defaultTransition: z.enum(['crossfade', 'slide-left', 'slide-right', 'zoom-in', 'wipe', 'none']).optional(),
  }).optional(),
  callbackUrl: callbackUrlSchema.optional(),
});

/** Batch reel creation - up to 20 reels per request */
export const batchReelSchema = z.object({
  reels: z.array(createReelSchema).min(1).max(20),
  callbackUrl: callbackUrlSchema.optional(),
});

/** Multi-language reel - same script translated into multiple languages */
export const multiLangReelSchema = z.object({
  script: z.string().min(1).max(10000),
  sourceLanguage: z.enum(SUPPORTED_LANGUAGES).default('pl'),
  targetLanguages: z.array(z.enum(SUPPORTED_LANGUAGES)).min(1).max(10)
    .refine((arr) => new Set(arr).size === arr.length, { message: 'Duplicate languages not allowed' }),
  layout: z.enum(['split-screen', 'fullscreen', 'picture-in-picture']).default('fullscreen'),
  style: z.enum(['dynamic', 'calm', 'cinematic', 'educational']).optional(),
  tts: z.object({
    provider: z.enum(['edge-tts', 'elevenlabs', 'openai']).default('edge-tts'),
    voice: z.string().optional(),
  }).optional(),
  primaryVideoUrl: z.string().url().optional(),
  secondaryVideoUrl: z.string().url().optional(),
  brandPreset: z.object({
    captionTemplate: z.string().optional(),
    highlightColor: z.string().optional(),
    backgroundColor: z.string().optional(),
    defaultTransition: z.enum(['crossfade', 'slide-left', 'slide-right', 'zoom-in', 'wipe', 'none']).optional(),
  }).optional(),
  callbackUrl: callbackUrlSchema.optional(),
});

export const publishReelSchema = z.object({
  reelId: z.string().uuid(),
  platforms: z.array(z.enum(['tiktok', 'instagram', 'youtube-shorts', 'facebook', 'linkedin', 'x'])).min(1),
  caption: z.string().min(1).max(5000),
  hashtags: z.array(z.string()).max(30).optional(),
  scheduleDate: z.string().datetime().optional(),
});
