/**
 * Module system barrel file.
 *
 * Exports the registry API and registers all built-in modules.
 *
 * When modules are extracted to a closed repo, this file will only
 * export the registry API. Module registration will happen in the
 * consuming app (e.g., worker) via explicit imports:
 *
 *   import '@reelstack-modules/n8n-explainer'; // self-registers
 *   import '@reelstack-modules/ai-tips';       // self-registers
 */

// Re-export registry API
export {
  registerModule,
  getModule,
  listModules,
  isModuleMode,
  isCoreMode,
  CORE_MODES,
} from './module-registry';

// Re-export types
export type {
  ReelModule,
  BaseModuleRequest,
  ModuleResult,
  ProgressCallback,
} from './module-interface';

// ── Built-in module registration ──────────────────────────────
// These imports will be removed when modules move to closed repos.

import { registerModule } from './module-registry';
import { n8nExplainerModule } from './n8n-explainer-module';
import { aiTipsModule } from './ai-tips-module';
import { presenterExplainerModule } from './presenter-explainer-module';

registerModule(n8nExplainerModule);
registerModule(aiTipsModule);
registerModule(presenterExplainerModule);
