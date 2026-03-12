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
  /** Default SFX ID from SFX_CATALOG (auto-applied unless overridden) */
  readonly defaultSfx?: string;
  /** Which video styles should use this effect */
  readonly recommendedStyles?: readonly ('dynamic' | 'calm' | 'cinematic' | 'educational')[];
  /** Short hint WHEN to use this effect (e.g., "at punchlines", "on topic shifts") */
  readonly styleHint?: string;
}

export const EFFECT_CATALOG: readonly EffectCatalogEntry[] = [
  {
    type: 'emoji-popup',
    description: 'Animated emoji reaction overlay',
    config: 'emoji (string), position ({x,y} percentage), size (number 20-300), rotation (number), entrance, exit',
    defaultSfx: 'pop',
    recommendedStyles: ['dynamic', 'educational'],
    styleHint: 'reactions, reveals, funny moments',
  },
  {
    type: 'text-emphasis',
    description: 'Bold text flash overlay',
    config: 'text (string max 50 chars), fontSize (number 24-200), fontColor (string), backgroundColor (string, optional), position ("top"|"center"|"bottom"), jitter (number 0-10, random per-frame x/y offset in px, 0=off, 3-5=glitchy), neonGlow (hex color, optional — adds pulsing neon drop-shadow), entrance, exit',
    defaultSfx: 'whoosh',
    recommendedStyles: ['dynamic', 'cinematic', 'educational'],
    styleHint: 'hook word, key terms, URLs, prices — NOT captions text',
  },
  {
    type: 'screen-shake',
    description: 'Camera shake/jitter effect',
    config: 'intensity (number 1-30), frequency (number 1-10). Duration: 0.3-0.5s',
    recommendedStyles: ['dynamic'],
    styleHint: 'impact moments, shocking stats, emphasis',
  },
  {
    type: 'color-flash',
    description: 'Fullscreen color flash overlay',
    config: 'color (hex string), maxOpacity (0-1). Duration: 0.2-0.4s',
    recommendedStyles: ['dynamic', 'cinematic'],
    styleHint: 'topic shifts, dramatic beats',
  },
  {
    type: 'glitch-transition',
    description: 'RGB split + scanlines + displacement',
    config: 'rgbSplitAmount (number 1-30), scanlineOpacity (0-1), displacement (number 1-50). Duration: 0.3-0.6s',
    defaultSfx: 'glitch',
    recommendedStyles: ['dynamic', 'cinematic'],
    styleHint: 'topic/scene changes, tech themes',
  },
  {
    type: 'subscribe-banner',
    description: 'Subscribe CTA banner',
    config: 'channelName (string), backgroundColor (hex), textColor (hex), position ("top"|"bottom"), entrance, exit',
    defaultSfx: 'ding',
    recommendedStyles: ['dynamic', 'calm', 'cinematic', 'educational'],
    styleHint: 'near the end of reel, max 1 per reel',
  },
  {
    type: 'circular-counter',
    description: 'Animated circular progress counter',
    config: 'segments ([{value, holdFrames?}]), size (50-500), fillColor, trackColor, textColor, fontSize, strokeWidth, position ("center"|"top-right"|"top-left"|"bottom-right"|"bottom-left"), entrance, exit',
    recommendedStyles: ['dynamic', 'educational'],
    styleHint: 'stats, percentages, progress indicators',
  },
  {
    type: 'png-overlay',
    description: 'Static image overlay',
    config: 'url (URL), position ({x,y} 0-100), size (5-100%), opacity (0-1), animation ("none"|"bounce-pulse" — bounce-pulse=spring entrance + gentle scale pulsing), entrance, exit',
    recommendedStyles: ['dynamic', 'educational'],
    styleHint: 'logos, screenshots, product images',
  },
  {
    type: 'gif-overlay',
    description: 'Animated GIF overlay',
    config: 'url (URL), position ({x,y} 0-100), size (5-100%), entrance, exit',
    recommendedStyles: ['dynamic'],
    styleHint: 'animated reactions, memes',
  },
  {
    type: 'blur-background',
    description: 'Blur background with optional overlay text/image',
    config: 'blurAmount (1-50), overlayUrl (optional), overlayText (optional), overlayFontSize, overlayColor, mode ("blur"|"spotlight" — spotlight=dim 70% with circle spotlight), focusPoint ({x,y} % for spotlight center), spotlightRadius (5-50% of screen width)',
    recommendedStyles: ['cinematic', 'educational'],
    styleHint: 'focus attention on overlay content',
  },
  {
    type: 'parallax-screenshot',
    description: '3D perspective scroll effect on screenshot/image',
    config: 'url (URL), scrollDirection ("up"|"down"), depth (0.5-3), borderRadius, tiltMode ("subtle"|"3d" — 3d=rotateY(-10deg) with deep shadow and borderRadius:24)',
    recommendedStyles: ['dynamic', 'cinematic', 'educational'],
    styleHint: 'app/website demos, long screenshots',
  },
  {
    type: 'split-screen-divider',
    description: 'Split screen with glowing animated divider',
    config: 'direction ("horizontal"|"vertical"), dividerWidth, dividerColor, animationSpeed (0.1-5)',
    recommendedStyles: ['cinematic'],
    styleHint: 'comparisons, before/after',
  },
  {
    type: 'rectangular-pip',
    description: 'Picture-in-picture video overlay with glowing border',
    config: 'videoUrl (URL), position ("top-left"|"top-right"|"bottom-left"|"bottom-right"), width (10-80%), height (10-80%), borderColor, borderWidth, borderGlow (boolean), borderRadius, shape ("rectangle"|"circle" — circle=round PiP with pulsing neon glow)',
    recommendedStyles: ['educational'],
    styleHint: 'screen recording with talking head',
  },
  {
    type: 'sticker-burst',
    description: 'Multiple colorful decorative shapes fly in from one side — creates energy burst / reaction moment',
    config: 'side ("left"|"right"), count (2-5, default 3), colors (array of hex, optional), shapes (array of "burst"|"sparkle"|"diamond"|"star", optional). Duration: 0.5-1.5s.',
    defaultSfx: 'whoosh',
    recommendedStyles: ['dynamic'],
    styleHint: 'punchlines, reveals, topic transitions, wow moments',
  },
  {
    type: 'crt-overlay',
    description: 'CRT monitor effect — horizontal scanlines + animated film grain. Full-reel overlay (set startTime=0, endTime=total duration).',
    config: 'opacity (0.01-0.2, default 0.08), scanlineSpacing (1-8px, default 4), grainIntensity (0-1, default 0.3)',
    recommendedStyles: ['dynamic'],
    styleHint: 'hacker/retro/terminal aesthetic — use for entire reel, not per-shot',
  },
  {
    type: 'vignette-overlay',
    description: 'Darkened corners via radial gradient. Full-reel overlay for cinematic/moody look.',
    config: 'intensity (0.05-0.8, default 0.3), color (hex, default #000000)',
    recommendedStyles: ['dynamic', 'cinematic'],
    styleHint: 'cinematic mood, dark/moody aesthetic — use for entire reel',
  },
  {
    type: 'progress-ring',
    description: 'Animated SVG progress ring filling from 0% to target',
    config: 'targetPercent (0-100, REQUIRED), size (50-500, default 200), strokeWidth (4-40, default 12), fillColor (hex), trackColor (hex), label (string, optional — auto-shows percentage if omitted), labelFontSize, labelColor, position ("center"|"top-right"|"top-left"|"bottom-right"|"bottom-left"), entrance, exit',
    recommendedStyles: ['dynamic', 'educational'],
    styleHint: 'stats, progress indicators, completion rates, scores',
  },
  {
    type: 'chromatic-aberration',
    description: 'Subtle permanent RGB split — red/blue channel offset. Full-reel overlay.',
    config: 'intensity (0.01-0.2, fraction of frame width, default 0.05)',
    recommendedStyles: ['dynamic'],
    styleHint: 'glitchy/tech aesthetic — use for entire reel, not per-shot',
  },
  {
    type: 'terminal-typing',
    description: 'Terminal/code typing animation — text appears letter-by-letter with blinking cursor in a dark terminal box',
    config: 'text (string, REQUIRED — the command/code to type), fontSize (16-80, default 32), fontColor (hex, default #00FF00), backgroundColor (hex, default #1E1E1E), showCursor (bool, default true), cursorChar (string, default "▌"), prompt (string, default "$ "), position ("center"|"top"|"bottom")',
    defaultSfx: 'keyboard',
    recommendedStyles: ['dynamic', 'educational'],
    styleHint: 'terminal commands, code snippets, CLI demos — profile: network-chuck, dev content',
  },
  {
    type: 'film-grain',
    description: 'Subtle film noise texture overlay. Full-reel overlay for cinematic/vintage look.',
    config: 'intensity (0.01-0.5, default 0.15)',
    recommendedStyles: ['cinematic'],
    styleHint: 'cinematic/vintage aesthetic — use for entire reel, pairs well with vignette',
  },
  {
    type: 'light-leak',
    description: 'Warm drifting light leak overlay — animated gradient spots. Full-reel overlay.',
    config: 'color (hex, default #FF6B35), intensity (0.05-0.6, default 0.3), speed (0.1-3, default 1)',
    recommendedStyles: ['cinematic', 'calm'],
    styleHint: 'warm/dreamy aesthetic — use for entire reel, subtle warmth',
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
    config: 'startTime, endTime, scale (1.0-3.0, default 1.5), focusPoint ({x,y} percentage, default center), easing ("spring"|"smooth"|"instant" — instant=jump-cut zoom, no transition)',
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
    description: 'Spring-animated number counter — MANDATORY for any number/stat/percentage in the script',
    config: 'startTime, endTime, value (number), prefix (e.g. "$"), suffix (e.g. "%"), format ("full"|"abbreviated"), textColor, fontSize, position ("center"|"top"|"bottom"), mode ("count-up"|"countdown" — count-up=0→value default, countdown=value→0 with mono font)',
    dynamicGuideline: 'ALWAYS use when script mentions a number, stat, price, or percentage. 2-3s duration. Pair with "rise" SFX.',
  },
  {
    type: 'highlights',
    description: 'Colored rectangle highlight — points at things on screen',
    config: 'startTime, endTime, x, y, width, height (all percentages 0-100), color (default #FF0000), borderWidth, label (optional), glow (boolean), style ("border"|"marker" — border=outline box, marker=filled semi-transparent highlighter pen)',
    dynamicGuideline: 'Use for UI demos to highlight buttons, inputs, areas of interest. COMBO: pair with B-roll image (auto Ken Burns) for document/screenshot walkthroughs — slow zoom + highlight markers appearing on key phrases.',
  },
  {
    type: 'ctaSegments',
    description: 'Animated call-to-action button/banner',
    config: 'startTime, endTime, text (string), style ("button"|"banner"|"pill"), backgroundColor, textColor, position ("bottom"|"center"|"top")',
    dynamicGuideline: 'Use near the end. Max 1 per reel. "Follow for more" or product link.',
  },
  {
    type: 'speedRamps',
    description: 'Speed ramp — slow motion / fast forward on base video',
    config: 'startTime, endTime, rate (0.1-4.0, default 1.0 — 0.3=slow-mo, 2.0=fast forward)',
    dynamicGuideline: 'Use 0.3x slow-mo at dramatic reveals, punchlines. Use 2-4x fast-forward for skippable setup/transitions. Max 2-3 per reel. Each 0.5-2s. Extremely popular on TikTok.',
  },
];

// ── Sound effects catalog ───────────────────────────────────

export interface SfxCatalogEntry {
  readonly id: string;
  readonly description: string;
  readonly durationMs: number;
}

/**
 * Built-in SFX files in public/sfx/.
 * The LLM director can reference these by ID (e.g. "whoosh") in effect configs.
 */
export const SFX_CATALOG: readonly SfxCatalogEntry[] = [
  { id: 'pop',     description: 'Quick pop/bubble sound — emoji reactions, item appearing',     durationMs: 480 },
  { id: 'whoosh',  description: 'Swoosh/whoosh — text emphasis, slide transitions, fast motion', durationMs: 600 },
  { id: 'ding',    description: 'Bell/notification ding — subscribe banners, achievements',      durationMs: 800 },
  { id: 'glitch',  description: 'Digital glitch noise — glitch transitions, error moments',      durationMs: 500 },
  { id: 'swipe',   description: 'Swipe/slide sound — screen transitions, card reveals',          durationMs: 500 },
  { id: 'click',   description: 'UI click sound — button presses, selections',                   durationMs: 400 },
  { id: 'rise',    description: 'Rising tone — counters going up, building tension',              durationMs: 1000 },
  { id: 'keyboard', description: 'Rapid mechanical keyboard typing burst — code/terminal scenes',  durationMs: 400 },
  { id: 'thud',     description: 'Deep bass thud/hit — emotional accent, impact moments',          durationMs: 400 },
];

/** Map SFX ID to URL path in public/sfx/ */
export function sfxIdToUrl(sfxId: string): string {
  return `sfx/${sfxId}.mp3`;
}

// ── Font catalog ────────────────────────────────────────────
// Single source of truth for all loadable fonts.
// ReelComposition.tsx loads these; prompt-builder.ts lists them for the LLM.

export const FONT_CATALOG = [
  'Arial', 'Helvetica', 'Inter', 'Outfit', 'Roboto', 'Montserrat', 'Poppins', 'Ubuntu',
  'Fira Code', 'JetBrains Mono',
] as const;

// ── Layout catalog ──────────────────────────────────────────

export interface LayoutCatalogEntry {
  readonly type: string;
  readonly description: string;
}

export const LAYOUT_CATALOG: readonly LayoutCatalogEntry[] = [
  { type: 'fullscreen', description: 'Single video fills the frame (best for faceless or avatar-only reels)' },
  { type: 'split-screen', description: 'Two video sources side by side (talking head + screen recording)' },
  { type: 'picture-in-picture', description: 'Small overlay on main content' },
];

// ── Caption style property catalog ──────────────────────────
// Tells the LLM what captionStyle properties are available and what they do.
// Derived from SubtitleStyle interface in @reelstack/types.

export interface CaptionPropertyCatalogEntry {
  readonly key: string;
  readonly type: string;
  readonly description: string;
}

export const CAPTION_PROPERTY_CATALOG: readonly CaptionPropertyCatalogEntry[] = [
  { key: 'fontFamily', type: 'string', description: `One of: ${['Arial', 'Helvetica', 'Inter', 'Outfit', 'Roboto', 'Montserrat', 'Poppins', 'Ubuntu'].map(f => `"${f}"`).join(', ')}` },
  { key: 'fontSize', type: 'number', description: '48-96 for reels, bigger = more impact' },
  { key: 'fontColor', type: 'hex', description: 'Text color (e.g. "#FFFFFF")' },
  { key: 'fontWeight', type: '"normal" | "bold"', description: 'Font weight' },
  { key: 'backgroundColor', type: 'hex', description: 'Caption background box color' },
  { key: 'backgroundOpacity', type: '0-1', description: '0 = no background box, 1 = solid' },
  { key: 'outlineColor', type: 'hex', description: 'Text outline/stroke color' },
  { key: 'outlineWidth', type: '0-5', description: '0 = no outline' },
  { key: 'shadowBlur', type: '0-20', description: 'Text shadow blur radius' },
  { key: 'position', type: '0-100', description: 'Vertical %, 0=top, 100=bottom, 70-80 recommended' },
  { key: 'highlightColor', type: 'hex', description: 'Color for highlighted/active word' },
  { key: 'highlightMode', type: '"text" | "pill" | "label" | "hormozi" | "glow" | "pop-word" | "underline-sweep" | "box-highlight"', description: '"text" = color change, "pill" = rounded pill, "label" = rectangular box, "hormozi" = colored text + scale(1.15), "glow" = text-shadow glow, "pop-word" = scale(1.2) pop, "underline-sweep" = bottom border accent, "box-highlight" = semi-transparent bg + left border accent' },
  { key: 'textTransform', type: '"none" | "uppercase"', description: 'TikTok/MrBeast style = uppercase' },
  { key: 'pillColor', type: 'hex', description: 'Background color of the pill highlight (when highlightMode="pill")' },
  { key: 'pillBorderRadius', type: 'number', description: 'Border radius of the pill highlight' },
];

// ── Animation catalogs ──────────────────────────────────────

export const ENTRANCE_ANIMATIONS = [
  'fade', 'spring-scale', 'slide-up', 'slide-down', 'slide-left', 'slide-right',
  'glitch', 'bounce', 'pop', 'flip-up', 'elastic', 'zoom-blur', 'flicker', 'ink-print', 'none',
] as const;
export const EXIT_ANIMATIONS = [
  'fade', 'slide-down', 'slide-up', 'slide-left',
  'shrink', 'scale-blur', 'pop-out', 'glitch', 'none',
] as const;
export const LOOP_ANIMATIONS = [
  'pulse', 'wave', 'shake', 'swing', 'neon-pulse', 'float', 'color-cycle', 'none',
] as const;

// ── Transition catalog ──────────────────────────────────────

export interface TransitionCatalogEntry {
  readonly type: string;
  readonly description: string;
  readonly recommendedStyles?: readonly ('dynamic' | 'calm' | 'cinematic' | 'educational')[];
}

export const TRANSITION_CATALOG: readonly TransitionCatalogEntry[] = [
  { type: 'crossfade', description: 'Smooth opacity blend', recommendedStyles: ['calm', 'cinematic', 'educational'] },
  { type: 'slide-left', description: 'Slide in from the right', recommendedStyles: ['dynamic', 'educational'] },
  { type: 'slide-right', description: 'Slide in from the left', recommendedStyles: ['dynamic'] },
  { type: 'slide-perspective-right', description: '3D card sliding in from right with perspective depth — left edge closer, right edge recedes', recommendedStyles: ['dynamic', 'cinematic'] },
  { type: 'zoom-in', description: 'Zoom and crossfade', recommendedStyles: ['dynamic', 'cinematic'] },
  { type: 'wipe', description: 'Horizontal wipe reveal', recommendedStyles: ['dynamic'] },
  { type: 'blur-dissolve', description: 'Blur-to-sharp dissolve — clean, professional transition', recommendedStyles: ['calm', 'cinematic'] },
  { type: 'flash-white', description: 'White flash between clips — beat-sync staple', recommendedStyles: ['dynamic'] },
  { type: 'whip-pan', description: 'Fast slide with directional motion blur', recommendedStyles: ['dynamic'] },
  { type: 'cross-zoom', description: 'Zoom in with blur, then zoom out revealing new clip', recommendedStyles: ['dynamic', 'cinematic'] },
  { type: 'iris-circle', description: 'Circular reveal expanding from center', recommendedStyles: ['dynamic', 'cinematic'] },
  { type: 'spin', description: 'Rotating entrance with scale — energetic, playful', recommendedStyles: ['dynamic'] },
  { type: 'none', description: 'Hard cut', recommendedStyles: ['dynamic'] },
];

/** Flat list of transition type strings (backward compat) */
export const TRANSITION_TYPES = TRANSITION_CATALOG.map(t => t.type);

// ── Montage profile catalog ─────────────────────────────────
// Director style profiles that determine pacing, transitions, SFX, and rules.
// Independent from layouts — any profile can combine with any layout.

export interface MontageProfileEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly pacing: 'fast' | 'very-fast' | 'extreme';
  readonly maxShotDurationSec: number;
  readonly effectsPerThirtySec: number;
  readonly allowedTransitions: readonly string[];
  readonly sfxMapping: Record<string, string>;
  readonly directorRules: readonly string[];
  readonly topicKeywords: readonly string[];
  readonly toolPreference: readonly string[];
  readonly colorPalette: Record<string, string>;
  /** CSS filter string auto-applied to B-roll segments (e.g. 'brightness(0.8) contrast(1.1)'). */
  readonly bRollFilter?: string;
}

export const MONTAGE_PROFILE_CATALOG: readonly MontageProfileEntry[] = [
  {
    id: 'network-chuck',
    name: 'Cyber-Retro Terminal',
    description: 'Hackerski styl z glitch transitions, neon magenta/cyan, grain, tempo co 2-3s',
    pacing: 'fast',
    maxShotDurationSec: 4,
    effectsPerThirtySec: 12,
    allowedTransitions: ['none', 'wipe', 'slide-perspective-right', 'zoom-in'],
    sfxMapping: {
      'text-appear': 'glitch',
      'cut': 'whoosh',
      'code': 'keyboard',
      'error': 'glitch',
      'transition': 'swipe',
      'zoom-accent': 'thud',
    },
    directorRules: [
      'Visual change every 2-3s. Shot >4s without zoom/effect is an error.',
      'Glitch transition on EVERY face-to-content switch (RGB split, 5-8 frames).',
      'When speaker says tool/file name, show screenshot IMMEDIATELY (0ms delay).',
      'Emotional zoom 1.2-1.4x + blur + SFX thud on words like "Look at this!", "Crazy", "Never".',
      'No UI element static >1s. Add micro-jitter (0.5deg rotation, 3px float).',
      'Every on-screen element MUST have SFX. No SFX = critical error.',
      'Tech name = glitch text overlay with jitter + neon glow.',
    ],
    topicKeywords: ['coding', 'terminal', 'hacking', 'linux', 'cybersecurity', 'dark', 'tech', 'python', 'docker', 'devops'],
    toolPreference: ['ai-video', 'ai-image', 'pexels'],
    colorPalette: {
      danger: '#ff0055',
      accent: '#00f2ff',
      background: '#0a0a14',
    },
    bRollFilter: 'contrast(1.1) saturate(0.8)',
  },
  {
    id: 'leadgen-man',
    name: 'Clean-Corporate-Dynamic',
    description: 'Korporacyjny styl, jasne tla, Hormozi-style captions, tempo co 1-1.5s',
    pacing: 'very-fast',
    maxShotDurationSec: 3,
    effectsPerThirtySec: 15,
    allowedTransitions: ['crossfade', 'slide-left', 'zoom-in', 'blur-dissolve'],
    sfxMapping: {
      'text-appear': 'pop',
      'cut': 'whoosh',
      'click': 'click',
      'error': 'ding',
      'transition': 'swipe',
    },
    directorRules: [
      'Hormozi-Style Captions: central, UPPERCASE, Montserrat Black. Active word = YELLOW + scale(1.15). Spring bounce entrance.',
      'B-Roll First: when text allows illustration ("System", "Growth", "Client"), full-screen stock over face.',
      'Word-to-Visual: "Money" = money rain/dollar icon. "People" = crowd/office. Map nouns to concrete visuals.',
      'Floating UI (3D Perspective): screenshots NEVER flat. borderRadius:24px, deep shadow, rotateY(-10deg).',
      'Emoji Sprinkling: colorful emoji "pop" next to key words, shake 0.5s.',
      'SFX on every movement: text appear = pop, screen = swoosh, transition = deep whoosh.',
    ],
    topicKeywords: ['business', 'marketing', 'saas', 'motivational', 'linkedin', 'growth', 'luxury', 'sales', 'entrepreneur'],
    toolPreference: ['pexels', 'ai-image', 'ai-video'],
    colorPalette: {
      highlight: '#FFFF00',
      text: '#FFFFFF',
      background: '#FAFAFA',
    },
    bRollFilter: 'brightness(0.85) contrast(1.1)',
  },
  {
    id: 'ai-tool-showcase',
    name: 'Speed Review',
    description: 'Szybki przeglad narzedzi AI, duzo ikon/logo, label-style napisy, tempo 1-2s',
    pacing: 'extreme',
    maxShotDurationSec: 3,
    effectsPerThirtySec: 18,
    allowedTransitions: ['slide-left', 'slide-right', 'crossfade', 'blur-dissolve'],
    sfxMapping: {
      'logo-appear': 'pop',
      'tool-switch': 'swipe',
      'click': 'click',
      'achievement': 'ding',
      'transition': 'whoosh',
    },
    directorRules: [
      'PNG Logic: when tool name is mentioned (ChatGPT, Claude, etc.), IMMEDIATELY show logo/icon with bounce + SFX pop. Icons pulse scale 1.0-1.1.',
      'Screen-to-Face: on "Look at this tool", face shrinks to corner PiP, screen recording slides in. Smooth morph.',
      'Subtitles Label Style: captions with backgroundColor + padding around each word/phrase (readable on bright screens).',
      'Speed-run pacing: each tool gets max 3-5s (name + 1 screenshot + 1 feature), then next.',
      'Clearbit/logo matching: fetch tool logo by name (cheaper than stocks).',
    ],
    topicKeywords: ['ai-tool', 'tutorial', 'speed-run', 'tool-list', 'website-review', 'review', 'comparison', 'software'],
    toolPreference: ['logo-png', 'screenshot', 'ai-image', 'pexels'],
    colorPalette: {
      highlight: '#FFFF00',
      text: '#FFFFFF',
      label: '#000000',
    },
  },
];
