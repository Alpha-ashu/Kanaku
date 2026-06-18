# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Workspace manifests + root lockfile for a reproducible, hoisted install.
# (npm ci validates the lockfile against every workspace package.json.)
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
RUN npm ci --ignore-scripts

# Copy source, generate prisma client, build backend workspace
COPY . .
RUN npx prisma generate --schema backend/prisma/schema.prisma
RUN npm run build:backend

# ── Stage 2: Production image ────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN addgroup -S kanaku && adduser -S kanaku -G kanaku

WORKDIR /app

# All runtime deps are in backend/package.json — single clean install
COPY backend/package.json ./
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force

# Copy built output + required assets
COPY --from=builder /app/backend/dist      ./dist
COPY --from=builder /app/backend/generated ./generated
COPY --from=builder /app/backend/prisma    ./prisma
COPY --from=builder /app/backend/scripts   ./scripts

# Non-root user for security
USER kanaku

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
