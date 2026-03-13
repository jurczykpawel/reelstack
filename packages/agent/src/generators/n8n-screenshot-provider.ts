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
      // Give the canvas time to fully render nodes AND connection lines
      await page.waitForTimeout(3000);

      // Dismiss "Click to explore" tooltip by clicking the canvas
      const canvas = page.locator('.canvas-container');
      await canvas.click();
      // Wait for tooltip animation to clear and connections to re-render
      await page.waitForTimeout(1000);

      // Hide zoom controls, cookie banner, and any UI chrome
      // Main page CSS
      await page.addStyleTag({
        content: `
          [class*="cookie"], [class*="consent"] {
            display: none !important;
          }
        `,
      });
      // Shadow DOM of n8n-demo: inject CSS to hide controls inside it
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

      // Screenshot the canvas area, clipping bottom 60px to exclude zoom controls
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
