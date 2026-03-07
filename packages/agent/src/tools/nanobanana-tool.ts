import { randomUUID } from 'node:crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ProductionTool } from '../registry/tool-interface';
import type { ToolCapability, AssetGenerationRequest, AssetGenerationJob } from '../types';
import { createLogger } from '@reelstack/logger';

const log = createLogger('nanobanana-tool');

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * NanoBanana / Gemini image generation tool.
 * Uses the Gemini API (nano-banana model) to generate images from text prompts.
 */
export class NanoBananaTool implements ProductionTool {
  readonly id = 'nanobanana';
  readonly name = 'NanoBanana (Gemini Image)';
  readonly promptGuidelines = `NanoBanana (Gemini Imagen) prompt guidelines:

KEY INSIGHT: Plain text with structured sections beats vague descriptions. Negative prompts are CRITICAL.

Use structured sections (Wzorzec A — best quality):
\`\`\`
Scene: [brief scene description]
Subject: [who/what, pose, expression, clothing]
Environment: [setting, background, atmosphere]
Lighting: [type, direction, intensity, color temperature]
Camera: [lens mm, framing, focus/DOF]
Negative: [what to avoid]
\`\`\`

Lighting parameters (most impactful field):
- Type: natural | studio | golden hour | neon | dramatic
- Direction: front | side | back | rim
- Intensity: soft / diffused | hard | harsh
- Temperature: warm amber | cool blue | neutral white

Camera parameters:
- Lens: 24mm (wide) | 35mm (street) | 50mm (natural) | 85mm (portrait) | 135mm (telephoto)
- Framing: extreme close-up | close-up | medium shot | wide shot | bird's eye
- Focus: sharp | shallow depth of field (f/1.4–f/2.8) | tilt-shift
- Layout: centered | rule of thirds | symmetrical | negative space on right

Style keywords: "documentary realism" | "lifestyle photography" | "editorial" | "vintage film" | "product shot" | "isometric illustration" | "technical blueprint"

Negative prompt patterns (always include):
- For photos: "blurry, distorted, low quality, text, watermarks, logos, uncanny"
- For clean product shots: "clutter, busy background, harsh shadows, overexposed"
- Add "No text" at the end if no text wanted in frame

Good for: thumbnails, infographics, product shots, title card backgrounds, editorial stills, concept art
Avoid for: logos (use Ideogram instead), animation, video thumbnails with text overlays`;
  readonly capabilities: ToolCapability[] = [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 15_000,
      isAsync: false,
      costTier: 'cheap',
    },
  ];

  private get apiKey(): string | undefined {
    return process.env.NANOBANANA_API_KEY ?? process.env.GEMINI_API_KEY;
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) return { available: false, reason: 'NANOBANANA_API_KEY or GEMINI_API_KEY not set' };
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'API key not set' };
    }

    const prompt = request.prompt ?? request.searchQuery ?? 'abstract colorful background';

    const model = process.env.NANOBANANA_MODEL ?? 'gemini-2.0-flash-exp';
    const aspectRatio = request.aspectRatio === '16:9' ? '16:9'
      : request.aspectRatio === '1:1' ? '1:1'
        : '9:16';

    try {
      const res = await fetch(
        `${GEMINI_API}/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ['IMAGE'],
              imageConfig: {
                aspectRatio,
                imageSize: '1K',
              },
            },
          }),
          signal: AbortSignal.timeout(60_000),
        },
      );

      if (!res.ok) {
        const errBody = await res.text();
        log.warn({ status: res.status, errorPreview: errBody.substring(0, 200) }, 'NanoBanana generate failed');
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `Gemini API error (${res.status})` };
      }

      const data = (await res.json()) as GeminiResponse;

      // Find the image part in the response
      const imagePart = data.candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData?.mimeType?.startsWith('image/'),
      );

      if (!imagePart?.inlineData) {
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'No image in response' };
      }

      // Size limit on base64 data (50MB decoded ~ 68MB base64)
      const MAX_BASE64_LENGTH = 68 * 1024 * 1024;
      if (imagePart.inlineData.data.length > MAX_BASE64_LENGTH) {
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'Image data too large' };
      }

      // Validate MIME type strictly
      const allowedMimes: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
      const ext = allowedMimes[imagePart.inlineData.mimeType];
      if (!ext) {
        log.warn({ mimeType: imagePart.inlineData.mimeType }, 'Unexpected MIME type from Gemini');
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'Invalid image type' };
      }

      // Save to temp file with path traversal guard
      const filename = `nanobanana-${randomUUID()}.${ext}`;
      const tmpPath = path.join(os.tmpdir(), filename);
      const resolved = path.resolve(tmpPath);
      if (!resolved.startsWith(path.resolve(os.tmpdir()))) {
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'Path security violation' };
      }
      fs.writeFileSync(resolved, Buffer.from(imagePart.inlineData.data, 'base64'));

      log.info({ path: tmpPath }, 'NanoBanana image generated');

      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'completed',
        url: tmpPath,
      };
    } catch (err) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `NanoBanana request failed: ${err instanceof Error ? err.message : 'unknown'}` };
    }
  }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType: string;
          data: string;
        };
      }>;
    };
  }>;
}
