import type { ProductionTool } from './tool-interface';
import { PexelsTool } from '../tools/pexels-tool';
import { UserUploadTool } from '../tools/user-upload-tool';
import { HeyGenTool } from '../tools/heygen-tool';
import { Veo3Tool } from '../tools/veo3-tool';
import { KlingTool } from '../tools/kling-tool';
import { SeedanceTool } from '../tools/seedance-tool';
import { NanoBananaTool } from '../tools/nanobanana-tool';

/**
 * Auto-discover available production tools based on environment variables.
 * Always-available tools (Pexels, user uploads) are included by default.
 * API-dependent tools are only instantiated when their key is present.
 */
export function discoverTools(): ProductionTool[] {
  const tools: ProductionTool[] = [
    new PexelsTool(),
    new UserUploadTool(),
  ];

  if (process.env.HEYGEN_API_KEY) {
    tools.push(new HeyGenTool());
  }

  if (process.env.VEO3_API_KEY) {
    tools.push(new Veo3Tool());
  }

  if (process.env.KLING_API_KEY) {
    tools.push(new KlingTool());
  }

  if (process.env.SEEDANCE_API_KEY) {
    tools.push(new SeedanceTool());
  }

  if (process.env.NANOBANANA_API_KEY || process.env.GEMINI_API_KEY) {
    tools.push(new NanoBananaTool());
  }

  return tools;
}
