/**
 * Builds video generation prompts from ai-tips specs.
 * Optimized per provider (Veo, Kling, Seedance) for best results.
 *
 * All prompts enforce: Pixar 3D style, closed mouth, correct aspect ratio,
 * appropriate emotion and scenery.
 */
import type { AiTip } from './ai-tips-script-generator';

export interface PromptBuilderOptions {
  provider?: string;
  aspectRatio?: '9:16' | '16:9' | '1:1';
}

/**
 * Build a video generation prompt for a single tip.
 * The prompt describes the visual scene - the dialog is handled by captions overlay.
 */
export function buildVideoPrompt(tip: AiTip, options?: PromptBuilderOptions): string {
  const provider = options?.provider ?? 'default';
  const aspectRatio = options?.aspectRatio ?? '9:16';

  const orientationHint = aspectRatio === '9:16' ? 'vertical portrait composition (9:16)'
    : aspectRatio === '16:9' ? 'horizontal landscape composition (16:9)'
      : 'square composition (1:1)';

  const core = [
    `Pixar-style 3D animated ${tip.object} with big expressive eyes`,
    `${tip.emotion} expression, mouth closed, not speaking`,
    `subtle idle animation (gentle swaying, blinking, looking around)`,
    `${tip.scenery}`,
    `${orientationHint}`,
    `cinematic lighting, shallow depth of field, 4K quality`,
  ];

  if (provider === 'veo3') {
    // Veo prefers natural language descriptions
    return `A cute Pixar-style 3D animated ${tip.object} sits in a ${tip.scenery}. ` +
      `The ${tip.object} has big expressive cartoon eyes and looks ${tip.emotion}, with its mouth closed. ` +
      `It gently sways and blinks, showing personality through subtle body language. ` +
      `${orientationHint}. Cinematic lighting, shallow depth of field, warm color palette. ` +
      `Camera: static medium shot, centered on the ${tip.object}. ` +
      `Style: Pixar 3D animation, high detail, photorealistic textures on the object.`;
  }

  if (provider === 'kling') {
    // Kling works well with structured prompts
    return [
      `Subject: Pixar 3D animated ${tip.object} with big cartoon eyes, ${tip.emotion} expression, mouth closed`,
      `Action: gentle idle animation, subtle swaying, occasional blinking`,
      `Setting: ${tip.scenery}`,
      `Camera: static medium shot, ${orientationHint}`,
      `Style: Pixar 3D animation, cinematic lighting, shallow depth of field, 4K`,
      `Negative: realistic human, text, watermark, low quality, mouth open, talking`,
    ].join('. ');
  }

  // Default / Seedance - comma-separated keywords work well
  return core.join(', ') + '. Negative: realistic human, text, watermark, low quality, mouth open, talking.';
}
