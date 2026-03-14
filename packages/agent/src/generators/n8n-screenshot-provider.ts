/**
 * Screenshot provider interface for n8n workflow screenshots.
 *
 * Strategy pattern: swap implementations without changing the pipeline.
 * - N8nLocalDockerProvider: 4K screenshots from local n8n Docker (recommended)
 * - N8nPublicPageProvider: screenshots from n8n.io public workflow pages (low-res fallback)
 */

import type { N8nWorkflow } from './n8n-workflow-fetcher';

export interface CaptureOptions {
  /** Viewport width for the screenshot (default: 3840 for local, 1920 for public) */
  width?: number;
  /** Viewport height for the screenshot (default: 2160 for local, 1080 for public) */
  height?: number;
  /** Device scale factor for high-res (default: 1 for local 4K, 4 for public) */
  deviceScaleFactor?: number;
  /** Timeout in ms (default: 30000) */
  timeout?: number;
}

export interface ScreenshotResult {
  /** PNG image as Buffer */
  buffer: Buffer;
  /** Pixel width of the captured image */
  width: number;
  /** Pixel height of the captured image */
  height: number;
}

/**
 * Interface for capturing n8n workflow screenshots.
 * Implementations handle browser automation details.
 */
export interface N8nScreenshotProvider {
  capture(workflow: N8nWorkflow, options?: CaptureOptions): Promise<ScreenshotResult>;
}

// ── Local n8n Docker implementation (recommended) ────────────

export interface N8nLocalDockerConfig {
  /** n8n instance URL (default: N8N_BASE_URL env or http://localhost:5678) */
  baseUrl?: string;
  /** Login email (default: N8N_EMAIL env) */
  email?: string;
  /** Login password (default: N8N_PASSWORD env) */
  password?: string;
}

const LOCAL_DEFAULTS = {
  width: 3840,
  height: 2160,
  deviceScaleFactor: 1,
  timeout: 30_000,
};

/** CSS to hide all n8n UI chrome and make the canvas fullscreen. */
const HIDE_CHROME_CSS = `
  header, nav, aside, [class*="sidebar"], [class*="header"], [class*="panel"],
  [class*="minimap"], [class*="Minimap"], [class*="chat"], [class*="Chat"],
  [class*="execution"], [class*="run-data"], [data-test-id="canvas-controls"],
  [data-test-id="node-creator-button"], [class*="modal"], [class*="dialog"],
  [class*="overlay"], [class*="toast"], [role="dialog"], [class*="controls"],
  [class*="Controls"], [class*="banner"], [class*="Banner"],
  [class*="trigger-placeholder"] {
    display: none !important;
  }
  .vue-flow {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
  }
`;

/**
 * Captures 4K workflow screenshots from a local n8n Docker instance.
 *
 * Flow: sign in → create workflow → paste nodes via clipboard → hide chrome → zoom to fit → screenshot.
 * Produces 3840x2160 screenshots (5.4x more pixels than n8n.io's fixed 709x520 canvas).
 */
export class N8nLocalDockerProvider implements N8nScreenshotProvider {
  private readonly baseUrl: string;
  private readonly email: string;
  private readonly password: string;

  constructor(config?: N8nLocalDockerConfig) {
    this.baseUrl = config?.baseUrl ?? process.env.N8N_BASE_URL ?? 'http://localhost:5678';
    this.email = config?.email ?? process.env.N8N_EMAIL ?? '';
    this.password = config?.password ?? process.env.N8N_PASSWORD ?? '';
    if (!this.email || !this.password) {
      throw new Error('N8nLocalDockerProvider requires email and password (via config or N8N_EMAIL/N8N_PASSWORD env vars)');
    }
  }

  async capture(workflow: N8nWorkflow, options?: CaptureOptions): Promise<ScreenshotResult> {
    const opts = { ...LOCAL_DEFAULTS, ...options };
    const { chromium } = await import('playwright');

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: opts.width, height: opts.height },
        deviceScaleFactor: opts.deviceScaleFactor,
        permissions: ['clipboard-read', 'clipboard-write'],
      });
      const page = await context.newPage();

      // ── Sign in ──────────────────────────────────────────────
      await page.goto(`${this.baseUrl}/signin`, {
        waitUntil: 'networkidle',
        timeout: opts.timeout,
      });
      await page.fill('#emailOrLdapLoginId', this.email);
      await page.fill('#password', this.password);
      await page.click('button:has-text("Sign in")');
      await page.waitForTimeout(3000);

      // ── Create new workflow and paste nodes ──────────────────
      await page.goto(`${this.baseUrl}/workflow/new`, {
        waitUntil: 'networkidle',
        timeout: opts.timeout,
      });
      await page.waitForTimeout(3000);
      // Dismiss any welcome modals
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      const pasteData = JSON.stringify({
        nodes: workflow.nodes,
        connections: workflow.connections,
      });

      await page.evaluate(async (json: string) => {
        await navigator.clipboard.writeText(json);
      }, pasteData);

      // Click canvas and paste
      const canvas = page.locator('.vue-flow').first();
      await canvas.click({ position: { x: 500, y: 500 } });
      await page.waitForTimeout(300);

      // Try Meta+V (macOS), fallback to Ctrl+V (Linux/Docker)
      await page.keyboard.press('Meta+v');
      await page.waitForTimeout(3000);

      let nodeCount = await page.evaluate(() =>
        document.querySelectorAll('.vue-flow__node').length
      );

      if (nodeCount < 2) {
        await page.keyboard.press('Control+v');
        await page.waitForTimeout(3000);
        nodeCount = await page.evaluate(() =>
          document.querySelectorAll('.vue-flow__node').length
        );
      }

      if (nodeCount < 2) {
        throw new Error(
          `Failed to paste workflow nodes into n8n canvas (expected ${workflow.nodes.length}, got ${nodeCount})`
        );
      }

      // ── Zoom to fit ──────────────────────────────────────────
      await page.keyboard.press('1'); // n8n shortcut: zoom to fit
      await page.waitForTimeout(2000);

      // ── Hide UI chrome and make canvas fullscreen ────────────
      await page.addStyleTag({ content: HIDE_CHROME_CSS });
      await page.waitForTimeout(1000);

      // Re-zoom after layout change (canvas is now fullscreen)
      await page.keyboard.press('1');
      await page.waitForTimeout(2000);

      // ── Screenshot ───────────────────────────────────────────
      const screenshot = await page.screenshot({ type: 'png' });

      // ── Cleanup: delete the temporary workflow ───────────────
      try {
        const currentUrl = page.url();
        const wfIdMatch = currentUrl.match(/\/workflow\/([^/?]+)/);
        if (wfIdMatch) {
          await page.evaluate(async (wfId: string) => {
            await fetch(`/rest/workflows/${wfId}`, { method: 'DELETE' });
          }, wfIdMatch[1]);
        }
      } catch {
        // Best effort cleanup, don't fail the screenshot
      }

      return {
        buffer: Buffer.from(screenshot),
        width: opts.width * opts.deviceScaleFactor,
        height: opts.height * opts.deviceScaleFactor,
      };
    } finally {
      await browser.close();
    }
  }
}

// ── n8n.io public page implementation (low-res fallback) ─────

const PUBLIC_DEFAULTS = {
  width: 1920,
  height: 1080,
  deviceScaleFactor: 4,
  timeout: 30_000,
};

/**
 * Captures workflow screenshots from n8n.io public template pages.
 * Uses the <n8n-demo> web component that renders the real n8n canvas.
 *
 * WARNING: n8n.io preview canvas is fixed at 709x520 CSS pixels.
 * For workflows with many nodes, text becomes unreadable.
 * Prefer N8nLocalDockerProvider for production quality.
 */
export class N8nPublicPageProvider implements N8nScreenshotProvider {
  async capture(workflow: N8nWorkflow, options?: CaptureOptions): Promise<ScreenshotResult> {
    const opts = { ...PUBLIC_DEFAULTS, ...options };

    const { chromium } = await import('playwright');

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: opts.width, height: opts.height },
        deviceScaleFactor: opts.deviceScaleFactor,
      });
      const page = await context.newPage();

      await page.goto(`https://n8n.io/workflows/${workflow.id}`, {
        waitUntil: 'networkidle',
        timeout: opts.timeout,
      });

      await page.waitForSelector('n8n-demo', { timeout: opts.timeout });
      await page.waitForTimeout(3000);

      const canvas = page.locator('.canvas-container');
      await canvas.click();
      await page.waitForTimeout(1000);

      await page.addStyleTag({
        content: `
          [class*="cookie"], [class*="consent"] {
            display: none !important;
          }
        `,
      });
      await page.evaluate(() => {
        const demo = document.querySelector('n8n-demo');
        if (!demo?.shadowRoot) return;
        const style = document.createElement('style');
        style.textContent = `
          button, [class*="zoom"], [class*="control"],
          [class*="Controls"], [class*="minimap"] {
            display: none !important;
          }
        `;
        demo.shadowRoot.appendChild(style);
      });

      const box = await canvas.boundingBox();
      const clipHeight = Math.max(100, (box?.height ?? opts.height) - 60);
      const screenshot = await page.screenshot({
        type: 'png',
        clip: {
          x: box?.x ?? 0,
          y: box?.y ?? 0,
          width: box?.width ?? opts.width,
          height: clipHeight,
        },
      });

      return {
        buffer: Buffer.from(screenshot),
        width: Math.round((box?.width ?? opts.width) * opts.deviceScaleFactor),
        height: Math.round(clipHeight * opts.deviceScaleFactor),
      };
    } finally {
      await browser.close();
    }
  }
}
