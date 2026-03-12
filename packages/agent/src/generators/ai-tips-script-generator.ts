/**
 * Generates script for ai-tips videos (talking objects giving IT tips).
 * LLM produces per-tip specs: object, emotion, scenery, dialog.
 *
 * Variants:
 * - multi-object: each tip has a different object (toaster, blender, lamp...)
 * - single-object: one object gives all tips (e.g., a friendly robot)
 * - cutaway-demo: object + screen recording cutaway for demo
 */

// ── Types ─────────────────────────────────────────────────────

export interface AiTip {
  object: string;
  emotion: string;
  scenery: string;
  dialog: string;
  boardImage?: string;
}

export interface AiTipsScript {
  tips: AiTip[];
  hook: string;
  cta: string;
}

export type AiTipsVariant = 'multi-object' | 'single-object' | 'cutaway-demo';

export interface AiTipsScriptOptions {
  topic: string;
  llmCall: (prompt: string) => Promise<string>;
  language?: string;
  numberOfTips?: number;
  variant?: AiTipsVariant;
}

// ── Script generator ──────────────────────────────────────────

const SYSTEM_PROMPT = `You are a creative script writer for "talking object" IT tip videos.
These are short videos where everyday objects (toasters, blenders, lamps, etc.) come alive
in Pixar 3D style and give IT tips in first person. The objects have personality and emotions.

Output MUST be valid JSON with this exact structure:
{
  "tips": [
    {
      "object": "name of the object (e.g., toaster, blender, desk lamp)",
      "emotion": "emotion/personality (e.g., excited, confident, nerdy, sarcastic)",
      "scenery": "background scene description (e.g., modern kitchen with warm bokeh lights)",
      "dialog": "what the object says - the actual IT tip in first person"
    }
  ],
  "hook": "opening hook text (attention-grabbing, 1 sentence)",
  "cta": "call to action text (1 sentence)"
}

Rules:
- Each object should have a personality that matches its character
- Scenery should be where you'd naturally find the object (kitchen, office, garage, etc.)
- Dialog should be conversational, fun, and contain a real, useful IT tip
- Keep dialog short (1-3 sentences per tip, ~5-8 seconds of speech)
- Objects should have CLOSED MOUTHS in the video (they "speak" via captions)
- The hook should be surprising/funny to grab attention
- Output ONLY the JSON, no markdown, no extra text`;

export async function generateAiTipsScript(
  options: AiTipsScriptOptions,
): Promise<AiTipsScript> {
  const {
    topic,
    llmCall,
    language = 'en',
    numberOfTips = 5,
    variant = 'multi-object',
  } = options;

  const langInstruction = language === 'pl' ? 'Polish (polski)' : language === 'en' ? 'English' : language;

  const variantInstruction = variant === 'single-object'
    ? 'Use the SAME object for all tips (single-object variant). Pick one charming object and give it a consistent personality.'
    : variant === 'cutaway-demo'
      ? 'Each tip has a talking object + a cutaway demo scene. Include a "boardImage" field describing the demo screenshot.'
      : 'Use a DIFFERENT object for each tip (multi-object variant). Each object should be unique and fun.';

  const prompt = `${SYSTEM_PROMPT}

Topic: ${topic}
Number of tips: ${numberOfTips}
Language: ${langInstruction}
Variant: ${variantInstruction}

Generate ${numberOfTips} tips about "${topic}".`;

  const response = await llmCall(prompt);

  let parsed: unknown;
  try {
    const cleaned = response.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`LLM returned invalid JSON for ai-tips script: ${response.slice(0, 200)}`);
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.tips) || obj.tips.length === 0) {
    throw new Error('LLM response missing tips array');
  }

  const tips: AiTip[] = obj.tips.map((t: Record<string, unknown>) => ({
    object: String(t.object ?? 'robot'),
    emotion: String(t.emotion ?? 'friendly'),
    scenery: String(t.scenery ?? 'neutral studio background'),
    dialog: String(t.dialog ?? ''),
    boardImage: typeof t.boardImage === 'string' ? t.boardImage : undefined,
  }));

  return {
    tips,
    hook: String(obj.hook ?? ''),
    cta: String(obj.cta ?? ''),
  };
}
