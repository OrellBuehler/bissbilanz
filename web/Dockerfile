# syntax=docker/dockerfile:1

FROM oven/bun:1.2 AS builder
WORKDIR /app

COPY package.json ./
RUN bun install
COPY . .
RUN bun run build

FROM oven/bun:1.2 AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/tailwind.config.ts ./
COPY --from=builder /app/postcss.config.mjs ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/eslint.config.mjs ./

EXPOSE 3000
CMD ["bun", "run", "start"]
