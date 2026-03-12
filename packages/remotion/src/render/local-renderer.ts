import path from 'path';
import os from 'os';
import type { RemotionRenderer, RenderOptions, RenderResult } from './types';
import { createLogger } from '@reelstack/logger';

import { fileURLToPath } from 'url';

const log = createLogger('local-renderer');

const __dirname = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const REMOTION_PKG_DIR = path.resolve(__dirname, '../..');

export class LocalRenderer implements RemotionRenderer {
  async render(props: Record<string, unknown>, options: RenderOptions): Promise<RenderResult> {
    // Dynamic imports - these are heavy Node.js modules, avoid bundling at top level
    const { renderMedia, selectComposition } = await import('@remotion/renderer');
    const { mkdirSync, statSync } = await import('fs');

    mkdirSync(path.dirname(options.outputPath), { recursive: true });

    // Use pre-built bundle (Docker / cached) or bundle on the fly via CLI
    let bundlePath = process.env.REMOTION_BUNDLE_PATH;

    if (!bundlePath) {
      // Bundle via Remotion CLI (handles monorepo resolution correctly)
      // Use /tmp to avoid permission issues with read-only package dirs in Docker
      const { execFileSync } = await import('child_process');
      const { existsSync, rmSync } = await import('fs');
      const outDir = path.join(os.tmpdir(), 'remotion-bundle');
      const indexHtml = path.join(outDir, 'index.html');
      if (existsSync(indexHtml)) {
        // Reuse cached bundle from a previous run (index.html = complete bundle)
        bundlePath = outDir;
      } else {
        // Remove incomplete bundle dirs (e.g. from a previous timed-out run)
        // Remotion refuses to bundle into a dir that exists but has no index.html
        if (existsSync(outDir)) {
          rmSync(outDir, { recursive: true, force: true });
        }
        execFileSync('bunx', [
          'remotion', 'bundle', 'src/index.ts',
          '--public-dir', 'public',
          '--out-dir', outDir,
        ], { cwd: REMOTION_PKG_DIR, stdio: 'pipe', timeout: 300_000 });
        bundlePath = outDir;
      }
    }

    const compositionId = options.compositionId ?? 'Reel';
    log.debug({ cwd: process.cwd() }, 'Before selectComposition');

    const composition = await selectComposition({
      serveUrl: bundlePath,
      id: compositionId,
      inputProps: props,
    });

    // Remotion uses min(nproc, os.availableParallelism()) as its max concurrency.
    // nproc respects Docker CPU quota and may be lower than os.cpus().length.
    // We must cap against the same value Remotion uses internally.
    const { execFileSync: _execFileSync } = await import('child_process');
    let remotionMaxCpus: number;
    try {
      remotionMaxCpus = parseInt(_execFileSync('nproc', [], { stdio: 'pipe' }).toString().trim(), 10);
    } catch {
      remotionMaxCpus = os.cpus().length;
    }

    // If concurrency is explicitly set, use it as-is.
    // Only auto-selected values (from env or default) are capped to nproc.
    const concurrency = options.concurrency
      ?? Math.min(
          process.env.REMOTION_CONCURRENCY
            ? parseInt(process.env.REMOTION_CONCURRENCY, 10)
            : Math.max(1, Math.floor(remotionMaxCpus / 2)),
          Math.max(1, remotionMaxCpus),
        );

    log.info({ remotionMaxCpus, concurrency, cwd: process.cwd(), bundlePath }, 'Render config');

    const startMs = performance.now();

    try {
    await renderMedia({
      composition,
      serveUrl: bundlePath,
      codec: options.codec === 'h265' ? 'h265' : 'h264',
      outputLocation: options.outputPath,
      inputProps: props,
      concurrency,
      ...(options.crf !== undefined ? { crf: options.crf } : {}),
    });
    } catch (e) {
      log.error({ err: e }, 'renderMedia error');
      throw e;
    }

    const durationMs = performance.now() - startMs;
    const stats = statSync(options.outputPath);

    return {
      outputPath: options.outputPath,
      sizeBytes: stats.size,
      durationMs,
    };
  }
}
