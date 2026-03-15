/**
 * Remotion composition registration barrel.
 *
 * Registers the public slideshow composition, plus any private
 * compositions if available.
 */

// Public compositions
import '../slideshow/remotion/index';

// Private compositions (optional)
// Uses IIFE — Remotion bundler (esbuild for chrome85) doesn't support top-level await
(async () => {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const privateEntry = path.join(__dirname, '..', 'private', 'remotion', 'index.ts');
    if (fs.existsSync(privateEntry)) {
      await import(privateEntry);
    }
  } catch {
    // Private compositions not available
  }
})();
