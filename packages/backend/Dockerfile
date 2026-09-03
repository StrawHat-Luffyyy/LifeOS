# =============================================================================
# Backend — Production Dockerfile (multi-stage)
# =============================================================================

# Stage 1: Install + Build
FROM node:20-slim AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/

# Install dependencies
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source
COPY packages/shared/ packages/shared/
COPY packages/backend/ packages/backend/
COPY tsconfig.base.json ./

# Build shared first, then backend
RUN pnpm --filter @lifeos/shared build
RUN pnpm --filter @lifeos/backend build

# Stage 2: Production image
FROM node:20-slim AS runner
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
ENV NODE_ENV=production

# Copy workspace config for production install
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/backend/dist packages/backend/dist
COPY --from=builder /app/packages/backend/drizzle packages/backend/drizzle

EXPOSE 4000

CMD ["node", "packages/backend/dist/index.js"]
