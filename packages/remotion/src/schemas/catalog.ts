/**
 * Lightweight composition catalog — NO React imports.
 * Used by the agent package to auto-build LLM prompts.
 * When you add a new effect or segment type, add it here too.
 */

// ── Effect catalog ──────────────────────────────────────────

export interface EffectCatalogEntry {
  readonly type: string;
  readonly description: string;
  readonly config: string;
}

export const EFFECT_CATALOG: readonly EffectCatalogEntry[] = [
  {
    type: 'emoji-popup',
    description: 'Animated emoji reaction overlay',
    config: 'emoji (string), position ({x,y} percentage), size (number 20-300), rotation (number), entrance, exit',
  },
  {
    type: 'text-emphasis',
    description: 'Bold text flash overlay',
    config: 'text (string max 50 chars), fontSize (number 24-200), fontColor (string), backgroundColor (string, optional), position ("top"|"center"|"bottom"), entrance, exit',
  },
  {
    type: 'screen-shake',
    description: 'Camera shake/jitter effect',
    config: 'intensity (number 1-30), frequency (number 1-10). Duration: 0.3-0.5s',
  },
  {
    type: 'color-flash',
    description: 'Fullscreen color flash overlay',
    config: 'color (hex string), maxOpacity (0-1). Duration: 0.2-0.4s',
  },
  {
    type: 'glitch-transition',
    description: 'RGB split + scanlines + displacement',
    config: 'rgbSplitAmount (number 1-30), scanlineOpacity (0-1), displacement (number 1-50). Duration: 0.3-0.6s',
  },
  {
    type: 'subscribe-banner',
    description: 'Subscribe CTA banner',
    config: 'channelName (string), backgroundColor (hex), textColor (hex), position ("top"|"bottom"), entrance, exit',
  },
  {
    type: 'circular-counter',
    description: 'Animated circular progress counter',
    config: 'segments ([{value, holdFrames?}]), size (50-500), fillColor, trackColor, textColor, fontSize, strokeWidth, position ("center"|"top-right"|"top-left"|"bottom-right"|"bottom-left"), entrance, exit',
  },
  {
    type: 'png-overlay',
    description: 'Static image overlay',
    config: 'url (URL), position ({x,y} 0-100), size (5-100%), opacity (0-1), entrance, exit',
  },
  {
    type: 'gif-overlay',
    description: 'Animated GIF overlay',
    config: 'url (URL), position ({x,y} 0-100), size (5-100%), entrance, exit',
  },
  {
    type: 'blur-background',
    description: 'Blur background with optional overlay text/image',
    config: 'blurAmount (1-50), overlayUrl (optional), overlayText (optional), overlayFontSize, overlayColor',
  },
  {
    type: 'parallax-screenshot',
    description: '3D perspective scroll effect on screenshot/image',
    config: 'url (URL), scrollDirection ("up"|"down"), depth (0.5-3), borderRadius',
  },
  {
    type: 'split-screen-divider',
    description: 'Split screen with glowing animated divider',
    config: 'direction ("horizontal"|"vertical"), dividerWidth, dividerColor, animationSpeed (0.1-5)',
  },
  {
    type: 'rectangular-pip',
    description: 'Picture-in-picture video overlay with glowing border',
    config: 'videoUrl (URL), position ("top-left"|"top-right"|"bottom-left"|"bottom-right"), width (10-80%), height (10-80%), borderColor, borderWidth, borderGlow (boolean), borderRadius',
  },
];

// ── Segment catalog (non-effect composition elements) ────────

export interface SegmentCatalogEntry {
  readonly type: string;
  readonly description: string;
  readonly config: string;
  readonly dynamicGuideline: string;
}

export const SEGMENT_CATALOG: readonly SegmentCatalogEntry[] = [
  {
    type: 'zoomSegments',
    description: 'Punch-in zoom on base content — creates camera movement illusion',
    config: 'startTime, endTime, scale (1.0-3.0, default 1.5), focusPoint ({x,y} percentage, default center), easing ("spring"|"smooth")',
    dynamicGuideline: 'Use 3-5 per 30s with spring easing. Each 1-3s. Zoom in on key words, zoom out to reveal.',
  },
  {
    type: 'lowerThirds',
    description: 'Animated name/title bar at bottom of screen',
    config: 'startTime, endTime, title (string), subtitle (string, optional), backgroundColor (default #000000CC), textColor (default #FFFFFF), position ("left"|"center"), accentColor (default #3B82F6)',
    dynamicGuideline: 'Use to introduce tool names, URLs, handles. Max 2 per reel.',
  },
  {
    type: 'counters',
    description: 'Spring-animated number counter (0 → target)',
    config: 'startTime, endTime, value (number), prefix (e.g. "$"), suffix (e.g. "%"), format ("full"|"abbreviated"), textColor, fontSize, position ("center"|"top"|"bottom")',
    dynamicGuideline: 'Use for stats, prices, percentages. 2-3s duration.',
  },
  {
    type: 'highlights',
    description: 'Colored border rectangle with optional glow — points at things on screen',
    config: 'startTime, endTime, x, y, width, height (all percentages 0-100), color (default #FF0000), borderWidth, label (optional), glow (boolean)',
    dynamicGuideline: 'Use for UI demos to highlight buttons, inputs, areas of interest.',
  },
  {
    type: 'ctaSegments',
    description: 'Animated call-to-action button/banner',
    config: 'startTime, endTime, text (string), style ("button"|"banner"|"pill"), backgroundColor, textColor, position ("bottom"|"center"|"top")',
    dynamicGuideline: 'Use near the end. Max 1 per reel. "Follow for more" or product link.',
  },
];

// ── Animation catalogs ──────────────────────────────────────

export const ENTRANCE_ANIMATIONS = ['fade', 'spring-scale', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'glitch', 'bounce', 'pop', 'none'] as const;
export const EXIT_ANIMATIONS = ['fade', 'slide-down', 'shrink', 'glitch', 'none'] as const;
export const TRANSITION_TYPES = ['crossfade', 'slide-left', 'slide-right', 'zoom-in', 'wipe', 'none'] as const;
