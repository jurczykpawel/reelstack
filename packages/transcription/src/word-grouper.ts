/**
 * Word Grouper - groups transcription words into SubtitleCue objects.
 * Inspired by OpenReel's transcription-service.ts:262-308.
 */
import type { SubtitleCue, CaptionAnimationStyle } from '@reelstack/types';
import type { TranscriptionWord, WordGroupingConfig } from './types';
import { DEFAULT_GROUPING_CONFIG } from './types';

/**
 * Group transcription words into subtitle cues with per-word timing.
 */
export function groupWordsIntoCues(
  words: readonly TranscriptionWord[],
  config: Partial<WordGroupingConfig> = {},
  defaultAnimationStyle: CaptionAnimationStyle = 'karaoke',
): SubtitleCue[] {
  if (words.length === 0) return [];

  const { maxWordsPerCue, maxDurationPerCue, breakOnPunctuation } = {
    ...DEFAULT_GROUPING_CONFIG,
    ...config,
  };

  const cues: SubtitleCue[] = [];
  let currentWords: TranscriptionWord[] = [];
  let groupStart = 0;

  for (const word of words) {
    if (currentWords.length === 0) {
      groupStart = word.startTime;
    }

    const wouldExceedWords = currentWords.length >= maxWordsPerCue;
    const wouldExceedDuration = word.endTime - groupStart > maxDurationPerCue;
    const isPunctuation = breakOnPunctuation && /[.!?]$/.test(word.text);

    // Flush group if limits exceeded
    if ((wouldExceedWords || wouldExceedDuration) && currentWords.length > 0) {
      cues.push(createCueFromWords(currentWords, defaultAnimationStyle));
      currentWords = [word];
      groupStart = word.startTime;
    } else {
      currentWords.push(word);

      // Break on sentence-ending punctuation (but only if we have enough words)
      if (isPunctuation && currentWords.length >= 2) {
        cues.push(createCueFromWords(currentWords, defaultAnimationStyle));
        currentWords = [];
      }
    }
  }

  // Flush remaining words
  if (currentWords.length > 0) {
    cues.push(createCueFromWords(currentWords, defaultAnimationStyle));
  }

  return cues;
}

function createCueFromWords(
  words: TranscriptionWord[],
  animationStyle: CaptionAnimationStyle,
): SubtitleCue {
  const text = words.map((w) => w.text).join(' ').trim();
  const startTime = words[0].startTime;
  const endTime = words[words.length - 1].endTime;

  return {
    id: crypto.randomUUID(),
    text,
    startTime,
    endTime,
    words: words.map((w) => ({
      text: w.text,
      startTime: w.startTime,
      endTime: w.endTime,
    })),
    animationStyle,
  };
}
