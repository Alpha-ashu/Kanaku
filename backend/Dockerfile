# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install root deps (has prisma CLI needed for generate) — skip postinstall
COPY package*.json ./
RUN npm ci --ignore-scripts

# Install backend deps (has typescript for tsc)
COPY backend/package*.json ./backend/
RUN cd backend && npm ci

# Copy source, generate prisma client, build
COPY . .
RUN npx prisma generate --schema backend/prisma/schema.prisma
RUN cd backend && npm run build

# ── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN addgroup -S kanaku && adduser -S kanaku -G kanaku

WORKDIR /app

# Use backend/package.json — has "type":"commonjs" and all backend production deps
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built output + required assets
COPY --from=builder /app/backend/dist      ./dist
COPY --from=builder /app/backend/generated ./generated
COPY --from=builder /app/backend/prisma    ./prisma

# Non-root user for security
USER kanaku

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
