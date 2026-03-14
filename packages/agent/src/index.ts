// ── Core orchestration ────────────────────────────────────────
export { produce, produceComposition } from './orchestrator/production-orchestrator';
export {
  buildTimingReference,
  resolvePresetConfig,
  runTTSPipeline,
  uploadVoiceover,
  renderVideo,
} from './orchestrator/base-orchestrator';
export type { TTSPipelineResult, TTSPipelineInput, RenderResult } from './orchestrator/base-orchestrator';
export { createVideoGenerator } from './generators/video-generator';
export { createBestVideoGenerator } from './generators/video-generator-factory';
export type { VideoGenerator, VideoGeneratorInput, VideoGeneratorResult, VideoGeneratorOptions } from './generators/video-generator';
export type { VideoGeneratorFactoryOptions } from './generators/video-generator-factory';
export { callLLM, callLLMWithSystem, detectProvider } from './llm';
export type { LLMProvider } from './llm';
export { ToolRegistry } from './registry/tool-registry';
export { discoverTools } from './registry/discovery';
export { planProduction, planComposition, revisePlan } from './planner/production-planner';
export { selectMontageProfile, buildProfileGuidelines, buildProfileSupervisorChecks } from './planner/montage-profile';
export { generateAssets } from './orchestrator/asset-generator';
export { assembleComposition } from './orchestrator/composition-assembler';
export { adjustTimeline } from './orchestrator/timeline-adjuster';
export { pollUntilDone } from './polling';
export { AgentError, PlanningError, GenerationError } from './errors';

// ── Module system ─────────────────────────────────────────────
// Import modules/index to trigger built-in module registration.
// When modules move to closed repos, remove this import and let
// the consuming app import modules explicitly.
export {
  registerModule,
  getModule,
  listModules,
  isModuleMode,
  isCoreMode,
  CORE_MODES,
} from './modules';
export type {
  ReelModule,
  BaseModuleRequest,
  ModuleResult,
  ProgressCallback,
} from './modules';

// ── Legacy direct exports (kept for backwards compatibility) ──
// These re-export from module orchestrators directly.
// Prefer using the module registry via getModule('n8n-explainer') etc.
export { produceN8nExplainer } from './orchestrator/n8n-explainer-orchestrator';
export type { N8nExplainerRequest, N8nExplainerResult } from './orchestrator/n8n-explainer-orchestrator';
export { produceAiTips } from './orchestrator/ai-tips-orchestrator';
export type { AiTipsRequest, AiTipsResult } from './orchestrator/ai-tips-orchestrator';
export { producePresenterExplainer } from './orchestrator/presenter-explainer-orchestrator';
export type { PresenterExplainerRequest, PresenterExplainerResult } from './orchestrator/presenter-explainer-orchestrator';

// ── Types ─────────────────────────────────────────────────────
export type { ProductionTool } from './registry/tool-interface';
export type {
  ProductionRequest,
  ComposeRequest,
  UserAsset,
  ProductionResult,
  ProductionPlan,
  ProductionStep,
  ShotPlan,
  EffectPlan,
  GeneratedAsset,
  AssetType,
  AssetGenerationRequest,
  AssetGenerationJob,
  AssetGenerationStatus,
  ToolCapability,
  ToolManifest,
  ToolManifestEntry,
  CostTier,
  BrandPreset,
} from './types';

/**
 * Creates a production agent and runs the full pipeline.
 * Convenience wrapper over produce().
 */
export async function createProductionAgent() {
  const { produce: produceFn } = await import('./orchestrator/production-orchestrator');
  return { produce: produceFn };
}
