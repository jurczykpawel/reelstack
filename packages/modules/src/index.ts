/**
 * @reelstack/modules — ReelStack module implementations.
 *
 * Importing this module registers all available modules with the agent registry.
 * The slideshow module is always available (public, open-source).
 * Additional modules (n8n-explainer, ai-tips, presenter-explainer) are loaded
 * from src/private/ if available (private dev environment only).
 */

// Public modules
import './slideshow/module';

// Private modules (optional — only available in dev environments with access)
// Uses dynamic import wrapped in IIFE (Remotion bundler doesn't support top-level await)
(async () => {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const privateEntry = path.join(__dirname, 'private', 'index.ts');
    if (fs.existsSync(privateEntry)) {
      await import(privateEntry);
    }
  } catch {
    // Private modules not available
  }
})();
