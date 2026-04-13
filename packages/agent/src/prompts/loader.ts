/**
 * Template and partial loader for LLM prompts.
 *
 * Loads .md files from the templates/, partials/, and guidelines/ directories.
 * Caches file contents in memory (prompts don't change at runtime).
 */
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const PROMPTS_DIR = resolve(__dirname);

const cache = new Map<string, string>();

function loadFile(filePath: string): string {
  const cached = cache.get(filePath);
  if (cached !== undefined) return cached;

  const content = readFileSync(filePath, 'utf-8');
  cache.set(filePath, content);
  return content;
}

/** Load a template by name (e.g. "planner" → templates/planner.md). */
export function loadTemplate(name: string): string {
  return loadFile(join(PROMPTS_DIR, 'templates', `${name}.md`));
}

/** Load a partial by name (e.g. "rules-hook" → partials/rules-hook.md). */
export function loadPartial(name: string): string {
  return loadFile(join(PROMPTS_DIR, 'partials', `${name}.md`));
}

/** Load a guideline by name (e.g. "seedance" → guidelines/seedance.md). */
export function loadGuideline(name: string): string {
  return loadFile(join(PROMPTS_DIR, 'guidelines', `${name}.md`));
}

/**
 * Load all partials from the partials/ directory.
 * Returns a Record<name, content> suitable for renderTemplate().
 */
export function loadAllPartials(): Record<string, string> {
  const { readdirSync } = require('fs') as typeof import('fs');
  const partialsDir = join(PROMPTS_DIR, 'partials');

  const partials: Record<string, string> = {};
  for (const file of readdirSync(partialsDir)) {
    if (!file.endsWith('.md')) continue;
    const name = file.replace(/\.md$/, '');
    partials[name] = loadFile(join(partialsDir, file));
  }
  return partials;
}

/** Clear the file cache (useful for tests). */
export function clearCache(): void {
  cache.clear();
}
