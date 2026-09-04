# LifeOS

A persistent, context-aware personal operating system that stores structured knowledge about your work, retrieves that knowledge when relevant, and uses controlled AI agents to help you plan, understand, and resume your work.

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [pnpm](https://pnpm.io/) v9+
- [Docker](https://www.docker.com/) & Docker Compose

### Setup

```bash
# 1. Clone and install
pnpm install

# 2. Create environment file
cp .env.example .env
# Edit .env — set a strong JWT_SECRET (min 32 chars)

# 3. Start PostgreSQL and Redis
docker compose up -d postgres redis

# 4. Run database migrations
pnpm db:push

# 5. Start development servers
pnpm dev:backend   # Express API on http://localhost:4000
pnpm dev:frontend  # Next.js app on http://localhost:3000
```

### Verify

```bash
# Health check
curl http://localhost:4000/api/health

# Run tests
pnpm test

# Type-check
pnpm typecheck
```

## Project Structure

```
lifeos/
├── packages/
│   ├── backend/          # Express.js API (TypeScript)
│   │   ├── src/
│   │   │   ├── config/       # Typed env config (Zod-validated)
│   │   │   ├── db/           # Drizzle ORM client + schema
│   │   │   ├── lib/          # Shared utilities (errors, etc.)
│   │   │   ├── middleware/   # Auth, validation, error handling
│   │   │   └── modules/      # Feature modules
│   │   │       ├── auth/         # Registration, login
│   │   │       ├── health/       # Health check endpoint
│   │   │       └── tasks/        # Task CRUD (vertical slice)
│   │   ├── drizzle/          # Generated migrations
│   │   └── drizzle.config.ts
│   ├── frontend/         # Next.js app (TypeScript, Tailwind)
│   │   └── src/
│   │       ├── app/          # App Router pages
│   │       └── lib/          # API client, utilities
│   └── shared/           # Shared types & validation schemas
│       └── src/
│           ├── types/        # TypeScript types & enums
│           └── schemas/      # Zod validation schemas
├── docker-compose.yml        # Production Docker setup
├── docker-compose.dev.yml    # Dev override (hot reload)
├── docs/                     # Architecture documentation
└── tsconfig.base.json        # Shared TypeScript config
```

## Development Commands

| Command | Description |
|---|---|
| `pnpm dev:backend` | Start backend dev server (tsx watch) |
| `pnpm dev:frontend` | Start frontend dev server (Next.js) |
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm typecheck` | Type-check all packages |
| `pnpm lint` | Lint all packages |
| `pnpm format` | Format all files (Prettier) |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm db:push` | Push schema directly (dev only) |
| `pnpm db:studio` | Open Drizzle Studio (DB browser) |
| `pnpm docker:up` | Start all Docker services |
| `pnpm docker:down` | Stop all Docker services |

## Architecture

For comprehensive design and architectural specifications:
- **System Architecture Overview:** [docs/architecture.md](docs/architecture.md)
- **High-Level Design (HLD):** [docs/hld.md](docs/hld.md)
- **Low-Level Design (LLD):** [docs/lld.md](docs/lld.md)

**Key principles & security:**
- **Memory First** — the system gets more useful as persistent understanding grows
- **Structured Data Over Raw Chat** — important entities are explicit DB records
- **Agents Reason, Services Execute** — LLM decides; deterministic services perform operations
- **Human Control** — high-risk actions require confirmation
- **Data Isolation** — user data must remain isolated
- **Dual-Token Auth & Rate Limiting** — 15m access token (JWT), 30d refresh token (hashed in PostgreSQL), and 20 req/15min rate limiting on `/api/auth/*`

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind CSS |
| Backend | Express.js 5, TypeScript |
| Database | PostgreSQL 17 + pgvector (0.8.6) |
| ORM | Drizzle ORM |
| Authentication | Dual-token (15m JWT access + 30d revocable refresh token) |
| Rate Limiting | express-rate-limit (20 req / 15 min per IP) |
| AI Orchestration | LangGraph.js (Phase 2+) |
| Background Jobs | Redis + BullMQ (Phase 2+) |
| Infrastructure | Docker / Docker Compose |

## Development Phases

| Phase | Focus | Status |
|---|---|---|
| 0 — Foundation & Hardening | Repo, Docker, DB, Testing, Dual-Token Auth, E2E | Completed |
| 1 — Productivity Core | Auth, Projects, Tasks, Notes, Activity | Planned |
| 2 — AI Foundation | AI Chat, LLM Gateway, Tool Calling | Planned |
| 3 — Memory & Knowledge | Memory, Embeddings, RAG, Documents | Planned |
| 4 — Agentic Intelligence | Planner, Continue Project, LangGraph | Planned |
| 5 — Integrations | GitHub, Calendar, external services | Planned |
| 6 — Evaluation & Production | Testing, security, performance | Planned |
