FROM oven/bun:1.3 AS base
WORKDIR /app

# Install ffmpeg for server rendering
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Install dependencies
FROM base AS deps
COPY package.json bun.lock bunfig.toml ./
COPY apps/web/package.json apps/web/
COPY packages/types/package.json packages/types/
COPY packages/ffmpeg/package.json packages/ffmpeg/
COPY packages/database/package.json packages/database/
COPY packages/queue/package.json packages/queue/
COPY packages/core/package.json packages/core/
COPY packages/storage/package.json packages/storage/
COPY packages/transcription/package.json packages/transcription/
COPY packages/remotion/package.json packages/remotion/
COPY packages/tts/package.json packages/tts/
COPY packages/publisher/package.json packages/publisher/
RUN bun install --frozen-lockfile

# Build
FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN ./node_modules/.bin/prisma generate --schema=packages/database/prisma/schema.prisma
# Debug: find all Prisma engine binaries after generate
RUN echo "=== Prisma binaries after generate ===" && find /app -name 'libquery_engine*' 2>/dev/null && echo "==="
# Remove darwin/mac binaries from ALL paths in monorepo (packages/*/node_modules/ included)
RUN find /app -name 'libquery_engine-darwin*' -delete
RUN bun run build
# Remove any darwin binaries that Next.js file tracing may have copied into standalone
RUN find /app/apps/web/.next/standalone -name 'libquery_engine-darwin*' -delete 2>/dev/null || true
# Debug: what's in standalone after build
RUN echo "=== Prisma binaries in standalone ===" && find /app/apps/web/.next/standalone -name 'libquery_engine*' 2>/dev/null && echo "==="

# Production
FROM base AS runner
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "apps/web/server.js"]
