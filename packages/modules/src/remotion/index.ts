/**
 * Remotion composition registration barrel.
 *
 * Registers the public slideshow composition, plus any private
 * compositions if available.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Public compositions
import '../slideshow/remotion/index';

// Private compositions (optional)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const privateEntry = path.join(__dirname, '..', 'private', 'remotion', 'index.ts');
if (fs.existsSync(privateEntry)) {
  await import(privateEntry);
}
