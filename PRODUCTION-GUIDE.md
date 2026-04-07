# ReelStack Production Guide

## Architecture

ReelStack is a monorepo for AI-powered short video production.

```
apps/web          Next.js API + dashboard
packages/agent    LLM planning, tool registry, orchestration, CLI
packages/remotion Remotion compositions, effects, overlays
packages/ffmpeg   Audio splitting, frame extraction
packages/storage  R2/MinIO/Supabase storage adapters
packages/tts      Edge-TTS, ElevenLabs, OpenAI TTS providers
packages/transcription  Whisper providers (Cloudflare, Ollama, OpenRouter)
packages/queue    BullMQ adapter
packages/database Prisma + Neon PostgreSQL
packages/modules  Private module implementations (separate repo)
```

## Modes

| Mode         | Description                                                              | LLM usage                           |
| ------------ | ------------------------------------------------------------------------ | ----------------------------------- |
| `generate`   | Script only. AI discovers tools, plans shots, generates assets, renders. | Planner + Supervisor + PromptWriter |
| `compose`    | Script + user assets. AI arranges provided materials into a reel.        | Planner only                        |
| Module modes | e.g. `captions`, `ai-storytelling`, `n8n-explainer`                      | Module-specific                     |

## Pipeline Steps (generate mode)

1. **script-review** - Review script for factual errors (optional)
2. **discover-tools** - Scan env for available video/image tools
3. **tts** - Text-to-speech + Whisper word-level timing
4. **plan** - Build production plan (template montage or AI director)
5. **supervisor** - Validate plan quality, virality score
6. **prompt-expansion** - Expand shot briefs into detailed prompts
7. **asset-gen** - Generate images/videos via tool registry
8. **asset-persist** - Upload assets to storage
9. **composition** - Assemble Remotion props from plan + assets + cues

## CLI

All commands output to `out/` (or `--out <dir>`).

### Full pipeline (step by step)

```bash
bun run rs tts "Your script text here" --voice en-US-AriaNeural --lang en-US
bun run rs plan out/tts.json --template jump-cut-dynamic
bun run rs assemble out/plan.json out/tts.json
bun run rs render out/composition.json
```

### Lip sync pipeline

```bash
bun run rs tts "Script for character"
bun run rs split-audio out/tts.json
bun run rs lipsync character.jpg --tool kling    # or --tool seedance
bun run rs plan out/tts.json
```

### HeyGen avatar

```bash
bun run rs heygen "Script" --iv --emotion Friendly --speed 1.1
bun run rs heygen-poll <job-id>
bun run rs heygen-status
```

### CLI flags

| Flag                | Command | Description                             |
| ------------------- | ------- | --------------------------------------- |
| `--voice <id>`      | tts     | TTS voice (default: pl-PL-MarekNeural)  |
| `--lang <code>`     | tts     | Language (default: pl-PL)               |
| `--template <id>`   | plan    | Template ID (default: jump-cut-dynamic) |
| `--tool <name>`     | lipsync | kling (default) or seedance             |
| `--segments <file>` | lipsync | Custom segments file                    |
| `--iv`              | heygen  | Avatar IV mode                          |
| `--emotion <name>`  | heygen  | Excited, Friendly, Serious              |
| `--speed <n>`       | heygen  | Voice speed 0.5-1.5                     |
| `--out <dir>`       | all     | Output directory                        |

## API

### Generate reel

```
POST /api/v1/reel/generate
Authorization: Bearer rs_...
```

```json
{
  "script": "Your narration text",
  "mode": "generate",
  "layout": "hybrid-anchor",
  "tts": { "provider": "edge-tts", "voice": "en-US-AriaNeural", "language": "en-US" },
  "whisper": { "provider": "cloudflare" },
  "brandPreset": { "captionPreset": "tiktok" },
  "montageProfile": "ai-tool-showcase",
  "directorNotes": "Fast paced, tech audience",
  "callbackUrl": "https://your-server/webhook"
}
```

Response: `{ jobId, mode, status: "queued", pollUrl }`

### Poll status

```
GET /api/v1/reel/:jobId
```

### Webhook callback

Delivered on completion/failure. Signed with HMAC-SHA256.

Headers: `X-ReelStack-Signature`, `X-ReelStack-Event` (`reel.completed` or `reel.failed`)

## Templates

Templates define deterministic shot patterns (no LLM needed).

| Template               | Layout        | Description                                |
| ---------------------- | ------------- | ------------------------------------------ |
| `anchor-bottom-simple` | anchor-bottom | Presenter bottom, alternating content/head |
| `fullscreen-broll`     | fullscreen    | Full-screen B-roll with varied transitions |
| Premium templates      | various       | Registered by private modules              |

Register custom templates:

```typescript
import { registerTemplate } from '@reelstack/agent';

registerTemplate('my-template', {
  layout: 'fullscreen',
  transition: 'varied',
  highlightMode: 'hormozi',
  sfxMode: 'auto',
  shotPattern: [
    { type: 'content', transition: 'zoom-in', durationRange: [2, 4] },
    { type: 'head', transition: 'crossfade', durationRange: [1, 2] },
  ],
});
```

## Tool Registry

Tools are auto-discovered based on environment variables.

### Always available

- `user-upload` - Passthrough for user-provided assets
- `pexels` - Stock footage (requires `PEXELS_ENABLED=true`)

### Video generation (set corresponding env var)

| Provider      | Env var                                      | Tools                                         |
| ------------- | -------------------------------------------- | --------------------------------------------- |
| fal.ai        | `FAL_KEY`                                    | Kling, Seedance, Wan, Flux, Hailuo, LTX, Pika |
| KIE.ai        | `KIE_API_KEY`                                | Kling, Seedance 2.0, Wan, Flux, NanoBanana    |
| PiAPI         | `PIAPI_API_KEY`                              | Kling, Seedance, Hunyuan, Hailuo, Flux        |
| AIML API      | `AIMLAPI_KEY`                                | Kling, Flux, Veo3, Sora2, Pixverse            |
| WaveSpeed     | `WAVESPEED_API_KEY`                          | Seedance, Wan, Flux, NanoBanana, Qwen         |
| Replicate     | `REPLICATE_API_TOKEN`                        | Wan, Flux, SDXL, Ideogram, Recraft            |
| Runway        | `RUNWAY_API_KEY`                             | Runway Gen-3/4                                |
| Minimax       | `MINIMAX_API_KEY`                            | Minimax Video                                 |
| Google Vertex | `VERTEX_PROJECT_ID`                          | Veo 3.1 (native audio)                        |
| HeyGen        | `HEYGEN_API_KEY`                             | Avatar video (talking head)                   |
| HuMo          | `RUNPOD_API_KEY` + `HUMO_RUNPOD_ENDPOINT_ID` | Self-hosted avatar                            |

### Tool priority (planner)

AI video: seedance2-kie > seedance2-piapi > veo31-gemini > kling > others

## ContentPackage

Standardized format between content production and rendering:

```typescript
interface ContentPackage {
  script: string;
  voiceover: { url: string; durationSeconds: number; source: 'tts' | 'ai-video-native' };
  cues: CaptionCue[]; // Word-level timing from Whisper
  sections: ContentSection[]; // Timed script sections with assetId references
  assets: ContentAsset[]; // Visual assets (video/image)
  primaryVideo?: PrimaryVideo; // Talking head (optional)
  metadata: { language: string };
}
```

## Modules

Modules extend ReelStack with custom pipelines.

```typescript
import { registerModule } from '@reelstack/agent';
import type { ReelModule } from '@reelstack/agent';

const myModule: ReelModule = {
  id: 'my-module',
  name: 'My Custom Module',
  compositionId: 'ReelComposition',
  configFields: [{ name: 'script', type: 'string', required: true, description: 'Narration' }],
  progressSteps: { Generating: 50, Rendering: 90 },
  async orchestrate(baseRequest, moduleConfig) {
    // Your pipeline logic
    return { outputPath: '/tmp/out.mp4', durationSeconds: 30 };
  },
};

registerModule(myModule);
```

Private modules live in a separate repo and register at import time via `import '@reelstack/modules'`.

## Remotion Components

### Compositions

- `ReelComposition` - Main reel (B-roll, captions, effects, overlays)
- `VideoClip` - Single clip with captions (used by captions module)

### Overlay components

- `CaptionOverlay` - Word-level captions with highlight modes (hormozi, pill, single-word, glow)
- `LabelOverlay` - Text badges with directional arrows
- `MultiVideoOverlay` - Multiple video/image windows with staggered entrance
- `LogoOverlay` - Brand logo
- `CtaOverlay` - Call-to-action buttons
- `TextCardOverlay` - Full-screen text cards

## Model Presets

Control LLM cost via `MODEL_PRESET` env var.

| Preset        | Planner | Supervisor | PromptWriter | ScriptReviewer |
| ------------- | ------- | ---------- | ------------ | -------------- |
| `production`  | Opus    | Sonnet     | Sonnet       | Sonnet         |
| `development` | Sonnet  | Sonnet     | Sonnet       | Sonnet         |
| `testing`     | Haiku   | Haiku      | Haiku        | Haiku          |

Override individual roles: `PLANNER_MODEL=claude-haiku-4-5-20251001`

LLM provider priority: OpenRouter > Anthropic > OpenAI (based on which key is set).

## Environment Variables

### Required (at least one LLM provider)

- `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` or `OPENAI_API_KEY`

### Storage

- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
- Or: `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`

### Optional

- `MODEL_PRESET` - production (default), development, testing
- `DATABASE_URL` - Neon PostgreSQL connection string
- `REDIS_URL` - Redis for BullMQ job queue
- Tool-specific keys (see Tool Registry above)
- `WEBHOOK_CALLBACK_SECRET` - HMAC signing key for webhook callbacks

## Testing

```bash
bun test packages/          # Run all package tests
bun test packages/agent/    # Run agent tests only
```

### Safety

- `tests/setup.ts` (preloaded via bunfig.toml) clears all API keys and sets `MODEL_PRESET=testing`
- Integration tests use `.integration.ts` extension (not picked up by `bun test`)
- `setup-verify.test.ts` guards against accidental real API calls
