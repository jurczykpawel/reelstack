import { randomUUID } from 'node:crypto';
import type { ProductionTool } from '../registry/tool-interface';
import type { ToolCapability, AssetGenerationRequest, AssetGenerationJob } from '../types';
import { isPublicUrl } from '../planner/production-planner';
import { PEXELS_GUIDELINES } from './prompt-guidelines';

const PEXELS_API = 'https://api.pexels.com';

/**
 * Stock footage tool wrapping the Pexels API.
 * Supports both video and image search.
 */
export class PexelsTool implements ProductionTool {
  readonly id = 'pexels';
  readonly name = 'Pexels Stock';
  readonly promptGuidelines = PEXELS_GUIDELINES;
  readonly capabilities: ToolCapability[] = [
    {
      assetType: 'stock-video',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 2000,
      isAsync: false,
      costTier: 'free',
    },
    {
      assetType: 'stock-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 2000,
      isAsync: false,
      costTier: 'free',
    },
  ];

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) return { available: false, reason: 'PEXELS_API_KEY not set' };

    try {
      const res = await fetch(`${PEXELS_API}/videos/search?query=test&per_page=1`, {
        headers: { Authorization: apiKey },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok
        ? { available: true }
        : { available: false, reason: `Pexels API returned ${res.status}` };
    } catch (err) {
      return { available: false, reason: `Pexels unreachable: ${err instanceof Error ? err.message : 'unknown'}` };
    }
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'PEXELS_API_KEY not set' };
    }

    const query = request.searchQuery || request.prompt || 'abstract';
    const isVideo = !request.searchQuery?.includes('image:');

    const url = isVideo
      ? `${PEXELS_API}/videos/search?query=${encodeURIComponent(query)}&per_page=1&orientation=portrait`
      : `${PEXELS_API}/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=portrait`;

    const res = await fetch(url, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `Pexels ${res.status}` };
    }

    const data = await res.json();

    if (isVideo) {
      const video = (data as PexelsVideoResponse).videos?.[0];
      const file = video?.video_files
        ?.filter((f) => f.width && f.width <= 1080)
        .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]
        ?? video?.video_files?.[0];

      if (!file?.link || !isPublicUrl(file.link)) {
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'No valid video results' };
      }

      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'completed',
        url: file.link,
        durationSeconds: video?.duration,
      };
    }

    const photo = (data as PexelsPhotoResponse).photos?.[0];
    const photoUrl = photo?.src.large2x ?? photo?.src.large;
    if (!photoUrl || !isPublicUrl(photoUrl)) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'No valid image results' };
    }

    return {
      jobId: randomUUID(),
      toolId: this.id,
      status: 'completed',
      url: photoUrl,
    };
  }
}

interface PexelsVideoResponse {
  videos: Array<{
    duration: number;
    video_files: Array<{ link: string; width?: number; height?: number }>;
  }>;
}

interface PexelsPhotoResponse {
  photos: Array<{ src: { large2x: string; large: string } }>;
}
