/**
 * Cloudflare Workers AI Whisper Provider.
 * Sends audio to Cloudflare's @cf/openai/whisper model.
 * Returns word-level timestamps.
 */
import type {
  TranscriptionProvider,
  TranscriptionResult,
  TranscriptionWord,
  TranscribeOptions,
  CloudflareWhisperConfig,
} from '../types';
import { pcmToWavBlob } from '../audio-extractor';

interface CloudflareWhisperWord {
  word: string;
  start: number;
  end: number;
}

interface CloudflareResponse {
  result: {
    text: string;
    word_count?: number;
    words?: CloudflareWhisperWord[];
    vtt?: string;
  };
  success: boolean;
  errors: Array<{ message: string }>;
}

export class CloudflareWhisperProvider implements TranscriptionProvider {
  readonly id = 'cloudflare';
  readonly name = 'Cloudflare Workers AI (Whisper)';
  readonly isLocal = false;

  private apiToken: string;
  private accountId: string;

  constructor(config: CloudflareWhisperConfig) {
    this.apiToken = config.apiToken;
    this.accountId = config.accountId;
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiToken && this.accountId);
  }

  async transcribe(
    audio: Float32Array,
    sampleRate: number,
    options?: TranscribeOptions,
  ): Promise<TranscriptionResult> {
    options?.onProgress?.({
      status: 'transcribing',
      progress: 30,
      message: 'Preparing audio for upload...',
    });

    const wavBlob = pcmToWavBlob(audio, sampleRate);
    const formData = new FormData();
    formData.append('file', wavBlob, 'audio.wav');

    options?.onProgress?.({
      status: 'transcribing',
      progress: 50,
      message: 'Uploading to Cloudflare Workers AI...',
    });

    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/@cf/openai/whisper`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiToken}` },
      body: formData,
      signal: options?.signal ?? AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Rate limit reached. Please wait before transcribing more audio.');
      }
      const text = await response.text();
      throw new Error(`Cloudflare transcription failed: ${response.status} - ${text}`);
    }

    const data: CloudflareResponse = await response.json();

    if (!data.success) {
      throw new Error(`Cloudflare error: ${data.errors.map((e) => e.message).join(', ')}`);
    }

    options?.onProgress?.({
      status: 'completed',
      progress: 100,
      message: 'Transcription complete',
    });

    const words: TranscriptionWord[] = (data.result.words ?? []).map((w) => ({
      text: w.word,
      startTime: w.start,
      endTime: w.end,
    }));

    const duration = audio.length / sampleRate;

    return {
      words,
      text: data.result.text?.trim() ?? '',
      language: options?.language ?? 'auto',
      duration,
    };
  }
}
