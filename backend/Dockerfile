# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (layer cache) — skip postinstall, schema not copied yet
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source, then generate prisma client with the real schema
COPY . .
RUN npx prisma generate --schema backend/prisma/schema.prisma
RUN npm run build:backend

# ── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN addgroup -S kanaku && adduser -S kanaku -G kanaku

WORKDIR /app

# Only production deps
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy built output + required assets
COPY --from=builder /app/dist               ./dist
COPY --from=builder /app/backend/generated  ./generated
COPY --from=builder /app/backend/prisma     ./prisma

# Non-root user for security
USER kanaku

EXPOSE 3000

# Healthcheck so Fly restarts unhealthy containers
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Run migrations then start — migrations use DIRECT_URL (non-pooled)
CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node dist/server.js"]
