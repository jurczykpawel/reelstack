/**
 * presenter-explainer module descriptor.
 *
 * Wraps the presenter-explainer orchestrator as a ReelModule.
 */

import type { ReelModule, BaseModuleRequest, ModuleResult } from './module-interface';
import { producePresenterExplainer } from '../orchestrator/presenter-explainer-orchestrator';
import { callLLM } from '../llm';
import { createBestVideoGenerator } from '../generators/video-generator-factory';
import { createLogger } from '@reelstack/logger';

const log = createLogger('presenter-explainer-module');

export const presenterExplainerModule: ReelModule = {
  id: 'presenter-explainer',
  name: 'Presenter Explainer (Avatar + Board)',
  compositionId: 'PresenterExplainer',

  configFields: [
    { name: 'topic', type: 'string', required: true, description: 'Topic for the explainer' },
    { name: 'persona', type: 'string', required: false, description: 'Presenter persona name' },
    { name: 'style', type: 'string', required: false, description: 'aggressive-funny | edu-casual | sarcastic-expert | hype-energy' },
    { name: 'targetDuration', type: 'number', required: false, description: 'Target duration in seconds' },
  ],

  progressSteps: {
    'Generating presenter script...': 5,
    'Generating board images': 15,
    'Board image': 25,
    'Generating voiceover...': 40,
    'Transcribing audio...': 55,
    'Assembling composition...': 70,
    'Rendering video...': 80,
  },

  async orchestrate(
    base: BaseModuleRequest,
    config: Record<string, unknown>,
  ): Promise<ModuleResult> {
    const videoGenerator = await createBestVideoGenerator();

    // Board image resolver deps - use AI generation for now
    const imageResolverDeps = {
      generateImage: async (prompt: string) => {
        const result = await videoGenerator.generate({
          prompt,
          duration: 1,
          aspectRatio: '9:16',
        });
        return result.videoUrl;
      },
      searchImage: async (query: string) => {
        const result = await videoGenerator.generate({
          prompt: query,
          duration: 1,
          aspectRatio: '9:16',
        });
        return result.videoUrl;
      },
      takeScreenshot: async (url: string) => {
        log.warn({ url }, 'Screenshot not yet implemented, using placeholder');
        return '';
      },
    };

    const result = await producePresenterExplainer({
      jobId: base.jobId,
      topic: config.topic as string,
      persona: config.persona as string | undefined,
      style: config.style as 'aggressive-funny' | 'edu-casual' | 'sarcastic-expert' | 'hype-energy' | undefined,
      language: base.language,
      targetDuration: config.targetDuration as number | undefined,
      tts: base.tts,
      whisper: base.whisper,
      brandPreset: base.brandPreset,
      llmCall: callLLM,
      videoGenerator,
      imageResolverDeps,
      musicUrl: base.musicUrl,
      musicVolume: base.musicVolume,
      onProgress: base.onProgress,
    });

    return {
      outputPath: result.outputPath,
      durationSeconds: result.durationSeconds,
      meta: {
        sections: result.script.sections.length,
      },
    };
  },
};
