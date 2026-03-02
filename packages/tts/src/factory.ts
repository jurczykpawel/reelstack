import type { TTSConfig, TTSProvider } from './types';
import { EdgeTTSProvider } from './providers/edge-tts';
import { ElevenLabsProvider } from './providers/elevenlabs';
import { OpenAITTSProvider } from './providers/openai-tts';

/**
 * Creates a TTS provider from config.
 * Falls back to Edge TTS (free, no API key) if no config provided.
 */
export function createTTSProvider(config?: TTSConfig): TTSProvider {
  if (!config) {
    return new EdgeTTSProvider();
  }

  switch (config.provider) {
    case 'elevenlabs':
      if (!config.apiKey) throw new Error('ElevenLabs requires an API key');
      return new ElevenLabsProvider(config.apiKey);

    case 'openai':
      if (!config.apiKey) throw new Error('OpenAI TTS requires an API key');
      return new OpenAITTSProvider(config.apiKey);

    case 'edge-tts':
      return new EdgeTTSProvider(config.defaultLanguage);

    default:
      throw new Error(`Unknown TTS provider: ${(config as TTSConfig).provider}`);
  }
}
