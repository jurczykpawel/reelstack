export type { EffectPlugin } from './registry';
export { registerEffect, getEffect, getAllEffects } from './registry';
export { useEffectAnimation } from './hooks/useEffectAnimation';
export { effectSegmentSchema } from './schemas';
export type {
  BaseEffectSegment,
  EffectSegment,
  EntranceAnimation,
  ExitAnimation,
  EmojiPopupEffect,
  TextEmphasisEffect,
  ScreenShakeEffect,
  ColorFlashEffect,
  PngOverlayEffect,
  GifOverlayEffect,
  BlurBackgroundEffect,
  ParallaxScreenshotEffect,
  SplitScreenDividerEffect,
  SubscribeBannerEffect,
  GlitchTransitionEffect,
  CircularCounterEffect,
  RectangularPipEffect,
} from './types';

// ── Auto-register built-in effects ──────────────────
import { registerEffect } from './registry';

import {
  emojiPopupSchema,
  textEmphasisSchema,
  screenShakeSchema,
  colorFlashSchema,
  pngOverlaySchema,
  gifOverlaySchema,
  blurBackgroundSchema,
  parallaxScreenshotSchema,
  splitScreenDividerSchema,
  subscribeBannerSchema,
  glitchTransitionSchema,
  circularCounterSchema,
  rectangularPipSchema,
} from './schemas';

import { EmojiPopup } from './components/EmojiPopup';
import { TextEmphasis } from './components/TextEmphasis';
import { ScreenShake } from './components/ScreenShake';
import { ColorFlash } from './components/ColorFlash';
import { PngOverlay } from './components/PngOverlay';
import { GifOverlay } from './components/GifOverlay';
import { BlurBackground } from './components/BlurBackground';
import { ParallaxScreenshot } from './components/ParallaxScreenshot';
import { SplitScreenDivider } from './components/SplitScreenDivider';
import { SubscribeBanner } from './components/SubscribeBanner';
import { GlitchTransition } from './components/GlitchTransition';
import { CircularCounter } from './components/CircularCounter';
import { RectangularPip } from './components/RectangularPip';

registerEffect({ type: 'emoji-popup',          name: 'Emoji Popup',          layer: 25, schema: emojiPopupSchema,          component: EmojiPopup,          defaultSfx: 'pop.mp3' });
registerEffect({ type: 'text-emphasis',         name: 'Text Emphasis',        layer: 26, schema: textEmphasisSchema,         component: TextEmphasis,        defaultSfx: 'whoosh.mp3' });
registerEffect({ type: 'screen-shake',          name: 'Screen Shake',         layer: 5,  schema: screenShakeSchema,          component: ScreenShake });
registerEffect({ type: 'color-flash',           name: 'Color Flash',          layer: 60, schema: colorFlashSchema,           component: ColorFlash });
registerEffect({ type: 'png-overlay',           name: 'PNG Overlay',          layer: 30, schema: pngOverlaySchema,           component: PngOverlay });
registerEffect({ type: 'gif-overlay',           name: 'GIF Overlay',          layer: 28, schema: gifOverlaySchema,           component: GifOverlay });
registerEffect({ type: 'blur-background',       name: 'Blur Background',      layer: 2,  schema: blurBackgroundSchema,       component: BlurBackground });
registerEffect({ type: 'parallax-screenshot',   name: 'Parallax Screenshot',  layer: 15, schema: parallaxScreenshotSchema,   component: ParallaxScreenshot });
registerEffect({ type: 'split-screen-divider',  name: 'Split Screen Divider', layer: 12, schema: splitScreenDividerSchema,  component: SplitScreenDivider });
registerEffect({ type: 'subscribe-banner',      name: 'Subscribe Banner',     layer: 42, schema: subscribeBannerSchema,      component: SubscribeBanner,     defaultSfx: 'ding.mp3' });
registerEffect({ type: 'glitch-transition',     name: 'Glitch Transition',    layer: 65, schema: glitchTransitionSchema,     component: GlitchTransition,    defaultSfx: 'glitch.mp3' });
registerEffect({ type: 'circular-counter',      name: 'Circular Counter',     layer: 44, schema: circularCounterSchema,      component: CircularCounter });
registerEffect({ type: 'rectangular-pip',       name: 'Rectangular PiP',      layer: 22, schema: rectangularPipSchema,       component: RectangularPip });
