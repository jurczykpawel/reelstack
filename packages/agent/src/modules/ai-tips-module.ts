/**
 * ai-tips module descriptor.
 *
 * Wraps the ai-tips orchestrator as a ReelModule.
 */

import type { ReelModule, BaseModuleRequest, ModuleResult } from './module-interface';
import { produceAiTips } from '../orchestrator/ai-tips-orchestrator';
import { callLLM } from '../llm';
import { createBestVideoGenerator } from '../generators/video-generator-factory';

export const aiTipsModule: ReelModule = {
  id: 'ai-tips',
  name: 'AI Tips (Talking Objects)',
  compositionId: 'VideoClip',

  configFields: [
    { name: 'topic', type: 'string', required: true, description: 'Topic for tips generation' },
    { name: 'numberOfTips', type: 'number', required: false, description: 'Number of tips (default: 5)' },
    { name: 'variant', type: 'string', required: false, description: 'multi-object | single-object | cutaway-demo' },
    { name: 'provider', type: 'string', required: false, description: 'Video gen provider override' },
  ],

  progressSteps: {
    'Generating ai-tips script...': 5,
    'Generating video clips...': 15,
    'Clip': 30,
    'Generating voiceover...': 50,
    'Transcribing audio...': 60,
    'Assembling composition...': 70,
    'Rendering video...': 80,
  },

  async orchestrate(
    base: BaseModuleRequest,
    config: Record<string, unknown>,
  ): Promise<ModuleResult> {
    const videoGenerator = await createBestVideoGenerator();

    const result = await produceAiTips({
      jobId: base.jobId,
      topic: config.topic as string,
      language: base.language,
      numberOfTips: config.numberOfTips as number | undefined,
      variant: config.variant as 'multi-object' | 'single-object' | 'cutaway-demo' | undefined,
      provider: config.provider as string | undefined,
      tts: base.tts,
      whisper: base.whisper,
      brandPreset: base.brandPreset,
      llmCall: callLLM,
      videoGenerator,
      musicUrl: base.musicUrl,
      musicVolume: base.musicVolume,
      onProgress: base.onProgress,
    });

    return {
      outputPath: result.outputPath,
      durationSeconds: result.durationSeconds,
      meta: {
        tips: result.script.tips.length,
      },
    };
  },
};
