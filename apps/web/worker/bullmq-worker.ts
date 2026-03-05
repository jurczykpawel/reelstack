import { Worker } from 'bullmq';
import { processReelPipelineJob } from '../src/lib/worker/reel-pipeline-worker';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const url = new URL(redisUrl);

const worker = new Worker(
  'reel-render',
  async (job) => {
    console.info(`[worker] Processing render job: ${job.id}`);
    await processReelPipelineJob(job.data.jobId);
    console.info(`[worker] Completed render job: ${job.id}`);
  },
  {
    connection: {
      host: url.hostname,
      port: parseInt(url.port || '6379', 10),
      password: url.password || undefined,
    },
    // concurrency: 1 because Remotion bundle is CPU-bound (3+ min on 1 CPU).
    // Two parallel jobs would starve each other and both time out.
    // Bundle is cached after first run, so subsequent jobs are faster.
    concurrency: 1,
    // Render pipeline can take 3-5min (TTS + Remotion bundle + render)
    // Default lockDuration is 30s - must be longer than the longest blocking operation
    lockDuration: 360_000, // 6 minutes
  },
);

worker.on('failed', (job, err) => {
  console.error(`[worker] Job ${job?.id} failed:`, err.message);
});

worker.on('ready', () => {
  console.info('[worker] BullMQ render worker ready');
});

process.on('SIGTERM', async () => {
  console.info('[worker] Shutting down...');
  await worker.close();
  process.exit(0);
});
