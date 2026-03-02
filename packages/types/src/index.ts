// ==========================================
// Subtitle Types
// ==========================================

export interface SubtitleWord {
  readonly text: string;
  readonly startTime: number; // seconds
  readonly endTime: number; // seconds
}

export type CaptionAnimationStyle =
  | 'none'
  | 'word-highlight'
  | 'word-by-word'
  | 'karaoke'
  | 'bounce'
  | 'typewriter';

export interface SubtitleCue {
  readonly id: string;
  readonly startTime: number; // seconds
  readonly endTime: number; // seconds
  readonly text: string;
  readonly words?: readonly SubtitleWord[];
  readonly animationStyle?: CaptionAnimationStyle;
}

export interface SubtitleTrack {
  readonly id: string;
  readonly videoId: string;
  readonly cues: readonly SubtitleCue[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ==========================================
// Style Types
// ==========================================

export type TextAlignment = 'left' | 'center' | 'right';

export interface SubtitleStyle {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontColor: string;
  readonly fontWeight: 'normal' | 'bold';
  readonly fontStyle: 'normal' | 'italic';
  readonly backgroundColor: string;
  readonly backgroundOpacity: number;
  readonly outlineColor: string;
  readonly outlineWidth: number;
  readonly shadowColor: string;
  readonly shadowBlur: number;
  readonly position: number; // vertical percentage 0-100 (0 = top, 100 = bottom)
  readonly alignment: TextAlignment;
  readonly lineHeight: number;
  readonly padding: number;
  readonly highlightColor?: string;
  readonly upcomingColor?: string;
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontFamily: 'Arial',
  fontSize: 24,
  fontColor: '#FFFFFF',
  fontWeight: 'normal',
  fontStyle: 'normal',
  backgroundColor: '#000000',
  backgroundOpacity: 0.7,
  outlineColor: '#000000',
  outlineWidth: 2,
  shadowColor: '#000000',
  shadowBlur: 4,
  position: 90,
  alignment: 'center',
  lineHeight: 1.4,
  padding: 8,
};

// ==========================================
// Template Types
// ==========================================

export type TemplateCategory = 'minimal' | 'cinematic' | 'bold' | 'modern' | 'custom';

export interface SubtitleTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly style: SubtitleStyle;
  readonly category: TemplateCategory;
  readonly isBuiltIn: boolean;
  readonly isPublic: boolean;
  readonly thumbnail?: string;
  readonly usageCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ==========================================
// Video Types
// ==========================================

export interface VideoMetadata {
  readonly id: string;
  readonly filename: string;
  readonly fileSize: number;
  readonly duration: number;
  readonly width: number;
  readonly height: number;
  readonly mimeType: string;
}

// ==========================================
// Playback Types
// ==========================================

export interface PlaybackState {
  readonly currentTime: number;
  readonly duration: number;
  readonly isPlaying: boolean;
  readonly playbackRate: number;
}

// ==========================================
// Render Types
// ==========================================

export type RenderCodec = 'libx264' | 'libx265' | 'copy';
export type RenderPreset = 'ultrafast' | 'fast' | 'medium' | 'slow';
export type RenderQuality = 'fast' | 'balanced' | 'quality';

export interface RenderOptions {
  readonly videoPath: string;
  readonly assContent: string;
  readonly outputPath: string;
  readonly codec: RenderCodec;
  readonly preset: RenderPreset;
  readonly crf: number;
  readonly resolution?: { readonly width: number; readonly height: number };
}

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface RenderJob {
  readonly id: string;
  readonly videoId: string;
  readonly userId?: string;
  readonly style: SubtitleStyle;
  readonly status: JobStatus;
  readonly progress: number;
  readonly outputUrl?: string;
  readonly projectFileUrl?: string;
  readonly error?: string;
  readonly templateId?: string;
  readonly apiKeyId?: string;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

export interface RenderProgress {
  readonly phase: 'loading' | 'rendering' | 'uploading' | 'done' | 'error';
  readonly percentage: number;
  readonly message: string;
}

// ==========================================
// Project Types (.sbp)
// ==========================================

export interface SBPMetadata {
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly appVersion: string;
  readonly generatedBy: 'ui' | 'api';
  readonly sourceVideoHash?: string;
  readonly sourceVideoFilename?: string;
}

export interface SBPVideo {
  readonly filename: string;
  readonly duration: number;
  readonly width: number;
  readonly height: number;
  readonly mimeType: string;
  readonly fileSize?: number;
}

export interface SBPRenderSettings {
  readonly preset?: RenderQuality;
  readonly codec?: string;
  readonly crf?: number;
}

export interface SBPProject {
  readonly version: 1;
  readonly metadata: SBPMetadata;
  readonly video: SBPVideo;
  readonly cues: readonly SubtitleCue[];
  readonly style: SubtitleStyle;
  readonly template?: {
    readonly id: string;
    readonly name: string;
  };
  readonly renderSettings?: SBPRenderSettings;
}

// ==========================================
// User Types
// ==========================================

export type UserTier = 'free' | 'pro' | 'enterprise';

export interface User {
  readonly id: string;
  readonly email: string;
  readonly tier: UserTier;
  readonly createdAt: string;
}

// ==========================================
// API Key Types
// ==========================================

export const API_SCOPES = {
  VIDEOS_READ: 'videos:read',
  VIDEOS_WRITE: 'videos:write',
  TEMPLATES_READ: 'templates:read',
  TEMPLATES_WRITE: 'templates:write',
  RENDER_READ: 'render:read',
  RENDER_WRITE: 'render:write',
  PROJECTS_READ: 'projects:read',
  PROJECTS_WRITE: 'projects:write',
  REEL_READ: 'reel:read',
  REEL_WRITE: 'reel:write',
  PUBLISH_READ: 'publish:read',
  PUBLISH_WRITE: 'publish:write',
  FULL_ACCESS: '*',
} as const;

export type ApiScope = (typeof API_SCOPES)[keyof typeof API_SCOPES];

export const SCOPE_PRESETS = {
  full: [API_SCOPES.FULL_ACCESS],
  renderOnly: [API_SCOPES.VIDEOS_WRITE, API_SCOPES.RENDER_WRITE, API_SCOPES.RENDER_READ],
  reelOnly: [API_SCOPES.REEL_WRITE, API_SCOPES.REEL_READ, API_SCOPES.PUBLISH_WRITE, API_SCOPES.PUBLISH_READ],
  readOnly: [
    API_SCOPES.VIDEOS_READ,
    API_SCOPES.TEMPLATES_READ,
    API_SCOPES.RENDER_READ,
    API_SCOPES.PROJECTS_READ,
    API_SCOPES.REEL_READ,
    API_SCOPES.PUBLISH_READ,
  ],
  templateManager: [API_SCOPES.TEMPLATES_READ, API_SCOPES.TEMPLATES_WRITE],
} as const;

export interface ApiKeyData {
  readonly id: string;
  readonly name: string;
  readonly keyPrefix: string;
  readonly scopes: readonly ApiScope[];
  readonly rateLimitPerMinute: number;
  readonly isActive: boolean;
  readonly expiresAt?: string;
  readonly lastUsedAt?: string;
  readonly usageCount: number;
  readonly createdAt: string;
}

// ==========================================
// API Response Types
// ==========================================

export interface ApiSuccessResponse<T> {
  readonly data: T;
  readonly pagination?: CursorPagination;
}

export interface ApiErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, readonly string[]>;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface CursorPagination {
  readonly cursor?: string;
  readonly nextCursor?: string;
  readonly hasMore: boolean;
  readonly limit: number;
}

// ==========================================
// Action System Types
// ==========================================

export interface Action<TState = unknown> {
  readonly type: string;
  readonly description: string;
  readonly timestamp: number;
  execute(state: TState): TState;
  inverse(): Action<TState>;
}

// ==========================================
// Project State (used by stores and actions)
// ==========================================

export interface ProjectState {
  readonly cues: readonly SubtitleCue[];
  readonly style: SubtitleStyle;
  readonly activeTemplateId: string | null;
}

// ==========================================
// Adapter Types
// ==========================================

export type DeploymentMode = 'cloud' | 'vps';

export interface StorageAdapter {
  upload(file: Buffer, path: string): Promise<string>;
  download(path: string): Promise<Buffer>;
  getSignedUrl(path: string, expiresIn?: number): Promise<string>;
  delete(path: string): Promise<void>;
}

export type QueueName = 'render' | 'reel-render' | 'reel-publish';

export interface QueueAdapter {
  enqueue(jobId: string, payload: Record<string, unknown>, queueName?: QueueName): Promise<void>;
  getStatus(jobId: string, queueName?: QueueName): Promise<JobStatus>;
}

// ==========================================
// Reel Types
// ==========================================

export type ReelLayout = 'split-screen' | 'fullscreen' | 'picture-in-picture';

export interface MediaSource {
  readonly url: string;
  readonly type: 'video' | 'image' | 'color' | 'split-screen';
  readonly label?: string;
  readonly startFrom?: number; // seconds - trim start
  readonly endAt?: number; // seconds - trim end
}

export type TransitionType = 'crossfade' | 'slide-left' | 'slide-right' | 'zoom-in' | 'wipe' | 'none';

export interface BRollTransition {
  readonly type: TransitionType;
  readonly durationMs?: number; // default 300ms
}

export interface BRollSegment {
  readonly startTime: number; // seconds
  readonly endTime: number; // seconds
  readonly media: MediaSource;
  readonly animation?: 'spring-scale' | 'fade' | 'slide' | 'none';
  readonly transition?: BRollTransition;
}

export interface ReelJob {
  readonly id: string;
  readonly userId: string;
  readonly status: JobStatus;
  readonly progress: number;
  readonly script?: string;
  readonly reelConfig?: Record<string, unknown>;
  readonly outputUrl?: string;
  readonly error?: string;
  readonly apiKeyId?: string;
  readonly projectId?: string;
  readonly publishStatus?: Record<string, unknown>;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

export interface ReelConfig {
  readonly layout: ReelLayout;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationInSeconds: number;

  // Media sources
  readonly primaryVideo?: MediaSource; // talking head / main video
  readonly secondaryVideo?: MediaSource; // screen recording / demo
  readonly bRollSegments: readonly BRollSegment[];

  // Audio
  readonly voiceoverUrl?: string;
  readonly musicUrl?: string;
  readonly musicVolume?: number; // 0-1

  // Captions
  readonly cues: readonly SubtitleCue[];
  readonly captionStyle: SubtitleStyle;

  // Visual
  readonly showProgressBar?: boolean;
  readonly backgroundColor?: string;
}
