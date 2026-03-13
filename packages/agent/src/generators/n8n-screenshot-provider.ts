/**
 * Screenshot provider interface for n8n workflow screenshots.
 *
 * Strategy pattern: swap implementations without changing the pipeline.
 * - N8nPublicPageProvider: screenshots from n8n.io public workflow pages
 * - Future: N8nSelfHostedProvider: screenshots from your own n8n instance
 */

export interface CaptureOptions {
  /** Viewport width for the screenshot (default: 1280) */
  width?: number;
  /** Viewport height for the screenshot (default: 960) */
  height?: number;
  /** Device scale factor for high-res (default: 2) */
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
  capture(workflowId: string, options?: CaptureOptions): Promise<ScreenshotResult>;
}

// ── n8n.io public page implementation ────────────────────────

const DEFAULTS = {
  width: 1280,
  height: 960,
  deviceScaleFactor: 2,
  timeout: 30_000,
};

/**
 * Captures workflow screenshots from n8n.io public template pages.
 * Uses the <n8n-demo> web component that renders the real n8n canvas.
 */
export class N8nPublicPageProvider implements N8nScreenshotProvider {
  async capture(workflowId: string, options?: CaptureOptions): Promise<ScreenshotResult> {
    const opts = { ...DEFAULTS, ...options };

    // Dynamic import - Playwright is heavy, only load when needed
    const { chromium } = await import('playwright');

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: opts.width, height: opts.height },
        deviceScaleFactor: opts.deviceScaleFactor,
      });
      const page = await context.newPage();

      // Navigate to the public workflow page
      await page.goto(`https://n8n.io/workflows/${workflowId}`, {
        waitUntil: 'networkidle',
        timeout: opts.timeout,
      });

      // Wait for the n8n-demo web component to render its canvas
      await page.waitForSelector('n8n-demo', { timeout: opts.timeout });
      // Give the canvas a moment to finish rendering
      await page.waitForTimeout(2000);

      // Dismiss "Click to explore" tooltip by clicking the canvas
      const canvas = page.locator('.canvas-container');
      await canvas.click();
      await page.waitForTimeout(500);

      // Hide zoom controls and cookie banner via CSS injection
      await page.addStyleTag({
        content: `
          .workflow-viewer [class*="controls"],
          .workflow-viewer button,
          [class*="cookie"], [class*="consent"],
          .canvas-container button {
            display: none !important;
          }
        `,
      });

      // Screenshot just the canvas area
      const screenshot = await canvas.screenshot({ type: 'png' });
      const box = await canvas.boundingBox();

      return {
        buffer: Buffer.from(screenshot),
        width: Math.round((box?.width ?? opts.width) * opts.deviceScaleFactor),
        height: Math.round((box?.height ?? opts.height) * opts.deviceScaleFactor),
      };
    } finally {
      await browser.close();
    }
  }
}
