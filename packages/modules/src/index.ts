/**
 * @reelstack/modules — ReelStack module implementations.
 *
 * Importing this module registers all available modules with the agent registry.
 * The slideshow module is always available (public, open-source).
 * Additional modules (n8n-explainer, ai-tips, presenter-explainer) are loaded
 * from src/private/ if available (private dev environment only).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Public modules
import './slideshow/module';

// Private modules (optional — only available in dev environments with access)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const privateEntry = path.join(__dirname, 'private', 'index.ts');
if (fs.existsSync(privateEntry)) {
  await import(privateEntry);
}
