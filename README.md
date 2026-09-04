# LifeOS

A persistent, context-aware personal operating system that stores structured knowledge about your work, retrieves that knowledge when relevant, and uses controlled AI agents to help you plan, understand, and resume your work.

---

## Current Status: Phase 0 & Phase 1 Complete

LifeOS has completed **Phase 0 (Foundation & Hardening)** and **Phase 1 (Productivity Core)** with verified multi-tenant isolation, a 70-test automated test suite, live browser recording validation, and an automated GitHub Actions CI pipeline.

### What's Implemented & Verified

- **Dual-Token Authentication & Sessions (FR-AUTH-1..5):**
  - Short-lived 15-minute access token (JWT) verified purely via signature with zero database overhead.
  - Long-lived 30-day revocable refresh token (SHA-256 hashed in PostgreSQL) with automatic token rotation on `POST /api/auth/refresh`.
  - Server-side session revocation on `POST /api/auth/logout`.
  - Rate limiting on `/api/auth/*` (20 requests per 15-minute window per IP) returning `429 Too Many Requests`.
- **Projects Module (FR-PROJ-1..4):**
  - Full CRUD with lifecycle statuses (`active`, `archived`).
  - Transactional activity logging emitting `PROJECT_CREATED`, `PROJECT_UPDATED`, `PROJECT_STATUS_CHANGED`, and `PROJECT_DELETED`.
- **Task Management with Project Linking (FR-TASK-1..4):**
  - Priority levels (`low`, `medium`, `high`, `urgent`), statuses (`todo`, `in_progress`, `done`).
  - Strict cross-tenant project validation: linking a task to a non-existent or another user's project rejects with `404 NOT_FOUND`.
  - Transactional activity logging (`TASK_CREATED`, `TASK_STATUS_CHANGED`, `TASK_DELETED`).
- **Notes with PostgreSQL Full-Text Search (FR-NOTE-1..4):**
  - Markdown note content with tag arrays (`tags: text[]`).
  - Native PostgreSQL Full-Text Search using generated `search_vector tsvector` with GIN indexing and `ts_rank()` relevance scoring.
  - Transactional activity logging (`NOTE_CREATED`, `NOTE_UPDATED`, `NOTE_DELETED`).
- **Activity Timeline API (FR-ACT-1..4):**
  - Append-only event store capturing user and project lifecycle events chronologically.
  - Endpoints for global timeline (`GET /api/activity`) and project timeline (`GET /api/projects/:id/activity`).
- **Project-Centric Dashboard UI:**
  - Modern Next.js 16 modular interface with `ProjectSidebar`, `ProjectView` (Tabs: Tasks, Notes, Activity), `TaskList`, `NoteList` (live keyword search), and `ActivityFeed`.
  - Multi-tenant isolation verified end-to-end in live browser sessions.
  - Resilient data loading using `Promise.allSettled` to isolate failures.
- **Continuous Integration (CI):**
  - GitHub Actions workflow (`.github/workflows/ci.yml`) on Node 22 (LTS) with containerized PostgreSQL 17 (`pgvector`) and Redis 7.
  - Automatically verifies package compilation, database migrations, recursive typecheck, linting, 70 unit/integration tests, and production build.

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v22.13+ (Active LTS)
- [pnpm](https://pnpm.io/) v9+ (or v11)
- [Docker](https://www.docker.com/) & Docker Compose

### Setup

```bash
# 1. Clone and install dependencies
pnpm install

# 2. Create environment file
cp .env.example .env
# Edit .env — set a strong JWT_SECRET (min 32 chars)

# 3. Start PostgreSQL 17 and Redis 7
docker compose up -d postgres redis

# 4. Run database migrations
pnpm db:migrate

# 5. Start development servers
pnpm dev:backend   # Express API on http://localhost:4000
pnpm dev:frontend  # Next.js app on http://localhost:3000
```

### Verify

```bash
# Health check
curl http://localhost:4000/api/health

# Run automated tests (70 tests across 10 test suites)
pnpm test

# Type-check all workspace packages
pnpm typecheck

# Lint all workspace packages
pnpm lint

# Production build
pnpm build
```

---

## API Surface

All domain routes require `Authorization: Bearer <accessToken>` unless marked public.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register new user (returns tokens) |
| `POST` | `/api/auth/login` | Log in user (returns tokens) |
| `POST` | `/api/auth/refresh` | Rotate refresh token & issue new pair |
| `POST` | `/api/auth/logout` | Revoke refresh token |
| `GET` | `/api/health` | Service health status |
| `POST` | `/api/projects` | Create a new project |
| `GET` | `/api/projects` | List projects (supports `status`, pagination) |
| `GET` | `/api/projects/:id` | Get project by ID |
| `PATCH` | `/api/projects/:id` | Update project details or status |
| `DELETE` | `/api/projects/:id` | Soft-delete project |
| `GET` | `/api/projects/:id/activity` | List activity timeline for a project |
| `POST` | `/api/tasks` | Create task (validates `projectId` ownership) |
| `GET` | `/api/tasks` | List tasks (supports `projectId`, `status`, `priority`) |
| `GET` | `/api/tasks/:id` | Get task by ID |
| `PATCH` | `/api/tasks/:id` | Update task details or status |
| `DELETE` | `/api/tasks/:id` | Soft-delete task |
| `POST` | `/api/notes` | Create note (with tags & optional `projectId`) |
| `GET` | `/api/notes` | List notes (supports `projectId`, `tag`, pagination) |
| `GET` | `/api/notes/search` | Search notes via full-text keyword search (`q=...`) |
| `GET` | `/api/notes/:id` | Get note by ID |
| `PATCH` | `/api/notes/:id` | Update note details, tags, or content |
| `DELETE` | `/api/notes/:id` | Soft-delete note |
| `GET` | `/api/activity` | List user activity timeline (chronological) |

---

## Project Structure

```
lifeos/
├── .github/
│   └── workflows/
│       └── ci.yml            # GitHub Actions CI workflow
├── docs/
│   ├── architecture.md       # Architecture & module boundary guidelines
│   ├── hld.md                # System-level High-Level Design
│   └── lld.md                # Schema-level Low-Level Design
├── packages/
│   ├── backend/              # Express.js 5 API (TypeScript, NodeNext)
│   │   ├── src/
│   │   │   ├── config/       # Typed env config (Zod-validated)
│   │   │   ├── db/           # Drizzle ORM client + schemas (PostgreSQL)
│   │   │   │   └── schema/   # users, refresh_tokens, projects, tasks, notes, activity_events
│   │   │   ├── lib/          # Shared utilities (errors, password hashing)
│   │   │   ├── middleware/   # auth (JWT), validation (Zod), rate limiting, error handling
│   │   │   └── modules/      # Domain modules (peers — no cross-module repository imports)
│   │   │       ├── activity/ # Activity event logging & timeline
│   │   │       ├── auth/     # Dual-token auth, session management
│   │   │       ├── health/   # System health checks
│   │   │       ├── notes/    # Notes CRUD & PostgreSQL full-text search
│   │   │       ├── projects/ # Project lifecycle management
│   │   │       └── tasks/    # Task management with project linking
│   │   ├── drizzle/          # Generated SQL migrations (0000, 0001, 0002)
│   │   └── drizzle.config.ts
│   ├── frontend/             # Next.js 16 app (Turbopack, TypeScript, Tailwind)
│   │   └── src/
│   │       ├── app/
│   │       │   ├── dashboard/
│   │       │   │   ├── components/ # ProjectSidebar, ProjectView, TaskList, NoteList, ActivityFeed
│   │       │   │   └── page.tsx    # Project-centric dashboard layout
│   │       │   ├── login/
│   │       │   └── register/
│   │       └── lib/          # Dual-token API client with auto-refresh
│   └── shared/               # Cross-cutting types & validation schemas
│       └── src/
│           ├── schemas/      # Zod validation schemas (auth, project, task, note, activity)
│           └── types/        # TypeScript DTOs, enums, event types
├── docker-compose.yml        # PostgreSQL 17 + Redis 7 services
├── docker-compose.dev.yml    # Development override
└── tsconfig.base.json        # Monorepo TypeScript configuration
```

---

## Development Commands

| Command | Description |
|---|---|
| `pnpm dev` | Run backend and frontend concurrently |
| `pnpm dev:backend` | Start backend dev server (`tsx watch`) |
| `pnpm dev:frontend` | Start frontend dev server (`next dev --turbopack`) |
| `pnpm build` | Build all packages (`@lifeos/shared`, backend, frontend) |
| `pnpm test` | Run all Vitest test suites across packages |
| `pnpm typecheck` | Type-check all packages (`tsc --noEmit`) |
| `pnpm lint` | Lint all packages with ESLint |
| `pnpm format` | Format files with Prettier |
| `pnpm db:generate` | Generate Drizzle migrations from schemas |
| `pnpm db:migrate` | Apply Drizzle SQL migrations to database |
| `pnpm db:studio` | Open Drizzle Studio database explorer |
| `pnpm docker:up` | Start background Docker containers |
| `pnpm docker:down` | Stop background Docker containers |

---

## Architecture

For comprehensive technical specifications:
- **System Architecture Overview:** [docs/architecture.md](docs/architecture.md)
- **High-Level Design (HLD):** [docs/hld.md](docs/hld.md)
- **Low-Level Design (LLD):** [docs/lld.md](docs/lld.md)

**Core Architectural Invariants:**
1. **Peer Domain Boundary Rule:** Domain modules (`projects`, `tasks`, `notes`, `activity`, `auth`) are peers. Cross-module operations occur exclusively via public service interfaces (e.g., `task.service` calling `project.service.getProject`), never via cross-module repository or table imports.
2. **Strict Tenant Isolation:** Every data access query is filtered by `userId`. Cross-tenant project linking yields `404 NOT_FOUND` to prevent information disclosure.
3. **Dual-Token Auth & Session Management:** Access tokens expire in 15 minutes and require zero DB lookups. Refresh tokens are single-use with cryptographic rotation, stored hashed with SHA-256, and immediately revocable.
4. **Append-Only Activity Stream:** Activity events are never updated or soft-deleted; they form an audit trail for user history and future AI agent context retrieval.

---

## Development Roadmap

| Phase | Focus | Status |
|---|---|---|
| **Phase 0 — Foundation & Hardening** | Repo, Docker, DB, Testing, Dual-Token Auth, E2E | **Completed** |
| **Phase 1 — Productivity Core** | Projects, Tasks Linking, Notes FTS, Activity API, Dashboard | **Completed** |
| **Phase 2 — AI Foundation** | AI Chat, LLM Gateway, Structured Tool Calling | Next |
| **Phase 3 — Memory & Knowledge** | Hybrid Search, Embeddings, Vector Index, Chunking | Planned |
| **Phase 4 — Agentic Intelligence** | Multi-Agent Planner, Continue Project, Reflection | Planned |
| **Phase 5 — Integrations** | GitHub, Google Calendar, External Services | Planned |
| **Phase 6 — Evaluation & Production** | Observability, Evals, Security Hardening | Planned |
