# Roadmap

ReelStack evolution: from subtitle burner to automated reel production engine.

## Status Legend

| Symbol | Meaning |
|--------|---------|
| done | Implemented, tested, merged |
| skipped | Deferred or deprioritized |
| planned | Not started |

---

## Faza 0: Foundation (Subtitle Burner)

**Status: done**

Original subtitle burning application with full editor, API, and deployment.

- Visual timeline editor with drag and resize
- 8 built-in subtitle templates, 6 caption animation styles
- Client-side rendering (FFmpeg.wasm) + server-side rendering (BullMQ worker)
- Auto-transcription with in-browser Whisper
- SRT import/export, project file format (.sbp)
- Public REST API v1 (21 endpoints)
- Undo/redo action system, API key management
- Dual deployment: VPS (Docker + BullMQ + MinIO) / Cloud (Vercel + Inngest + Supabase)
- Auth (email/password + magic links via Auth.js)
- 414 tests across 7 packages

## Faza 1: Real Video via Remotion

**Status: done**

Replaced FFmpeg subtitle overlay with Remotion (React-based video rendering via headless Chrome).

- `packages/remotion` - Remotion composition with React components
- Layout system: fullscreen, split-screen, picture-in-picture
- Style presets: cinematic, energetic, minimal, educational
- Animated text overlays with word-level timing
- B-roll segments with Ken Burns effect
- Progress bar, background music support
- Remotion Dev Studio integration (`bun dev:remotion`)

## Faza 2: TTS + Whisper

**Status: done**

Text-to-speech voiceover and Whisper word-level alignment.

- `packages/tts` - ElevenLabs TTS integration (generate speech from script)
- `packages/transcription` - Whisper word-level timestamps for TTS audio
- Pipeline: script -> TTS audio -> Whisper alignment -> word-timed cues
- Voice selection, stability/similarity boost params
- Audio caching for re-renders

## Faza 3: AI Director

**Status: done**

AI-powered creative decisions for automated reel production.

- `packages/remotion/src/pipeline/` - full reel creation pipeline
- `reel-creator.ts` - orchestrator: script -> voiceover -> alignment -> B-roll -> render
- `ai-director.ts` - Claude AI selects B-roll timing, music, visual style
- `broll-source.ts` - Pexels API integration for stock footage
- Step-by-step pipeline with progress callbacks
- Configurable: skip AI, manual B-roll, custom music

## Faza 4: API + Monetization + Publishing

**Status: done**

REST API for reel creation, Sellf payment webhook, Postiz publishing.

### API Endpoints
- `POST /api/v1/reel` - create reel job (script + config)
- `GET /api/v1/reel/[id]` - job status + progress
- `POST /api/v1/reel/[id]/publish` - publish to social media via Postiz

### Monetization
- Tier system (FREE / PRO / ENTERPRISE) with token-based usage
- Sellf webhook (`POST /api/webhooks/sellf`) - universal format:
  - Direct: `{email, product, reference}`
  - Sellf: `{event: "purchase.completed", data: {customer, product, order}}`
  - HMAC-SHA256 signature verification
  - Product-to-action mapping via env vars (tier upgrades, token packs)

### Publishing
- `packages/publisher` - Postiz API integration
- Multi-platform publish (TikTok, Instagram, YouTube, etc.)
- Schedule support, hashtags, captions

### Tests
- 475 tests after this phase

## Faza 5: Docker + Deploy

**Status: done**

Containerization, renderer abstraction, reel worker.

### Renderer Abstraction
- `packages/remotion/src/render/` - pluggable renderer interface
- `LocalRenderer` - programmatic `@remotion/renderer` with pre-bundle support (`REMOTION_BUNDLE_PATH`)
- `LambdaRenderer` - stub (interface ready, implementation future)
- Factory: `createRenderer()` based on `REMOTION_RENDERER` env
- Replaced `execSync('bunx remotion render ...')` with programmatic API

### Reel Worker
- `apps/web/worker/reel-worker.ts` - BullMQ worker entry point
- `reel-render` queue (concurrency 1 - Chromium heavy)
- `reel-publish` queue (concurrency 5 - HTTP calls)
- Graceful shutdown (SIGTERM/SIGINT)

### Docker
- `docker/Dockerfile.reel-worker` - node:22-slim + Bun + Chromium + FFmpeg + fonts
- Pre-bundled Remotion webpack at build time (no 10-30s bundling per render)
- Docker Compose profiles: `--profile reel` for optional reel-worker
- Fixed existing Dockerfiles (added remotion, tts, publisher package.json copies)
- CI: GitHub Actions builds 3 images (web, worker, reel-worker)

### Deployment
- `scripts/setup-vps.sh` - `--with-reel` flag for reel worker
- `.env.example` - all new env vars documented
- Memory limits: 4G limit / 2G reservation for reel-worker

### Tests
- 537 tests across 8 packages after this phase

## Faza 6: Web UI - Reel Editor

**Status: skipped (deferred)**

Web interface for reel creation. Not blocking - everything works via API/CLI.

Planned scope (when needed):
- Reel creation wizard (script input, config, preview)
- Real-time job progress tracking
- B-roll preview and manual override
- Publish flow with platform selection
- Token balance display and purchase flow
- Template gallery for reel styles

## Future Ideas (unplanned)

- Remotion Lambda renderer (AWS Lambda for serverless rendering)
- Multi-language subtitle tracks
- Batch reel rendering via API
- Custom font uploads
- GPU-accelerated server rendering
- Plugin system for custom animation styles
- WebVTT and TTML import/export

---

## Current Stats

| Metric | Value |
|--------|-------|
| Tests | 537 |
| Packages | 10 (core, ffmpeg, database, queue, storage, transcription, types, remotion, tts, publisher) |
| API endpoints | 21 (v1 public) + 6 (reel) + 1 (webhook) |
| Docker images | 3 (web, worker, reel-worker) |
| Deployment modes | VPS (Docker Compose) / Cloud (Vercel + Inngest) |
