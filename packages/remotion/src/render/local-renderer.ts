import path from 'path';
import os from 'os';
import type { RemotionRenderer, RenderOptions, RenderResult } from './types';

import { fileURLToPath } from 'url';

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
      const { execSync } = await import('child_process');
      const outDir = path.join(os.tmpdir(), 'remotion-bundle');
      execSync(
        `bunx remotion bundle src/index.ts --public-dir public --out-dir "${outDir}"`,
        { cwd: REMOTION_PKG_DIR, stdio: 'pipe', timeout: 120_000 },
      );
      bundlePath = outDir;
    }

    const compositionId = options.compositionId ?? 'Reel';

    const composition = await selectComposition({
      serveUrl: bundlePath,
      id: compositionId,
      inputProps: props,
    });

    const cpuCount = os.cpus().length;
    const concurrency = options.concurrency
      ?? (process.env.REMOTION_CONCURRENCY
        ? parseInt(process.env.REMOTION_CONCURRENCY, 10)
        : Math.max(1, Math.floor(cpuCount / 2)));

    const startMs = performance.now();

    await renderMedia({
      composition,
      serveUrl: bundlePath,
      codec: options.codec === 'h265' ? 'h265' : 'h264',
      outputLocation: options.outputPath,
      inputProps: props,
      concurrency,
      ...(options.crf !== undefined ? { crf: options.crf } : {}),
    });

    const durationMs = performance.now() - startMs;
    const stats = statSync(options.outputPath);

    return {
      outputPath: options.outputPath,
      sizeBytes: stats.size,
      durationMs,
    };
  }
}
