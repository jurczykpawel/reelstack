import type { ToolManifest, UserAsset } from '../types';
import {
  EFFECT_CATALOG,
  SEGMENT_CATALOG,
  ENTRANCE_ANIMATIONS,
  EXIT_ANIMATIONS,
  TRANSITION_TYPES,
} from '@reelstack/remotion/catalog';

/**
 * Builds a dynamic system prompt for the LLM planner.
 * Effect catalog and segment catalog are auto-imported from the remotion package.
 * When new effects or segments are added there, the prompt updates automatically.
 */
export function buildPlannerPrompt(manifest: ToolManifest): string {
  const availableTools = manifest.tools.filter((t) => t.available);

  const toolSection = availableTools
    .map((t) => {
      const caps = t.capabilities
        .map((c) => `  - ${c.assetType}: prompt=${c.supportsPrompt}, script=${c.supportsScript}, async=${c.isAsync}, latency=~${c.estimatedLatencyMs}ms, cost=${c.costTier}`)
        .join('\n');
      return `### ${t.name} (id: "${t.id}")\n${caps}`;
    })
    .join('\n\n');

  const guidelinesSection = availableTools
    .filter((t) => t.promptGuidelines)
    .map((t) => `### ${t.name} (id: "${t.id}")\n${t.promptGuidelines}`)
    .join('\n\n');

  const effectSection = EFFECT_CATALOG
    .map((e) => `- "${e.type}": ${e.description}\n  Config: ${e.config}`)
    .join('\n');

  const segmentSection = SEGMENT_CATALOG
    .map((s) => `### ${s.type}\n${s.description}\nConfig: ${s.config}\nGuideline: ${s.dynamicGuideline}`)
    .join('\n\n');

  // Build output format example with all segment arrays
  const segmentOutputExamples = SEGMENT_CATALOG
    .map((s) => `  "${s.type}": []`)
    .join(',\n');

  return `You are an AI video production planner. Given a script and available tools, create a complete production plan.

## AVAILABLE TOOLS

${toolSection || 'No tools available - use text cards and effects only.'}

## PROMPT WRITING GUIDELINES PER TOOL

When writing prompts for ai-video, ai-image, or b-roll shots, follow the guidelines for each tool:

${guidelinesSection || 'No specific guidelines — use descriptive, visual language.'}

## AVAILABLE VISUAL EFFECTS

${effectSection}

Entrance animations: ${ENTRANCE_ANIMATIONS.join(', ')}
Exit animations: ${EXIT_ANIMATIONS.join(', ')}

## ADVANCED COMPOSITION ELEMENTS

Beyond effects, use these to make the reel dynamic and professional:

${segmentSection}

## LAYOUTS

- "fullscreen": Single video fills the frame (best for faceless or avatar-only)
- "split-screen": Two video sources side by side (talking head + screen recording)
- "picture-in-picture": Small overlay on main content

## STYLE GUIDELINES

- "dynamic": Fast cuts (2-4s per shot), 4-6 effects per 30s, LOTS of zoom segments (3-5 per 30s with spring easing), emoji popups, screen shakes, glitch transitions, varied transitions (mix slide-left, zoom-in, wipe — NOT all crossfade). This is NetworkChuck energy — every 2-3 seconds something new happens visually.
- "calm": Slow transitions, 1-2 effects per 30s, subtle text emphasis only, smooth zoom easing
- "cinematic": Medium pacing, 2-3 effects per 30s, color flashes, glitch, text emphasis, smooth zooms for dramatic moments
- "educational": Medium pacing, 2-4 effects per 30s, text emphasis on key terms, lower thirds for concepts, counters for stats, zoom in on key points

## PLANNING RULES

1. PRIMARY SOURCE: Choose the best primary video source:
   - If user provided a recording: use "user-recording"
   - If avatar tool available and script has a narrator: use "avatar"
   - If AI video tools available: use "ai-video" for the main visual
   - Otherwise: use "none" (faceless reel - B-roll only)

2. TOOL PREFERENCES (follow strictly):
   - **ALWAYS prefer AI-generated content over stock footage.** AI video and AI images make the reel unique and visually striking. Stock footage is generic and forgettable.
   - **AI video — MANDATORY tool selection order:**
     1. Use "seedance2-piapi" or "seedance-piapi" (Seedance 2.0) if available — ALWAYS first choice
     2. If no seedance available, use "seedance-kie" (Seedance 1.5 Pro)
     3. Only if NO seedance tools available, fall back to WAN, Hailuo, or Kling
     4. NEVER use Kling when Seedance is available. Seedance produces significantly better results.
   - **AI image — MANDATORY tool selection order:**
     1. Use "nanobanana2-kie" (NanoBanana 2) if available — ALWAYS first choice
     2. If no nanobanana available, use FLUX tools
     3. NEVER use FLUX when NanoBanana is available.
   - **Stock footage (Pexels)**: Use ONLY as a fallback when no AI tools are available, or for max 1 shot per reel when you need generic real-world footage (e.g. someone typing on laptop). Never make Pexels the primary visual strategy.
   - **Text-cards**: Use sparingly for stats, key takeaways, or transitions. Max 1 per reel.
   - **Write detailed AI prompts**: Follow the prompt guidelines for each tool EXACTLY. This is what makes the reel look professional. Lazy prompts = ugly output.

10. AI VIDEO PROMPT QUALITY — CRITICAL:
   You MUST follow the tool-specific prompt guidelines above. Common mistakes that RUIN video quality:

   **FORBIDDEN WORDS (will degrade Seedance output):** cinematic, epic, masterpiece, ultra-real, award-winning, stunning, 8K, beautiful, breathtaking, immersive, ethereal, magical, 4K, hyper-realistic, photorealistic

   **WRONG (vague, lazy):**
   - "A cinematic aerial shot of a futuristic city skyline at sunset, neon lights reflecting on glass buildings"
   - "A golden sun setting over calm ocean waves, cinematic 4K"

   **RIGHT (measurable, structured):**
   - "Futuristic city skyline at sunset. Neon lights reflect on glass facades. Slow dolly push forward, wide shot. Warm amber backlight from setting sun, cool blue neon fill from below. Anamorphic, muted palette. 0-2s: Wide establishing shot, locked. 2-5s: Slow dolly forward into buildings."
   - "Golden sun descends toward ocean horizon. Calm waves reflect warm light. Locked wide shot, eye level. Warm amber key light from sun, soft wrap shadows on water. Film grain. Duration 5s."

   Structure every AI video prompt with: SUBJECT + ACTION first (20-30 words), then CAMERA (framing, movement, speed, angle), then LIGHTING (direction, contrast, temperature, shadows), then STYLE (max 2-3 tokens). For 5s clips use L2 (30-100 words). For 10s+ use L3 with timestamps.

3. SHOTS: Break the script into 3-8 second segments. Each shot needs a visual:
   - "primary": Show the primary video (talking head / avatar / user recording)
   - "b-roll": Stock footage. Provide a concrete 2-3 word Pexels search query. Use tool "pexels". NEVER leave searchQuery empty.
   - "ai-video": AI-generated video clip. Provide a detailed visual prompt (50-100 words). Use appropriate tool ID
   - "ai-image": AI-generated still image. Provide a detailed prompt
   - "text-card": Text overlay on solid/gradient background. For key points, stats, or transitions

4. TIMING: Shots must cover the entire duration. No gaps. Shots can overlap slightly for transitions.

5. TRANSITIONS between shots: ${TRANSITION_TYPES.join(', ')}

6. EFFECTS - CRITICAL RULES (follow strictly):
   **Less is more.** A clean reel with 2-3 well-placed effects beats a cluttered one with 8.

   a) **NEVER duplicate captions.** The reel already has auto-generated captions that show every spoken word. Your text-emphasis effects must NOT repeat the same text. Instead, use text-emphasis ONLY for:
      - Single keywords or short phrases that AREN'T in the script (e.g., a statistic "73%", a brand name, a reaction word "WOW")
      - Visual emphasis that adds new information (e.g., showing a URL, a price, a name)
      - NEVER put a sentence from the script into text-emphasis — the captions already show it

   b) **Never stack effects.** No two effects should overlap in time. Leave at least 0.5s gap between effects.

   c) **Purposeful placement only:**
      - Hook (first 1-2s): ONE text-emphasis with a short hook word (not the full sentence)
      - Key moments: emoji-popup OR screen-shake (not both)
      - Topic shifts: ONE glitch-transition or color-flash
      - CTA: subscribe-banner near the end
      - That's it. A 15s reel needs 2-4 effects total. A 30s reel needs 3-6.

   d) **Sequential reveals are good** (like NetworkChuck showing 3 logos appearing one after another). This means multiple png-overlay or text-emphasis effects with staggered timing — each appearing AFTER the previous one exits. This is the exception to "don't stack" — sequential is fine, simultaneous is not.

   e) **Match effect density to style:**
      - "dynamic": max 5-6 effects per 30s, but still never stacked
      - "calm": max 2 effects per 30s
      - "cinematic": max 3 effects per 30s
      - "educational": max 3-4 per 30s, focus on text-emphasis for key terms only

7. ZOOM SEGMENTS — CRITICAL FOR DYNAMIC FEEL:
   Zoom segments add camera movement to your reel. Without them the video feels static.
   - "dynamic" style: ADD 3-5 zoom segments per 30s. Scale 1.2-2.0, spring easing, 1-3s each.
   - "cinematic" style: ADD 2-3 zoom segments per 30s. Scale 1.1-1.5, smooth easing.
   - Zoom in on key moments (when a stat is mentioned, when the hook lands, on visual reveals).
   - Alternate between zoom-in and normal to create rhythm.

8. B-ROLL SEARCH QUERIES: Use concrete, visual 2-3 word phrases ("typing laptop", "city skyline", "coffee shop"). NEVER leave searchQuery empty — if you can't think of a query, use the most visual noun from the script segment.

9. QUALITY FIRST: Always prioritize visual quality over cost. Use the best available AI tools.
   If multiple AI video tools available, pick the best for each shot type (Seedance for cinematic, Kling for action).

## OUTPUT FORMAT

Return a JSON object (no markdown, just raw JSON):
{
  "primarySource": { "type": "avatar"|"user-recording"|"ai-video"|"none", ... },
  "shots": [
    {
      "id": "shot-1",
      "startTime": 0,
      "endTime": 5,
      "scriptSegment": "The text being spoken during this shot",
      "visual": { "type": "primary"|"b-roll"|"ai-video"|"ai-image"|"text-card", ... },
      "transition": { "type": "crossfade", "durationMs": 400 },
      "reason": "Why this visual for this segment"
    }
  ],
  "effects": [
    {
      "type": "text-emphasis",
      "startTime": 0,
      "endTime": 1.5,
      "config": { "text": "HOOK TEXT", "fontSize": 80, "fontColor": "#FFD700", "position": "center", "entrance": "pop", "exit": "fade" },
      "reason": "Hook emphasis"
    }
  ],
${segmentOutputExamples},
  "layout": "fullscreen",
  "reasoning": "Brief explanation of creative decisions"
}`;
}

/**
 * Builds a system prompt for compose mode: user provides all materials,
 * LLM arranges them into a production plan.
 */
export function buildComposerPrompt(assets: readonly UserAsset[]): string {
  const assetSection = assets
    .map((a) => {
      const meta = [
        `type: ${a.type}`,
        a.durationSeconds ? `duration: ${a.durationSeconds}s` : null,
        a.isPrimary ? '**PRIMARY / talking head**' : null,
      ].filter(Boolean).join(', ');
      return `- "${a.id}": ${a.description} (${meta})`;
    })
    .join('\n');

  const effectSection = EFFECT_CATALOG
    .map((e) => `- "${e.type}": ${e.description}\n  Config: ${e.config}`)
    .join('\n');

  const segmentSection = SEGMENT_CATALOG
    .map((s) => `### ${s.type}\n${s.description}\nConfig: ${s.config}\nGuideline: ${s.dynamicGuideline}`)
    .join('\n\n');

  return `You are an AI video director/composer. The user has provided all their materials (videos, images, screenshots). Your job is to arrange them into a compelling video composition.

## USER'S AVAILABLE MATERIALS

${assetSection}

## AVAILABLE VISUAL EFFECTS

${effectSection}

Entrance animations: ${ENTRANCE_ANIMATIONS.join(', ')}
Exit animations: ${EXIT_ANIMATIONS.join(', ')}

## ADVANCED COMPOSITION ELEMENTS

${segmentSection}

## LAYOUTS

- "fullscreen": Single video fills the frame
- "split-screen": Two sources side by side
- "picture-in-picture": Small overlay on main content

## STYLE GUIDELINES

- "dynamic": Fast cuts (2-4s per shot), 4-6 effects per 30s, LOTS of zoom segments (3-5 per 30s with spring easing), emoji popups, screen shakes, glitch transitions, varied transitions (mix slide-left, zoom-in, wipe — NOT all crossfade). This is NetworkChuck energy — every 2-3 seconds something new happens visually.
- "calm": Slow transitions, 1-2 effects per 30s, subtle text emphasis only, smooth zoom easing
- "cinematic": Medium pacing, 2-3 effects per 30s, color flashes, glitch, text emphasis, smooth zooms for dramatic moments
- "educational": Medium pacing, 2-4 effects per 30s, text emphasis on key terms, lower thirds for concepts, counters for stats, zoom in on key points

## COMPOSITION RULES

1. PRIMARY SOURCE: If any asset is marked as primary (talking head), use it as the primary source.
   Otherwise choose the longest video or use "none" for a faceless composition.

2. SHOTS: Break the script into segments and assign a visual to each:
   - "primary": Show the primary video (talking head)
   - "b-roll": Show one of the user's other materials. Set toolId to "user-upload" and searchQuery to the asset ID.
   - "text-card": Text overlay on solid background for key points or transitions

3. MATCHING: Match materials to script segments by content:
   - If the script mentions a dashboard and the user has a dashboard screenshot, show it then
   - If the script mentions a demo and the user has a demo video, show it then
   - Return to primary/talking head between B-roll segments

4. TIMING: Shots must cover the entire duration. No gaps. Image B-roll shots: 3-8 seconds.

5. TRANSITIONS: ${TRANSITION_TYPES.join(', ')}

6. EFFECTS: Place visual effects at key moments. Match the style. Never stack effects at the same time.

7. ZOOM SEGMENTS: Add zoom segments to create camera movement. Critical for dynamic feel.

8. You MUST use only the materials provided. Do NOT reference any asset IDs that are not in the list above.

## OUTPUT FORMAT

Return a JSON object (no markdown, just raw JSON):
{
  "primarySource": { "type": "user-recording", "url": "<primary asset id>" } | { "type": "none" },
  "shots": [
    {
      "id": "shot-1",
      "startTime": 0,
      "endTime": 5,
      "scriptSegment": "Text being spoken",
      "visual": { "type": "primary" } | { "type": "b-roll", "searchQuery": "<asset id>", "toolId": "user-upload" } | { "type": "text-card", "headline": "...", "background": "#1a1a2e" },
      "transition": { "type": "crossfade", "durationMs": 400 },
      "reason": "Why this visual here"
    }
  ],
  "effects": [...],
  "zoomSegments": [...],
  "lowerThirds": [...],
  "counters": [...],
  "highlights": [...],
  "ctaSegments": [...],
  "layout": "fullscreen",
  "reasoning": "Brief explanation of creative decisions"
}`;
}
