# syntax=docker/dockerfile:1

# Build stage - install dependencies
FROM oven/bun:1-alpine AS deps
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build stage - build the app
FROM oven/bun:1-alpine AS builder
WORKDIR /app

ARG GIT_HASH=unknown
ARG BUILD_TIMESTAMP=unknown

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV VITE_GIT_HASH=${GIT_HASH}
ENV VITE_BUILD_TIMESTAMP=${BUILD_TIMESTAMP}

RUN bun --bun run build

RUN echo "GIT_HASH=${GIT_HASH}" > /app/version.txt && \
    echo "BUILD_TIMESTAMP=${BUILD_TIMESTAMP}" >> /app/version.txt

# Production deps - install only production dependencies
FROM oven/bun:1-alpine AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Production stage - minimal runtime
FROM oven/bun:1-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 sveltekit

COPY --from=builder --chown=sveltekit:nodejs /app/build ./build
COPY --from=builder --chown=sveltekit:nodejs /app/package.json ./
COPY --from=prod-deps --chown=sveltekit:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=sveltekit:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=sveltekit:nodejs /app/version.txt ./

USER sveltekit

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/auth/me || exit 1

CMD ["bun", "./build/index.js"]
