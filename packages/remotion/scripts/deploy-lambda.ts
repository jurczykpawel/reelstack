#!/usr/bin/env npx tsx
/**
 * Deploy Remotion Lambda infrastructure to AWS.
 *
 * Steps:
 * 1. Deploy Lambda function (if not exists)
 * 2. Deploy Remotion site to S3
 * 3. Print env vars to add to .env
 *
 * Prerequisites:
 *   - AWS credentials configured (env vars or ~/.aws/credentials)
 *   - AWS_REGION set
 *
 * Usage: npx tsx scripts/deploy-lambda.ts
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const REMOTION_PKG_DIR = path.resolve(__dirname, '..');

// Same webpack override as remotion.config.ts — needed for deploySite bundling
// Uses dynamic require to find webpack in Bun's flat layout
const webpackOverride = (config: any): any => {
  const nodeBuiltins: Record<string, boolean> = {
    assert: false, buffer: false, child_process: false, cluster: false,
    console: false, constants: false, crypto: false, dgram: false,
    dns: false, domain: false, events: false, fs: false,
    http: false, http2: false, https: false, module: false,
    net: false, os: false, path: false, perf_hooks: false,
    process: false, punycode: false, querystring: false, readline: false,
    repl: false, stream: false, string_decoder: false, sys: false,
    timers: false, tls: false, tty: false, url: false,
    util: false, v8: false, vm: false, worker_threads: false, zlib: false,
  };

  // Use resolve.alias (more aggressive than fallback) to handle Bun's flat layout
  const aliasMap: Record<string, false> = {};
  for (const mod of Object.keys(nodeBuiltins)) {
    aliasMap[mod] = false;
    aliasMap[`node:${mod}`] = false;
  }

  return {
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...(config.resolve?.alias ?? {}),
        ...aliasMap,
      },
      fallback: {
        ...(config.resolve?.fallback ?? {}),
        ...nodeBuiltins,
      },
    },
  };
};

async function main() {
  const region = process.env.AWS_REGION;
  if (!region) {
    console.error('Set AWS_REGION env var first (e.g. eu-central-1)');
    process.exit(1);
  }

  console.log('ReelStack — Lambda Deployment');
  console.log('═'.repeat(50));
  console.log(`Region: ${region}`);
  console.log('');

  // Dynamic imports to avoid bundling heavy AWS SDK
  const {
    deployFunction,
    deploySite,
    getFunctions,
    getOrCreateBucket,
  } = await import('@remotion/lambda');

  // Step 1: Check for existing function or deploy new
  console.log('Step 1: Checking Lambda functions...');
  const existingFunctions = await getFunctions({
    region: region as any,
    compatibleOnly: true,
  });

  let functionName: string;

  if (existingFunctions.length > 0) {
    functionName = existingFunctions[0].functionName;
    console.log(`  Found existing function: ${functionName}`);
  } else {
    console.log('  Deploying new Lambda function...');
    const { functionName: newName } = await deployFunction({
      region: region as any,
      timeoutInSeconds: 240,
      memorySizeInMb: 2048,
      diskSizeInMb: 2048,
    });
    functionName = newName;
    console.log(`  Deployed: ${functionName}`);
  }

  // Step 2: Ensure S3 bucket exists
  console.log('');
  console.log('Step 2: Ensuring S3 bucket...');
  const { bucketName } = await getOrCreateBucket({
    region: region as any,
  });
  console.log(`  Bucket: ${bucketName}`);

  // Step 3: Deploy site (Remotion bundle) to S3
  console.log('');
  console.log('Step 3: Deploying Remotion site to S3...');

  const entryPoint = path.join(REMOTION_PKG_DIR, 'src', 'index.ts');
  const { serveUrl, siteName } = await deploySite({
    region: region as any,
    entryPoint,
    siteName: 'reelstack',
    bucketName,
    webpackOverride,
  });

  console.log(`  Site: ${siteName}`);
  console.log(`  URL: ${serveUrl}`);

  // Step 4: Print env vars
  console.log('');
  console.log('═'.repeat(50));
  console.log('Add to your .env:');
  console.log('');
  console.log(`REMOTION_RENDERER=lambda`);
  console.log(`AWS_REGION=${region}`);
  console.log(`REMOTION_LAMBDA_FUNCTION_NAME=${functionName}`);
  console.log(`REMOTION_LAMBDA_SERVE_URL=${serveUrl}`);
  console.log('');
  console.log('═'.repeat(50));

  // Step 5: Test render (optional)
  if (process.argv.includes('--test')) {
    console.log('');
    console.log('Running test render...');
    const { renderMediaOnLambda } = await import('@remotion/lambda/client');
    const { getRenderProgress } = await import('@remotion/lambda/client');

    const { renderId, bucketName } = await renderMediaOnLambda({
      region: region as any,
      functionName,
      serveUrl,
      composition: 'Reel',
      codec: 'h264',
      inputProps: {
        layout: 'fullscreen',
        cues: [
          {
            id: '1',
            text: 'Lambda test render',
            startTime: 0,
            endTime: 2,
            animationStyle: 'karaoke',
            words: [
              { text: 'Lambda', startTime: 0, endTime: 0.7 },
              { text: 'test', startTime: 0.7, endTime: 1.3 },
              { text: 'render', startTime: 1.3, endTime: 2 },
            ],
          },
        ],
        captionStyle: {
          fontFamily: 'Outfit, sans-serif',
          fontSize: 48,
          fontColor: '#F5F5F0',
          fontWeight: 'bold',
          fontStyle: 'normal',
          backgroundColor: '#0E0E12',
          backgroundOpacity: 0.85,
          outlineColor: '#0E0E12',
          outlineWidth: 3,
          shadowColor: '#000000',
          shadowBlur: 12,
          position: 80,
          alignment: 'center',
          lineHeight: 1.3,
          padding: 14,
          highlightColor: '#F59E0B',
          upcomingColor: '#8888A0',
        },
        musicVolume: 0,
        showProgressBar: true,
        backgroundColor: '#0E0E12',
      },
    });

    console.log(`  Render ID: ${renderId}`);
    console.log(`  Bucket: ${bucketName}`);

    // Poll
    let done = false;
    while (!done) {
      const progress = await getRenderProgress({
        renderId,
        bucketName,
        functionName,
        region: region as any,
      });

      const pct = Math.round(progress.overallProgress * 100);
      process.stdout.write(`\r  Progress: ${pct}%`);

      if (progress.fatalErrorEncountered) {
        console.error('\n  FAILED:', progress.errors);
        process.exit(1);
      }

      if (progress.done) {
        done = true;
        console.log(`\n  Output: ${progress.outputFile}`);
      } else {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
}

main().catch((err) => {
  console.error('Deploy failed:', err.message ?? err);
  process.exit(1);
});
