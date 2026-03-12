/**
 * Generates script for presenter-explainer videos.
 * LLM produces a long monologue (60-90s) with per-section board image specs.
 *
 * Styles: aggressive-funny, edu-casual, sarcastic-expert, hype-energy
 * Personas: prof-IT, sysadmin, haker (configured separately)
 */

// ── Types ─────────────────────────────────────────────────────

export interface BoardImageSpec {
  type: 'ai-gen' | 'web-search' | 'screenshot' | 'infographic';
  prompt?: string;
  url?: string;
  searchQuery?: string;
}

export interface PresenterSection {
  text: string;
  boardImageSpec: BoardImageSpec;
  emotion: string;
}

export interface PresenterScript {
  sections: PresenterSection[];
  hook: string;
  cta: string;
  totalDuration: number;
}

export type PresenterStyle = 'aggressive-funny' | 'edu-casual' | 'sarcastic-expert' | 'hype-energy';

export interface PresenterScriptOptions {
  topic: string;
  llmCall: (prompt: string) => Promise<string>;
  persona?: string;
  style?: PresenterStyle;
  language?: string;
  targetDuration?: number;
}

// ── Script generator ──────────────────────────────────────────

const STYLE_DESCRIPTIONS: Record<PresenterStyle, string> = {
  'aggressive-funny': 'Aggressive and funny. Roast bad practices, exaggerate problems, use humor to make points. Think stand-up comedian meets IT expert.',
  'edu-casual': 'Educational but casual. Friendly tone, clear explanations, relatable examples. Like explaining to a smart friend over coffee.',
  'sarcastic-expert': 'Sarcastic expert. Dry wit, "obviously" tone, but genuinely helpful underneath the sarcasm. Think House MD but for IT.',
  'hype-energy': 'High energy hype. Excited about the topic, fast-paced, lots of emphasis. Think tech YouTuber on caffeine.',
};

const SYSTEM_PROMPT = `You are a script writer for "presenter explainer" videos.
These are vertical (9:16) videos where:
- Bottom half: an AI-generated avatar/presenter talks to camera
- Top half: board images (screenshots, infographics, AI art) illustrate points
- Captions overlay in the middle

Your job is to write the narration script broken into sections, where each section
has a board image that appears in the top half while the presenter talks.

Output MUST be valid JSON with this exact structure:
{
  "sections": [
    {
      "text": "what the presenter says in this section (2-4 sentences, ~10-15s of speech)",
      "boardImageSpec": {
        "type": "ai-gen | web-search | screenshot | infographic",
        "prompt": "for ai-gen: image generation prompt",
        "url": "for screenshot: URL to screenshot",
        "searchQuery": "for web-search: search query"
      },
      "emotion": "presenter emotion (excited, serious, sarcastic, thoughtful, etc.)"
    }
  ],
  "hook": "opening hook (attention-grabbing, 1 sentence)",
  "cta": "call to action (1 sentence)",
  "totalDuration": estimated_total_seconds
}

Rules:
- 4-8 sections for a 60-90 second video
- Each section = one board image + one narration chunk
- Board images should visually illustrate what's being said
- Use "ai-gen" for conceptual/artistic illustrations
- Use "screenshot" for showing actual software/websites (include real URL)
- Use "web-search" for finding existing images of products/tools
- Use "infographic" for data/comparisons (describe the infographic in prompt)
- The narration should flow naturally between sections
- Output ONLY the JSON, no markdown, no extra text`;

export async function generatePresenterScript(
  options: PresenterScriptOptions,
): Promise<PresenterScript> {
  const {
    topic,
    llmCall,
    persona,
    style = 'edu-casual',
    language = 'en',
    targetDuration = 60,
  } = options;

  const langInstruction = language === 'pl' ? 'Polish (polski)' : language === 'en' ? 'English' : language;
  const styleDesc = STYLE_DESCRIPTIONS[style] ?? STYLE_DESCRIPTIONS['edu-casual'];

  const personaInstruction = persona
    ? `Persona: ${persona}. Adapt the tone and vocabulary to match this persona.`
    : '';

  const prompt = `${SYSTEM_PROMPT}

Topic: ${topic}
Style: ${style} - ${styleDesc}
Language: ${langInstruction}
Target duration: ~${targetDuration} seconds
${personaInstruction}

Generate a presenter-explainer script about "${topic}".`;

  const response = await llmCall(prompt);

  let parsed: unknown;
  try {
    const cleaned = response.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`LLM returned invalid JSON for presenter script: ${response.slice(0, 200)}`);
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.sections) || obj.sections.length === 0) {
    throw new Error('LLM response missing sections array');
  }

  const sections: PresenterSection[] = obj.sections.map((s: Record<string, unknown>) => {
    const spec = (s.boardImageSpec ?? {}) as Record<string, unknown>;
    return {
      text: String(s.text ?? ''),
      boardImageSpec: {
        type: (spec.type as BoardImageSpec['type']) ?? 'ai-gen',
        prompt: typeof spec.prompt === 'string' ? spec.prompt : undefined,
        url: typeof spec.url === 'string' ? spec.url : undefined,
        searchQuery: typeof spec.searchQuery === 'string' ? spec.searchQuery : undefined,
      },
      emotion: String(s.emotion ?? 'neutral'),
    };
  });

  return {
    sections,
    hook: String(obj.hook ?? ''),
    cta: String(obj.cta ?? ''),
    totalDuration: typeof obj.totalDuration === 'number' ? obj.totalDuration : targetDuration,
  };
}
