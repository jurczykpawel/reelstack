// ==========================================
// Effect Animation Types
// ==========================================

export type EntranceAnimation =
  | 'spring-scale'
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'glitch'
  | 'bounce'
  | 'pop'
  | 'none';

export type ExitAnimation =
  | 'fade'
  | 'slide-down'
  | 'shrink'
  | 'glitch'
  | 'none';

// ==========================================
// Base Effect Segment
// ==========================================

export interface BaseEffectSegment {
  readonly type: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly entrance?: EntranceAnimation;
  readonly exit?: ExitAnimation;
  readonly sfx?: { readonly url: string; readonly volume?: number };
}

// ==========================================
// Concrete Effect Types
// ==========================================

export interface EmojiPopupEffect extends BaseEffectSegment {
  readonly type: 'emoji-popup';
  readonly emoji: string;
  readonly position?: { readonly x: number; readonly y: number };
  readonly size?: number;
  readonly rotation?: number;
}

export interface TextEmphasisEffect extends BaseEffectSegment {
  readonly type: 'text-emphasis';
  readonly text: string;
  readonly fontSize?: number;
  readonly fontColor?: string;
  readonly backgroundColor?: string;
  readonly position?: 'center' | 'top' | 'bottom';
}

export interface ScreenShakeEffect extends BaseEffectSegment {
  readonly type: 'screen-shake';
  readonly intensity?: number;
  readonly frequency?: number;
}

export interface ColorFlashEffect extends BaseEffectSegment {
  readonly type: 'color-flash';
  readonly color?: string;
  readonly maxOpacity?: number;
}

export interface PngOverlayEffect extends BaseEffectSegment {
  readonly type: 'png-overlay';
  readonly url: string;
  readonly position?: { readonly x: number; readonly y: number };
  readonly size?: number;
  readonly opacity?: number;
}

export interface GifOverlayEffect extends BaseEffectSegment {
  readonly type: 'gif-overlay';
  readonly url: string;
  readonly position?: { readonly x: number; readonly y: number };
  readonly size?: number;
}

export interface BlurBackgroundEffect extends BaseEffectSegment {
  readonly type: 'blur-background';
  readonly blurAmount?: number;
  readonly overlayUrl?: string;
  readonly overlayText?: string;
  readonly overlayFontSize?: number;
  readonly overlayColor?: string;
}

export interface ParallaxScreenshotEffect extends BaseEffectSegment {
  readonly type: 'parallax-screenshot';
  readonly url: string;
  readonly scrollDirection?: 'up' | 'down';
  readonly depth?: number;
  readonly borderRadius?: number;
}

export interface SplitScreenDividerEffect extends BaseEffectSegment {
  readonly type: 'split-screen-divider';
  readonly dividerColor?: string;
  readonly dividerWidth?: number;
  readonly direction?: 'horizontal' | 'vertical';
  readonly animationSpeed?: number;
}

export interface SubscribeBannerEffect extends BaseEffectSegment {
  readonly type: 'subscribe-banner';
  readonly channelName: string;
  readonly backgroundColor?: string;
  readonly textColor?: string;
  readonly position?: 'bottom' | 'top';
}

export interface GlitchTransitionEffect extends BaseEffectSegment {
  readonly type: 'glitch-transition';
  readonly rgbSplitAmount?: number;
  readonly scanlineOpacity?: number;
  readonly displacement?: number;
}

export interface CircularCounterEffect extends BaseEffectSegment {
  readonly type: 'circular-counter';
  readonly segments: ReadonlyArray<{ readonly value: number; readonly holdFrames?: number }>;
  readonly size?: number;
  readonly trackColor?: string;
  readonly fillColor?: string;
  readonly textColor?: string;
  readonly fontSize?: number;
  readonly strokeWidth?: number;
  readonly position?: 'center' | 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export interface RectangularPipEffect extends BaseEffectSegment {
  readonly type: 'rectangular-pip';
  readonly videoUrl: string;
  readonly position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  readonly width?: number;
  readonly height?: number;
  readonly borderColor?: string;
  readonly borderWidth?: number;
  readonly borderGlow?: boolean;
  readonly borderRadius?: number;
}

// ==========================================
// Discriminated Union
// ==========================================

export type EffectSegment =
  | EmojiPopupEffect
  | TextEmphasisEffect
  | ScreenShakeEffect
  | ColorFlashEffect
  | PngOverlayEffect
  | GifOverlayEffect
  | BlurBackgroundEffect
  | ParallaxScreenshotEffect
  | SplitScreenDividerEffect
  | SubscribeBannerEffect
  | GlitchTransitionEffect
  | CircularCounterEffect
  | RectangularPipEffect;
