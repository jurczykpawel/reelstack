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
    concurrency: 2,
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
