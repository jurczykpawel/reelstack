/**
 * Remotion module registration barrel.
 *
 * Imports trigger self-registration of module compositions.
 * When modules are extracted to closed repos, remove these imports.
 * The consuming app will import from external packages instead:
 *
 *   import '@reelstack-modules/n8n-explainer/remotion';
 *   import '@reelstack-modules/ai-tips/remotion';
 */

import './n8n-explainer';
import './ai-tips';
import './presenter-explainer';
