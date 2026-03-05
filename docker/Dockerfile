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
RUN bun run build

# Production
FROM base AS runner
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# Prisma native binary is not included in Next.js standalone output - copy explicitly
COPY --from=builder /app/node_modules/.bun/@prisma+client@6.3.1+63eb1ec23c1e0836/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node \
  /app/node_modules/.bun/@prisma+client@6.3.1+63eb1ec23c1e0836/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "apps/web/server.js"]
