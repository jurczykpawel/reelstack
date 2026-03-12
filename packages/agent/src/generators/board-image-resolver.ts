/**
 * Resolves board image specs into actual image URLs.
 * Supports: AI generation, web image search, screenshots, infographics.
 *
 * Dependencies are injected for testability - the orchestrator provides
 * concrete implementations (fal/replicate for AI gen, Playwright for screenshots, etc.)
 */
import type { BoardImageSpec } from './presenter-script-generator';

export interface BoardImageResolverDeps {
  generateImage: (prompt: string) => Promise<string>;
  searchImage: (query: string) => Promise<string>;
  takeScreenshot: (url: string) => Promise<string>;
}

/**
 * Resolve a single board image spec into a URL.
 * Falls back to AI generation when the preferred method lacks required data.
 */
export async function resolveBoardImage(
  spec: BoardImageSpec,
  deps: BoardImageResolverDeps,
): Promise<string> {
  switch (spec.type) {
    case 'ai-gen':
      return deps.generateImage(spec.prompt ?? 'abstract technology illustration');

    case 'web-search':
      if (spec.searchQuery) {
        return deps.searchImage(spec.searchQuery);
      }
      // Fallback to AI gen if no search query
      return deps.generateImage(spec.prompt ?? 'abstract technology illustration');

    case 'screenshot':
      if (spec.url) {
        return deps.takeScreenshot(spec.url);
      }
      // Fallback to AI gen if no URL
      return deps.generateImage(spec.prompt ?? 'software screenshot illustration');

    case 'infographic':
      // Infographics are generated as AI images with structured prompts
      return deps.generateImage(spec.prompt ?? 'clean data infographic');

    default:
      return deps.generateImage(spec.prompt ?? 'abstract technology illustration');
  }
}
