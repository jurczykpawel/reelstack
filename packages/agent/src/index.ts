export { produce, produceComposition } from './orchestrator/production-orchestrator';
export { ToolRegistry } from './registry/tool-registry';
export { discoverTools } from './registry/discovery';
export { planProduction, planComposition } from './planner/production-planner';
export { generateAssets } from './orchestrator/asset-generator';
export { assembleComposition } from './orchestrator/composition-assembler';
export { adjustTimeline } from './orchestrator/timeline-adjuster';
export { pollUntilDone } from './polling';
export { AgentError, PlanningError, GenerationError } from './errors';

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
} from './types';

/**
 * Creates a production agent and runs the full pipeline.
 * Convenience wrapper over produce().
 */
export async function createProductionAgent() {
  const { produce: produceFn } = await import('./orchestrator/production-orchestrator');
  return { produce: produceFn };
}
