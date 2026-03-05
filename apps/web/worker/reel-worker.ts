import { Worker } from 'bullmq';
import { processReelPipelineJob } from '../src/lib/worker/reel-pipeline-worker';
import { processReelPublishJob } from '../src/lib/worker/reel-publish-worker';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const url = new URL(redisUrl);

const connection = {
  host: url.hostname,
  port: parseInt(url.port || '6379', 10),
  password: url.password || undefined,
};

// Reel render worker - concurrency 1 (Chromium is memory-intensive)
const renderWorker = new Worker(
  'reel-render',
  async (job) => {
    console.info(`[reel-worker] Processing reel-render job: ${job.id}`);
    await processReelPipelineJob(job.data.jobId);
    console.info(`[reel-worker] Completed reel-render job: ${job.id}`);
  },
  { connection, concurrency: 1 },
);

// Reel publish worker - concurrency 5 (lightweight HTTP calls)
const publishWorker = new Worker(
  'reel-publish',
  async (job) => {
    console.info(`[reel-worker] Processing reel-publish job: ${job.id}`);
    await processReelPublishJob(job.data.jobId, job.data);
    console.info(`[reel-worker] Completed reel-publish job: ${job.id}`);
  },
  { connection, concurrency: 5 },
);

renderWorker.on('failed', (job, err) => {
  console.error(`[reel-worker] Render job ${job?.id} failed:`, err.message);
});

publishWorker.on('failed', (job, err) => {
  console.error(`[reel-worker] Publish job ${job?.id} failed:`, err.message);
});

renderWorker.on('ready', () => {
  console.info('[reel-worker] BullMQ reel-render worker ready');
});

publishWorker.on('ready', () => {
  console.info('[reel-worker] BullMQ reel-publish worker ready');
});

async function shutdown() {
  console.info('[reel-worker] Shutting down...');
  await Promise.all([renderWorker.close(), publishWorker.close()]);
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
