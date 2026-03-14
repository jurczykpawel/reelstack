/**
 * n8n-explainer module descriptor.
 *
 * Wraps the n8n-explainer orchestrator as a ReelModule.
 * When extracted to a closed repo, this file + the generators/ and
 * orchestrator files move together.
 */

import type { ReelModule, BaseModuleRequest, ModuleResult } from './module-interface';
import { produceN8nExplainer } from '../orchestrator/n8n-explainer-orchestrator';
import { callLLM } from '../llm';

export const n8nExplainerModule: ReelModule = {
  id: 'n8n-explainer',
  name: 'n8n Workflow Explainer',
  compositionId: 'ScreenExplainer',

  configFields: [
    { name: 'workflowUrl', type: 'string', required: true, description: 'n8n.io workflow URL or ID' },
  ],

  progressSteps: {
    'Fetching n8n workflow...': 5,
    'Generating narration script...': 15,
    'Generating workflow diagrams...': 25,
    'Generating voiceover...': 35,
    'Transcribing audio...': 50,
    'Assembling composition...': 65,
    'Rendering video...': 75,
  },

  async orchestrate(
    base: BaseModuleRequest,
    config: Record<string, unknown>,
  ): Promise<ModuleResult> {
    const result = await produceN8nExplainer({
      jobId: base.jobId,
      workflowUrl: config.workflowUrl as string,
      language: base.language,
      tts: base.tts,
      whisper: base.whisper,
      brandPreset: base.brandPreset,
      llmCall: callLLM,
      onProgress: base.onProgress,
    });

    return {
      outputPath: result.outputPath,
      durationSeconds: result.durationSeconds,
      meta: {
        workflowName: result.workflow.name,
        sections: result.script.sections.length,
      },
    };
  },
};
