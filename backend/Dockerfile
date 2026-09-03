# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Workspace manifests + root lockfile for a reproducible, hoisted install.
# (npm ci validates the lockfile against every workspace package.json.)
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --ignore-scripts || npm install --ignore-scripts --no-audit --no-fund

# Copy source, generate prisma client, build backend workspace
COPY . .
RUN node scripts/ensure-prisma-runtime.cjs && npx -y prisma generate --schema backend/prisma/schema.prisma
RUN npm run build:backend
# Prune devDependencies so only production dependencies remain
RUN npm prune --omit=dev --no-audit --no-fund || true

# ── Stage 2: Production image ────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN apk add --no-cache openssl
RUN addgroup -S kanaku && adduser -S kanaku -G kanaku

WORKDIR /app

ENV NODE_ENV=production
ENV NODE_PATH=/app/node_modules

# Copy production node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Backend package.json so Node runs dist/server.js as CommonJS
COPY backend/package.json ./package.json

# Copy built output + required assets
COPY --from=builder /app/backend/dist      ./dist
COPY --from=builder /app/backend/generated ./generated
COPY --from=builder /app/backend/prisma    ./prisma
COPY --from=builder /app/backend/scripts   ./scripts

# Verify critical runtime dependencies exist in runner image
RUN node -e "require('zod'); require('@prisma/client'); console.log('Runtime dependencies verified in container')"

# Non-root user for security
USER kanaku

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]

