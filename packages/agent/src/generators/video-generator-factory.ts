/**
 * Factory for creating VideoGenerator instances from available production tools.
 * Selects the best available video generation provider based on env vars and preferences.
 */
import { ToolRegistry } from '../registry/tool-registry';
import { discoverTools } from '../registry/discovery';
import { createVideoGenerator } from './video-generator';
import type { VideoGenerator, VideoGeneratorOptions } from './video-generator';

/** Provider preference order (best quality/features first) */
const DEFAULT_PREFERENCE = ['veo3', 'kling', 'seedance'] as const;

export interface VideoGeneratorFactoryOptions extends VideoGeneratorOptions {
  /** Preferred provider order (default: veo3 > kling > seedance) */
  preferredProviders?: readonly string[];
}

/**
 * Create the best available VideoGenerator.
 * Discovers tools, runs health checks, and returns the first available provider.
 * Throws if no video generation tool is available.
 */
export async function createBestVideoGenerator(
  options?: VideoGeneratorFactoryOptions,
): Promise<VideoGenerator> {
  const registry = new ToolRegistry();
  for (const tool of discoverTools()) {
    registry.register(tool);
  }
  await registry.discover();

  const preference = options?.preferredProviders ?? DEFAULT_PREFERENCE;
  const manifest = registry.getToolManifest();

  for (const providerId of preference) {
    const entry = manifest.tools.find(t => t.id === providerId && t.available);
    if (entry) {
      const tool = registry.get(providerId);
      if (tool) {
        return createVideoGenerator(tool, options);
      }
    }
  }

  const available = manifest.tools.filter(t => t.available).map(t => t.id);
  throw new Error(
    `No video generation tool available. Checked: ${[...preference].join(', ')}. Available tools: ${available.join(', ') || 'none'}`,
  );
}
