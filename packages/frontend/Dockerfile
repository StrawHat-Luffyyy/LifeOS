# =============================================================================
# Frontend — Production Dockerfile (multi-stage)
# =============================================================================

# Stage 1: Install + Build
FROM node:20-slim AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY packages/frontend/package.json packages/frontend/

# Install dependencies
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source
COPY packages/shared/ packages/shared/
COPY packages/frontend/ packages/frontend/
COPY tsconfig.base.json ./

# Build shared, then frontend
RUN pnpm --filter @lifeos/shared build

ENV NEXT_PUBLIC_API_URL=http://localhost:4000
RUN pnpm --filter @lifeos/frontend build

# Stage 2: Production
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy Next.js standalone output
COPY --from=builder /app/packages/frontend/.next/standalone ./
COPY --from=builder /app/packages/frontend/.next/static ./packages/frontend/.next/static
COPY --from=builder /app/packages/frontend/public ./packages/frontend/public

EXPOSE 3000
CMD ["node", "packages/frontend/server.js"]
