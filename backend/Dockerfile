# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (layer cache)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npx prisma generate --schema prisma/schema.prisma
RUN npm run build

# ── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN addgroup -S kanaku && adduser -S kanaku -G kanaku

WORKDIR /app

# Only production deps
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy built output + required assets
COPY --from=builder /app/dist            ./dist
COPY --from=builder /app/generated       ./generated
COPY --from=builder /app/prisma          ./prisma

# Non-root user for security
USER kanaku

EXPOSE 3000

# Healthcheck so Fly restarts unhealthy containers
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Run migrations then start — migrations use DIRECT_URL (non-pooled)
CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node dist/server.js"]
