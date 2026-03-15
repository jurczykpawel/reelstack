# AGENTS.md - ReelStack (subtitle-burner)

AI video production platform. Generates short-form video reels from a script: TTS voiceover, whisper captions, AI-generated visuals, Remotion render.

## Stack

- **Monorepo**: Bun workspaces
- **Web**: Next.js (App Router), Prisma + PostgreSQL, BullMQ job queue, Redis
- **Worker**: Separate Docker container, processes BullMQ jobs
- **Render**: Remotion (React), runs inside worker
- **Agent**: `packages/agent` - AI production orchestrator (Claude API)
- **CI**: GitHub Actions -> ghcr.io Docker images

## Directory Map

```
apps/web/                          Next.js app (web + API + worker)
  src/app/api/v1/reel/
    generate/route.ts              POST /api/v1/reel/generate  (main endpoint)
    captions/route.ts              POST /api/v1/reel/captions  (add captions to existing video)
    batch/route.ts                 POST /api/v1/reel/batch
    multi-lang/route.ts            POST /api/v1/reel/multi-lang
    [id]/route.ts                  GET /api/v1/reel/:id  (poll status)
  src/lib/api/v1/reel-schemas.ts   Zod schemas for all endpoints
  src/lib/worker/
    reel-pipeline-worker.ts        Main pipeline: routes by mode -> agent
  src/lib/__tests__/               Unit tests (Vitest)

packages/agent/                    AI production agent (@reelstack/agent)
  src/
    index.ts                       Public API: produce(), produceComposition()
    types.ts                       All interfaces
    registry/                      Tool discovery + registry
    tools/                         Tool adapters (HeyGen, Veo3, Kling, Seedance, NanoBanana, Pexels)
    planner/                       LLM planner (Claude -> ProductionPlan JSON)
    orchestrator/                  Orchestration: discover -> plan -> generate -> assemble -> render

packages/remotion/                 Remotion composition + render
  COMPOSITION.md                   Architecture docs (read this for Remotion details)
  src/effects/                     Effect registry (emoji-popup, glitch, screen-shake, etc.)

packages/tts/                      TTS providers (edge-tts, ElevenLabs, OpenAI)
packages/transcription/            Whisper + cue grouping
packages/logger/                   Pino logger

bruno/reelstack/                   Bruno API test collection
scripts/dev-seed.ts                Seed dev DB (test user + API key)
```

## API Endpoints

### POST /api/v1/reel/generate

Two modes, detected automatically from body shape:

**Generate mode** (no `assets`) - full AI production pipeline:
```json
{
  "script": "Your script text",
  "style": "dynamic",
  "tts": { "provider": "edge-tts", "voice": "pl-PL-MarekNeural", "language": "pl-PL" },
  "brandPreset": { "highlightColor": "#FFD700" }
}
```

**Compose mode** (with `assets`) - LLM arranges user-provided materials:
```json
{
  "script": "Your script text",
  "assets": [
    { "id": "clip1", "url": "https://...", "type": "video", "description": "Talking head", "isPrimary": true },
    { "id": "screen1", "url": "https://...", "type": "image", "description": "Dashboard screenshot" }
  ],
  "directorNotes": "Show dashboard screenshot when I mention analytics"
}
```

Response: `{ "jobId": "...", "mode": "generate"|"compose" }`

### POST /api/v1/reel/captions

Add captions to an existing video.

**From script** (TTS pipeline runs):
```json
{
  "videoUrl": "https://...",
  "script": "Script text",
  "tts": { "provider": "edge-tts" }
}
```

**From pre-computed cues** (skip TTS + whisper):
```json
{
  "videoUrl": "https://...",
  "cues": [{ "id": "c1", "text": "Hello", "startTime": 0, "endTime": 1.2 }]
}
```

### GET /api/v1/reel/:id

Poll job status. Returns `{ status, outputUrl?, error? }`.

### Authentication

All endpoints require `Authorization: Bearer <api_key>` header.

Dev key: `rs_test_devSeedKey00000000000000000001` (after running `bun run api:seed`)

## Pipeline Modes

The worker (`reel-pipeline-worker.ts`) routes by `config.mode`:

| Mode | Function | What happens |
|------|----------|--------------|
| `generate` | `produce()` | Tool discovery -> LLM plan -> asset gen + TTS (parallel) -> assemble -> render |
| `compose` | `produceComposition()` | TTS -> LLM composition plan -> assemble -> render |
| `captions` | `produceComposition()` | Existing video + captions only, no new asset generation |

## Running Locally

```bash
# Install
bun install

# Dev server (web only)
bun run dev

# Seed dev database (creates test user + API key)
bun run api:seed

# Run Bruno API tests (requires dev server on :3001)
bun run api:test

# Unit tests
bun test
```

## Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=          # Claude API (LLM planner)
DATABASE_URL=               # PostgreSQL
REDIS_URL=                  # BullMQ

# Optional - enable additional tools
PEXELS_API_KEY=             # Stock video (always available if set)
HEYGEN_API_KEY=             # Avatar video (talking head)
VEO3_API_KEY=               # Google Veo 3 AI video
VEO3_PROJECT_ID=            # Google Cloud project ID
KLING_API_KEY=              # Kling AI video
SEEDANCE_API_KEY=           # Seedance (ByteDance) AI video
SEEDANCE_API_BASE=          # Override API base URL (proxy)
NANOBANANA_API_KEY=         # NanoBanana image (or use GEMINI_API_KEY)
GEMINI_API_KEY=             # Google Gemini (NanoBanana fallback)
ELEVENLABS_API_KEY=         # ElevenLabs TTS
OPENAI_API_KEY=             # OpenAI TTS / Whisper

# HuMo 1.7B - self-hosted avatar-video via RunPod (najtańsza opcja ~$0.10/video)
# Setup: projects/humo-runpod/AGENTS.md
RUNPOD_API_KEY=             # RunPod API key (Settings -> API Keys)
HUMO_RUNPOD_ENDPOINT_ID=    # RunPod serverless endpoint ID
HUMO_DEFAULT_IMAGE_URL=     # Domyślny URL portretu gdy avatarId nie podany w request
```

Tools are auto-discovered: if the env var is set and healthCheck() passes, the tool is available to the LLM planner.

## Deployment Presets

Trzy gotowe presety w plikach `env.*.example`:

| Preset | File | Queue | Storage | Render | Kiedy |
|--------|------|-------|---------|--------|-------|
| VPS Full | `env.vps.example` | BullMQ+Redis | MinIO (kontener) | Local worker | Mocny VPS (4GB+ RAM) |
| VPS + Lambda | `env.vps-lambda.example` | BullMQ+Redis | B2/R2/S3 lub MinIO | AWS Lambda | Słaby VPS, offload renderowania |
| Cloud | `env.cloud.example` | Inngest | Supabase Storage | AWS Lambda | Brak VPS, Vercel/Railway |

**Detekcja trybu** (automatyczna):
- `NEXT_PUBLIC_SUPABASE_URL` + `INNGEST_EVENT_KEY` ustawione → tryb `cloud` (Inngest + Supabase)
- Wszystko inne → tryb `vps` (BullMQ + MinIO/S3)

**MinIO client jest S3-compatible** — możesz użyć B2/R2/AWS S3 bez dodatkowego kodu, tylko zmieniając env vars (patrz `env.vps-lambda.example`).

**Lambda render** — jednorazowy setup:
```bash
AWS_REGION=eu-central-1 npx tsx packages/remotion/scripts/deploy-lambda.ts
# skopiuj REMOTION_LAMBDA_FUNCTION_NAME i REMOTION_LAMBDA_SERVE_URL do .env
```

### Mikrus

```bash
# Deploy (web + worker + postgres + redis, bez MinIO i reel-worker)
docker compose -f docker-compose.mikrus.yml pull
docker compose -f docker-compose.mikrus.yml up -d

# Logi
docker compose -f docker-compose.mikrus.yml logs -f worker
```

nginx port: `3080`. CI pushes to `ghcr.io/jurczykpawel/reelstack:latest` (web) + `reelstack-worker:latest` (worker).

## Master Plan (MANDATORY)

**ZAWSZE trzymaj się planu w `priv/REELSTACK_MASTER_PLAN.md`.**

- Przed rozpoczęciem pracy przeczytaj master plan i znajdź odpowiednią fazę/task
- Nie wymyślaj własnej kolejności - realizuj taski w kolejności z planu
- Po zakończeniu taska zaktualizuj jego status w planie (TODO → DONE/PARTIAL + notatki)
- Jeśli trzeba zmienić plan (nowe odkrycia, zmiana priorytetów) - zaktualizuj plan ZANIM zaczniesz implementację
- Plan jest single source of truth dla tego co robimy i w jakiej kolejności

## Implementation Rules (MANDATORY)

**After EVERY implementation step**, before moving to the next task, answer these questions:

1. **New field added to any type/interface?** → Check it exists in: `reel-schemas.ts` (Zod), `reel-pipeline-worker.ts` (passthrough), `types.ts` (interface), `reel-schemas.test.ts` (accept + reject tests)
2. **New file created?** → Is it exported from package `index.ts`? Did you grep for existing similar patterns first?
3. **Copy-pasted code?** → Is this the 2nd occurrence? Extract to shared module NOW.
4. **New function/type?** → Exported from package index?
5. **Post-step scan**: unused imports, missing `resolveMediaUrl()`, inconsistent defaults, avoidable `as unknown as` casts

**After completing a phase** (group of related steps):
- Cross-step review: diff new files for duplicated patterns
- Wiring trace: API schema → worker → orchestrator → types → tests

Tests passing is NOT a completion signal. The checklist above IS.

## Key Architectural Decisions

- **Remotion composition**: single-overlay model, held cross-transitions. See `packages/remotion/COMPOSITION.md`.
- **Tool discovery is env-driven**: no code changes needed to add/remove tools, just set/unset env vars.
- **LLM planner uses structured output**: Claude returns raw JSON `ProductionPlan`, no markdown parsing.
- **Asset gen + TTS run in parallel** (step 3 of `produce()`) to minimize total latency.
- **`produceComposition()` is reused** for both compose mode and captions mode.
- **Bun monorepo**: use `bun` everywhere, not `npm`/`npx`. Exception: `bunx` for remotion CLI.

## Adding a New Tool

See `packages/agent/README.md` for the full guide.

Quick summary:
1. Create `packages/agent/src/tools/mytool-tool.ts` implementing `ProductionTool`
2. Add env var check + instantiation in `packages/agent/src/registry/discovery.ts`
3. Write `promptGuidelines` based on the tool's prompting documentation

Istniejace narzedzia jako wzorzec: `wavespeed-tool.ts` (najprostszy), `heygen-tool.ts` (avatar + script), `humo-tool.ts` (self-hosted RunPod).

## HuMo Tool (avatar-video, self-hosted)

Najtańsza opcja do generowania talking-head video. Używa self-hosted RunPod endpoint z modelem HuMo 1.7B.

- Tool: `packages/agent/src/tools/humo-tool.ts`
- Serwis: `projects/humo-runpod/` (Dockerfile + handler.py)
- Dokumentacja setupu: `projects/humo-runpod/AGENTS.md`
- `avatarId` w `AssetGenerationRequest` = URL do zdjęcia portretu
- Czas generowania: ~8 min (async polling przez RunPod API)
- Włącza sie automatycznie gdy `RUNPOD_API_KEY` + `HUMO_RUNPOD_ENDPOINT_ID` ustawione
