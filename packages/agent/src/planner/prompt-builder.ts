import type { ToolManifest, UserAsset } from '../types';

/**
 * Available effect types and their configurable properties.
 * Extracted from the effect registry schemas at build time.
 * This avoids importing React components in the agent package.
 */
const EFFECT_CATALOG = [
  {
    type: 'emoji-popup',
    description: 'Animated emoji reaction overlay',
    config: 'emoji (string), position ({x,y} percentage), size (number), rotation (number), entrance, exit',
  },
  {
    type: 'text-emphasis',
    description: 'Bold text flash overlay',
    config: 'text (string), fontSize (number), fontColor (string), backgroundColor (string, optional), position ("top"|"center"|"bottom"), entrance, exit',
  },
  {
    type: 'screen-shake',
    description: 'Camera shake/jitter effect',
    config: 'intensity (number 1-20), frequency (number 1-10). Duration: 0.3-0.5s',
  },
  {
    type: 'color-flash',
    description: 'Fullscreen color flash overlay',
    config: 'color (hex string), maxOpacity (0-1). Duration: 0.2-0.4s',
  },
  {
    type: 'glitch-transition',
    description: 'RGB split + scanlines + displacement',
    config: 'rgbSplitAmount (number), scanlineOpacity (0-1), displacement (number). Duration: 0.3-0.6s',
  },
  {
    type: 'subscribe-banner',
    description: 'Subscribe CTA banner',
    config: 'channelName (string), backgroundColor (hex), textColor (hex), position ("top"|"bottom"), entrance, exit',
  },
  {
    type: 'circular-counter',
    description: 'Animated circular progress counter',
    config: 'segments ([{value, holdFrames?}]), size, fillColor, trackColor, textColor, fontSize, strokeWidth, position, entrance, exit',
  },
  {
    type: 'png-overlay',
    description: 'Static image overlay',
    config: 'src (URL), width, height, position ({x,y}), opacity, entrance, exit',
  },
  {
    type: 'gif-overlay',
    description: 'Animated GIF overlay',
    config: 'src (URL), width, height, position ({x,y}), opacity, entrance, exit',
  },
  {
    type: 'blur-background',
    description: 'Blur background with centered overlay',
    config: 'blurAmount (number), overlayOpacity (0-1), overlayColor (hex)',
  },
  {
    type: 'parallax-screenshot',
    description: '3D perspective tilt and scroll',
    config: 'src (URL), width, height, tiltX, tiltY, scrollDistance',
  },
  {
    type: 'split-screen-divider',
    description: 'Split screen with glowing divider',
    config: 'direction ("horizontal"|"vertical"), offset, dividerWidth, dividerColor, glowIntensity',
  },
];

const ENTRANCE_ANIMATIONS = ['fade', 'spring-scale', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'glitch', 'bounce', 'pop'];
const EXIT_ANIMATIONS = ['fade', 'slide-down', 'shrink', 'glitch'];

/**
 * Builds a dynamic system prompt for the LLM planner.
 * Includes available tools, effect types, and production guidelines.
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

## LAYOUTS

- "fullscreen": Single video fills the frame (best for faceless or avatar-only)
- "split-screen": Two video sources side by side (talking head + screen recording)
- "picture-in-picture": Small overlay on main content

## STYLE GUIDELINES

- "dynamic": Fast cuts, 4-6 effects per 30s, emoji popups, screen shakes, glitch transitions
- "calm": Slow transitions, 1-2 effects per 30s, subtle text emphasis only
- "cinematic": Medium pacing, 2-3 effects per 30s, color flashes, glitch, text emphasis
- "educational": Medium pacing, 2-4 effects per 30s, text emphasis on key terms, emoji for engagement

## PLANNING RULES

1. PRIMARY SOURCE: Choose the best primary video source:
   - If user provided a recording: use "user-recording"
   - If avatar tool available and script has a narrator: use "avatar"
   - If AI video tools available: use "ai-video" for the main visual
   - Otherwise: use "none" (faceless reel - B-roll only)

2. SHOTS: Break the script into 3-8 second segments. Each shot needs a visual:
   - "primary": Show the primary video (talking head / avatar / user recording)
   - "b-roll": Stock footage. Provide a 2-3 word Pexels search query. Use tool "pexels"
   - "ai-video": AI-generated video clip. Provide a detailed prompt. Use appropriate tool ID
   - "ai-image": AI-generated still image. Provide a detailed prompt
   - "text-card": Text overlay on solid/gradient background. For key points or transitions

3. TIMING: Shots must cover the entire duration. No gaps. Shots can overlap slightly for transitions.

4. TRANSITIONS between shots: crossfade (default), slide-left, slide-right, zoom-in, wipe, none

5. EFFECTS: Place visual effects at key moments. Never stack effects at the same time.
   - Hook: text-emphasis in first 2 seconds
   - Key moments: emoji-popup, screen-shake
   - Topic changes: glitch-transition, color-flash
   - CTA: subscribe-banner near the end

6. B-ROLL SEARCH QUERIES: Use concrete, visual 2-3 word phrases ("typing laptop", "city skyline", "coffee shop")

7. COST OPTIMIZATION: Prefer cheaper tools when quality difference is minimal.
   If multiple AI video tools available, distribute load or pick the best for each shot type.

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

  return `You are an AI video director/composer. The user has provided all their materials (videos, images, screenshots). Your job is to arrange them into a compelling video composition.

## USER'S AVAILABLE MATERIALS

${assetSection}

## AVAILABLE VISUAL EFFECTS

${effectSection}

Entrance animations: ${ENTRANCE_ANIMATIONS.join(', ')}
Exit animations: ${EXIT_ANIMATIONS.join(', ')}

## LAYOUTS

- "fullscreen": Single video fills the frame
- "split-screen": Two sources side by side
- "picture-in-picture": Small overlay on main content

## STYLE GUIDELINES

- "dynamic": Fast cuts, 4-6 effects per 30s, emoji popups, screen shakes, glitch transitions
- "calm": Slow transitions, 1-2 effects per 30s, subtle text emphasis only
- "cinematic": Medium pacing, 2-3 effects per 30s, color flashes, glitch, text emphasis
- "educational": Medium pacing, 2-4 effects per 30s, text emphasis on key terms, emoji for engagement

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

5. TRANSITIONS: crossfade (default), slide-left, slide-right, zoom-in, wipe, none

6. EFFECTS: Place visual effects at key moments. Match the style. Never stack effects at the same time.

7. You MUST use only the materials provided. Do NOT reference any asset IDs that are not in the list above.

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
  "layout": "fullscreen",
  "reasoning": "Brief explanation of creative decisions"
}`;
}
