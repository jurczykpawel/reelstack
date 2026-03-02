import type { ReelProps } from '../schemas/reel-props';
import type { RemotionRenderer, RenderOptions, RenderResult } from './types';

/**
 * Stub for future AWS Lambda rendering via @remotion/lambda.
 * Requires: Lambda function deployed, S3 bucket, IAM roles.
 */
export class LambdaRenderer implements RemotionRenderer {
  async render(_props: ReelProps, _options: RenderOptions): Promise<RenderResult> {
    throw new Error(
      'Lambda renderer not yet implemented. ' +
      'Use REMOTION_RENDERER=local (default) or deploy via Docker. ' +
      'See: https://www.remotion.dev/docs/lambda',
    );
  }
}
