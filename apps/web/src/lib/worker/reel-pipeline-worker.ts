import { createStorage } from '@reelstack/storage';
import {
  getReelJobInternal,
  updateReelJobStatus,
} from '@reelstack/database';
import { createReel } from '@reelstack/remotion/pipeline';
import { readFile, unlink } from 'fs/promises';

export async function processReelPipelineJob(jobId: string): Promise<void> {
  const job = await getReelJobInternal(jobId);
  if (!job) throw new Error(`Reel job ${jobId} not found`);

  await updateReelJobStatus(jobId, {
    status: 'PROCESSING',
    progress: 0,
    startedAt: new Date(),
  });

  try {
    const config = (job.reelConfig as Record<string, unknown>) ?? {};

    const result = await createReel(
      {
        script: job.script ?? '',
        layout: (config.layout as 'split-screen' | 'fullscreen' | 'picture-in-picture') ?? 'fullscreen',
        style: config.style as 'dynamic' | 'calm' | 'cinematic' | 'educational' | undefined,
        tts: config.tts as { provider?: 'edge-tts' | 'elevenlabs' | 'openai'; voice?: string; language?: string } | undefined,
        primaryVideoUrl: config.primaryVideoUrl as string | undefined,
        secondaryVideoUrl: config.secondaryVideoUrl as string | undefined,
        brandPreset: config.brandPreset as Record<string, string> | undefined,
      },
      (step) => {
        // Map step names to progress percentages
        const progressMap: Record<string, number> = {
          'Generating voiceover...': 10,
          'Normalizing audio...': 20,
          'Transcribing audio...': 30,
          'Grouping into subtitle cues...': 40,
          'AI Director analyzing content...': 50,
          'Building composition...': 60,
          'Rendering video...': 70,
        };
        const progress = progressMap[step] ?? undefined;
        if (progress) {
          updateReelJobStatus(jobId, { progress }).catch(() => {});
        }
      },
    );

    // Upload rendered MP4 to storage
    const storage = await createStorage();
    const outputBuffer = await readFile(result.outputPath);
    const outputKey = `reels/${jobId}/output.mp4`;
    await storage.upload(outputBuffer, outputKey);
    const outputUrl = await storage.getSignedUrl(outputKey, 86400);

    // Clean up local file
    await unlink(result.outputPath).catch(() => {});

    await updateReelJobStatus(jobId, {
      status: 'COMPLETED',
      progress: 100,
      outputUrl,
      completedAt: new Date(),
    });
  } catch (err) {
    await updateReelJobStatus(jobId, {
      status: 'FAILED',
      error: err instanceof Error ? err.message : 'Unknown error',
      completedAt: new Date(),
    });
    throw err;
  }
}
