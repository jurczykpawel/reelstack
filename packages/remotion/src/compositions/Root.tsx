import { Composition } from 'remotion';
import { ReelComposition } from './ReelComposition';
import { YouTubeLongFormComposition } from './YouTubeLongFormComposition';
import { ScreenExplainerComposition } from './ScreenExplainerComposition';
import { VideoClipComposition } from './VideoClipComposition';
import { PresenterExplainerComposition } from './PresenterExplainerComposition';
import type { ReelProps } from '../schemas/reel-props';
import type { YouTubeProps } from '../schemas/youtube-props';
import type { ScreenExplainerProps } from '../schemas/screen-explainer-props';
import type { VideoClipProps } from '../schemas/video-clip-props';
import type { PresenterExplainerProps } from '../schemas/presenter-explainer-props';
import { calculateReelMetadata, calculateScreenExplainerMetadata } from './calculate-metadata';
import { calculateYouTubeMetadata } from './calculate-youtube-metadata';

const FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 9:16 Vertical Reel (TikTok, Instagram, YouTube Shorts) */}
      <Composition
        id="Reel"
        component={ReelComposition}
        durationInFrames={FPS * 15}
        fps={FPS}
        width={1080}
        height={1920}
        calculateMetadata={calculateReelMetadata}
        defaultProps={{
          layout: 'split-screen' as const,
          bRollSegments: [
            {
              startTime: 3,
              endTime: 5,
              media: { url: '#e94560', type: 'color' as const, label: 'B-ROLL 1' },
              animation: 'spring-scale' as const,
            },
            {
              startTime: 9,
              endTime: 11,
              media: { url: '#e94560', type: 'color' as const, label: 'B-ROLL 2' },
              animation: 'spring-scale' as const,
            },
          ],
          cues: [
            { id: '1', text: 'To jest hook', startTime: 0, endTime: 2 },
            { id: '2', text: 'który przyciąga', startTime: 2, endTime: 4 },
            { id: '3', text: 'uwagę widza', startTime: 4, endTime: 6 },
            { id: '4', text: 'a tutaj substance', startTime: 6, endTime: 8 },
            { id: '5', text: 'z konkretnymi tipami', startTime: 8, endTime: 10 },
            { id: '6', text: 'i payoff na końcu', startTime: 10, endTime: 12 },
            { id: '7', text: 'z mocnym CTA', startTime: 12, endTime: 15 },
          ],
          pipSegments: [],
          lowerThirds: [],
          ctaSegments: [],
          counters: [],
          zoomSegments: [],
          highlights: [],
          effects: [
            // 0-1s: Text emphasis on hook
            { type: 'text-emphasis' as const, startTime: 0, endTime: 1.5, text: 'TO JEST HOOK', fontSize: 80, fontColor: '#FFD700', position: 'center' as const, entrance: 'pop' as const, exit: 'fade' as const, jitter: 0 },
            // 2s: Emoji reaction
            { type: 'emoji-popup' as const, startTime: 2, endTime: 3.5, emoji: '\uD83D\uDD25', position: { x: 80, y: 20 }, size: 100, rotation: -15, entrance: 'bounce' as const, exit: 'fade' as const },
            // 4s: Screen shake on emphasis
            { type: 'screen-shake' as const, startTime: 4, endTime: 4.5, intensity: 10, frequency: 3 },
            // 4.1s: Color flash paired with shake
            { type: 'color-flash' as const, startTime: 4.1, endTime: 4.5, color: '#FF4444', maxOpacity: 0.4 },
            // 6-8s: Glitch transition
            { type: 'glitch-transition' as const, startTime: 6, endTime: 6.6, rgbSplitAmount: 12, scanlineOpacity: 0.4, displacement: 20 },
            // 7-9s: Circular counter
            { type: 'circular-counter' as const, startTime: 7, endTime: 9.5, segments: [{ value: 40, holdFrames: 15 }, { value: 90 }], size: 180, fillColor: '#10B981', trackColor: '#1F2937', textColor: '#FFFFFF', fontSize: 44, strokeWidth: 12, position: 'top-right' as const, entrance: 'spring-scale' as const, exit: 'fade' as const },
            // 8s: Another emoji
            { type: 'emoji-popup' as const, startTime: 8, endTime: 9.5, emoji: '\uD83D\uDE80', position: { x: 20, y: 30 }, size: 90, rotation: 10, entrance: 'spring-scale' as const, exit: 'shrink' as const },
            // 10-11.5s: Subscribe banner
            { type: 'subscribe-banner' as const, startTime: 10, endTime: 12, channelName: '@ReelStack', backgroundColor: '#FF0000', textColor: '#FFFFFF', position: 'bottom' as const, entrance: 'slide-up' as const, exit: 'slide-down' as const },
            // 12s: Text emphasis on CTA
            { type: 'text-emphasis' as const, startTime: 12.5, endTime: 14, text: 'SUBSCRIBE!', fontSize: 96, fontColor: '#FFFFFF', backgroundColor: '#FF0000CC', position: 'center' as const, entrance: 'glitch' as const, exit: 'fade' as const, jitter: 0 },
            // 14s: Final color flash
            { type: 'color-flash' as const, startTime: 14, endTime: 14.5, color: '#FFFFFF', maxOpacity: 0.7 },
          ],
          dynamicCaptionPosition: false,
          musicVolume: 0.3,
          showProgressBar: true,
          backgroundColor: '#000000',
          speedRamps: [],
        }}
      />

      {/* 16:9 Horizontal YouTube Long-Form */}
      <Composition
        id="YouTubeLongForm"
        component={YouTubeLongFormComposition}
        durationInFrames={FPS * 60}
        fps={FPS}
        width={1920}
        height={1080}
        calculateMetadata={calculateYouTubeMetadata}
        defaultProps={{
          layout: 'sidebar' as const,
          bRollSegments: [],
          cues: [
            { id: '1', text: 'Welcome to this tutorial', startTime: 1, endTime: 3 },
            { id: '2', text: 'Today we will build something amazing', startTime: 3, endTime: 6 },
          ],
          chapters: [
            {
              startTime: 0,
              endTime: 2,
              number: 1,
              title: 'Introduction',
              style: 'fullscreen' as const,
              backgroundColor: '#0F0F0F',
              accentColor: '#3B82F6',
            },
            {
              startTime: 10,
              endTime: 12,
              number: 2,
              title: 'Getting Started',
              style: 'fullscreen' as const,
              backgroundColor: '#0F0F0F',
              accentColor: '#10B981',
            },
          ],
          sidebarPosition: 'right' as const,
          sidebarWidth: 30,
          pipSegments: [],
          ctaSegments: [],
          counters: [],
          highlights: [],
          zoomSegments: [
            { startTime: 6, endTime: 8, scale: 1.4, focusPoint: { x: 50, y: 40 }, easing: 'spring' as const },
          ],
          lowerThirds: [
            { startTime: 2, endTime: 6, title: 'Your Name', subtitle: 'Software Engineer', accentColor: '#3B82F6', textColor: '#FFFFFF', position: 'left' as const, backgroundColor: '#000000CC' },
          ],
          musicVolume: 0.15,
          showProgressBar: false,
          backgroundColor: '#0F0F0F',
        }}
      />
      {/* 9:16 Video Clip (ai-tips, multi-clip stitching) */}
      <Composition
        id="VideoClip"
        component={VideoClipComposition}
        durationInFrames={FPS * 30}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          clips: [{
            url: 'https://example.com/clip1.mp4',
            startTime: 0,
            endTime: 10,
            transition: 'crossfade' as const,
            transitionDurationMs: 300,
          }],
          cues: [
            { id: '1', text: 'First tip from your toaster', startTime: 0, endTime: 3 },
            { id: '2', text: 'Clear your temp files!', startTime: 3, endTime: 6 },
          ],
          durationSeconds: 30,
          musicVolume: 0.15,
          backgroundColor: '#000000',
        }}
      />

      {/* 9:16 Screen Explainer (n8n workflow tutorials) */}
      <Composition
        id="ScreenExplainer"
        component={ScreenExplainerComposition}
        durationInFrames={FPS * 45}
        fps={FPS}
        width={1080}
        height={1920}
        calculateMetadata={calculateScreenExplainerMetadata}
        defaultProps={{
          screenshotUrl: 'https://via.placeholder.com/1080x1920/1a1a2e/ffffff?text=n8n+Workflow',
          sections: [{
            text: 'This workflow shows how to automate image generation.',
            startTime: 0,
            endTime: 10,
            boardType: 'bird-eye' as const,
            kenBurns: { startScale: 1.0, endScale: 1.05, startPosition: { x: 50, y: 50 }, endPosition: { x: 50, y: 50 } },
          }],
          cues: [
            { id: '1', text: 'This workflow shows', startTime: 0, endTime: 2 },
            { id: '2', text: 'how to automate', startTime: 2, endTime: 4 },
            { id: '3', text: 'image generation', startTime: 4, endTime: 6 },
          ],
          voiceoverUrl: '',
          durationSeconds: 45,
          backgroundColor: '#1a1a2e',
        }}
      />

      {/* 9:16 Presenter Explainer (avatar + board images) */}
      <Composition
        id="PresenterExplainer"
        component={PresenterExplainerComposition}
        durationInFrames={FPS * 60}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          boardSections: [{
            imageUrl: 'https://example.com/board1.png',
            startTime: 0,
            endTime: 30,
            transition: 'crossfade' as const,
            transitionDurationMs: 300,
          }],
          avatarVideoUrl: 'https://example.com/avatar.mp4',
          cues: [
            { id: '1', text: 'Welcome to this explainer', startTime: 0, endTime: 3 },
            { id: '2', text: 'Let me show you something', startTime: 3, endTime: 6 },
          ],
          durationSeconds: 60,
          musicVolume: 0.15,
          backgroundColor: '#0a0a14',
          boardHeightPercent: 50,
        }}
      />
    </>
  );
};
