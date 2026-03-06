import type { DirectorInput, DirectorOutput, DirectorBRollSegment, MediaAsset } from './types';
import { searchPexelsVideos } from './media-library';
import { DIRECTOR_RULES } from './rules';
import { createLogger } from '@reelstack/logger';

const log = createLogger('ai-director');

/**
 * AI Director analyzes transcript content and generates B-roll placement,
 * transitions, and style adjustments. Uses Claude/OpenAI function calling.
 */
export async function direct(input: DirectorInput): Promise<DirectorOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY;

  // If no AI API key, fall back to rule-based director
  if (!apiKey) {
    return ruleBasedDirector(input);
  }

  // Try AI-powered direction
  const isAnthropic = !!process.env.ANTHROPIC_API_KEY;

  if (isAnthropic) {
    return anthropicDirector(input);
  }
  return openaiDirector(input);
}

/**
 * Rule-based fallback director - no AI API needed.
 * Places B-roll at regular intervals based on content breaks.
 */
async function ruleBasedDirector(input: DirectorInput): Promise<DirectorOutput> {
  const { cues, durationSeconds, brandPreset } = input;
  const bRollSegments: DirectorBRollSegment[] = [];
  const editNotes: string[] = ['Rule-based director (no AI API key configured)'];

  const intervalSec = 10;
  const bRollDurationSec = 3;
  const transition = brandPreset?.defaultTransition ?? 'crossfade';

  // Search for generic B-roll if Pexels available
  let mediaPool: MediaAsset[] = input.mediaLibrary ? [...input.mediaLibrary] : [];
  if (mediaPool.length === 0) {
    mediaPool = await searchPexelsVideos('technology abstract', { perPage: 5 });
  }

  // Place B-roll every ~10 seconds at cue boundaries
  let lastBRollEnd = 0;
  for (const cue of cues) {
    if (mediaPool.length === 0) break;

    if (cue.startTime - lastBRollEnd >= intervalSec && cue.startTime + bRollDurationSec <= durationSeconds) {
      const media = mediaPool[bRollSegments.length % mediaPool.length];

      if (media) {
        bRollSegments.push({
          startTime: cue.startTime,
          endTime: Math.min(cue.startTime + bRollDurationSec, durationSeconds),
          media: { url: media.url, type: media.type },
          animation: 'spring-scale',
          transition: { type: transition, durationMs: 400 },
          reason: `Regular interval at ${cue.startTime.toFixed(1)}s`,
        });
        lastBRollEnd = cue.startTime + bRollDurationSec;
      }
    }
  }

  editNotes.push(`Placed ${bRollSegments.length} B-roll segments at ~${intervalSec}s intervals`);

  return { bRollSegments, editNotes };
}

/**
 * Claude-powered AI director using tool_use.
 */
async function anthropicDirector(input: DirectorInput): Promise<DirectorOutput> {
  const cuesSummary = input.cues.map((c) =>
    `[${c.startTime.toFixed(1)}s-${c.endTime.toFixed(1)}s] "${c.text}"`
  ).join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: DIRECTOR_RULES,
      messages: [{
        role: 'user',
        content: `Analyze this ${input.durationSeconds.toFixed(0)}s video transcript and decide where to place B-roll cutaways.\n\nTranscript cues:\n${cuesSummary}\n\nFull text:\n<user_script>\n${input.text}\n</user_script>\n\nStyle: ${input.style ?? 'dynamic'}\nDuration: ${input.durationSeconds.toFixed(1)}s\n\nReturn a JSON array of B-roll placements. Each entry: { "startTime": number, "endTime": number, "searchQuery": "keywords for stock footage", "transition": "crossfade"|"slide-left"|"zoom-in"|"none", "reason": "why here" }`,
      }],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const err = await response.text();
    log.warn({ status: response.status, error: err }, 'Anthropic director failed, falling back to rules');
    return ruleBasedDirector(input);
  }

  const data = (await response.json()) as { content: Array<{ type: string; text?: string }> };
  const textBlock = data.content.find((b) => b.type === 'text');
  if (!textBlock?.text) return ruleBasedDirector(input);

  return parseAIResponse(textBlock.text, input);
}

/**
 * OpenAI-powered AI director.
 */
async function openaiDirector(input: DirectorInput): Promise<DirectorOutput> {
  const cuesSummary = input.cues.map((c) =>
    `[${c.startTime.toFixed(1)}s-${c.endTime.toFixed(1)}s] "${c.text}"`
  ).join('\n');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: DIRECTOR_RULES + '\n\nRespond with a JSON object: { "placements": [...] }' },
        {
          role: 'user',
          content: `Analyze this ${input.durationSeconds.toFixed(0)}s video transcript and decide where to place B-roll cutaways.\n\nTranscript cues:\n${cuesSummary}\n\nFull text:\n<user_script>\n${input.text}\n</user_script>\n\nStyle: ${input.style ?? 'dynamic'}\nDuration: ${input.durationSeconds.toFixed(1)}s\n\nEach placement: { "startTime": number, "endTime": number, "searchQuery": "keywords for stock footage", "transition": "crossfade"|"slide-left"|"zoom-in"|"none", "reason": "why here" }`,
        },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    log.warn({ status: response.status }, 'OpenAI director failed, falling back to rules');
    return ruleBasedDirector(input);
  }

  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  const content = data.choices[0]?.message?.content;
  if (!content) return ruleBasedDirector(input);

  return parseAIResponse(content, input);
}

/**
 * Parse AI response JSON and resolve media URLs from Pexels.
 */
async function parseAIResponse(text: string, input: DirectorInput): Promise<DirectorOutput> {
  const editNotes: string[] = ['AI-powered director'];

  try {
    // Extract JSON from response (may be wrapped in markdown code block)
    const jsonMatch = text.match(/\[[\s\S]*\]/) ?? text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in AI response');

    const parsed = JSON.parse(jsonMatch[0]);
    const rawPlacements = Array.isArray(parsed) ? parsed : parsed.placements ?? [];

    const placements: AIPlacement[] = rawPlacements.filter((p: unknown) => {
      if (typeof p !== 'object' || p === null) return false;
      const obj = p as Record<string, unknown>;
      return typeof obj.startTime === 'number' && typeof obj.endTime === 'number' && typeof obj.searchQuery === 'string';
    });

    // Resolve search queries to actual media URLs
    const bRollSegments: DirectorBRollSegment[] = [];

    for (const p of placements) {
      // Clamp to video duration
      if (p.startTime >= input.durationSeconds || p.endTime <= 0) continue;

      let media: MediaAsset | undefined;

      // Try media library first
      if (input.mediaLibrary?.length) {
        media = input.mediaLibrary.find((m) =>
          m.tags.some((t) => p.searchQuery.toLowerCase().includes(t.toLowerCase()))
        );
      }

      // Fallback to Pexels search
      if (!media && p.searchQuery) {
        const results = await searchPexelsVideos(p.searchQuery, { perPage: 1 });
        media = results[0];
      }

      if (media) {
        bRollSegments.push({
          startTime: p.startTime,
          endTime: Math.min(p.endTime, input.durationSeconds),
          media: { url: media.url, type: media.type },
          animation: 'spring-scale',
          transition: { type: p.transition ?? 'crossfade', durationMs: 400 },
          reason: p.reason ?? p.searchQuery,
        });
        editNotes.push(`${p.startTime.toFixed(1)}s: "${p.searchQuery}" → ${p.reason}`);
      }
    }

    editNotes.push(`AI placed ${bRollSegments.length} B-roll segments`);
    return { bRollSegments, editNotes };
  } catch (err) {
    log.warn({ err }, 'Failed to parse AI response, falling back to rules');
    editNotes.push(`AI parse error: ${err}, falling back to rules`);
    return ruleBasedDirector(input);
  }
}

interface AIPlacement {
  startTime: number;
  endTime: number;
  searchQuery: string;
  transition?: string;
  reason?: string;
}
