# LifeOS

A persistent, context-aware personal operating system that stores structured knowledge about your work, retrieves that knowledge when relevant, and uses controlled AI agents to help you plan, understand, and resume your work.

---

## Current Status: Phase 0, Phase 1, & Phase 2 Complete

LifeOS has completed **Phase 0 (Foundation & Hardening)**, **Phase 1 (Productivity Core)**, and **Phase 2 (AI Foundation)** with verified multi-tenant isolation, a 109-test automated test suite, live browser recording validation, real live-model Ollama evaluation, and an automated GitHub Actions CI pipeline.

### What's Implemented & Verified

- **Provider-Agnostic LLM Gateway (FR-CHAT-3, A-1):**
  - Internal `LLMProvider` abstraction allowing seamless provider switches without altering business services or controllers.
  - Production Ollama provider targeting local `qwen3:8b` via `http://127.0.0.1:11434` with temperature `0.15`.
  - **CoT Suppression (FR-OBS-2):** Explicit `think: false` combined with `StreamThinkingFilter` to parse and strip `<think>...</think>` tokens in-stream, ensuring raw reasoning is never leaked to the client.
- **Deterministic Scoped Tool Registry & Loop (FR-SAFE-1, FR-SAFE-3, A-2):**
  - Typed full `RiskTier = 'READ_ONLY' | 'WRITE' | 'DESTRUCTIVE' | 'EXTERNAL'` in `@lifeos/shared`.
  - Exactly 4 deterministic tools: `createTask` (`WRITE`), `createNote` (`WRITE`), `updateTaskStatus` (`WRITE`), and `getProjectContext` (`READ_ONLY`).
  - Safe multi-turn loop with strict **max 5 tool calls per turn** guardrail preventing runaway execution.
- **AI-Initiated Activity Tagging (PP-7, A-3):**
  - Domain mutations via tool execution forward `{ source: 'ai', conversationId }` context.
  - Persisted in `activity_events.metadata` at the database level.
  - Displayed with a prominent purple **`AI`** badge in the project and global Activity feeds.
- **Conversation & Message Persistence (FR-CHAT-1, FR-CHAT-2, A-4):**
  - User-scoped PostgreSQL tables: `conversations`, `messages`, and `tool_calls` audit log.
  - Strict 404 tenant isolation: attempting to link a conversation to a foreign project or query foreign conversation data returns `404 NOT_FOUND`.
  - Mid-stream disconnect resilience: partial assistant messages persisted with `status: 'interrupted'` on client abort.
- **Real-Time Streaming Chat UI (P2-5):**
  - Interactive Next.js 16 chat view with conversation sidebar switcher and project context filter.
  - Incremental Server-Sent Events (SSE) token stream parser.
  - In-stream `ToolActivityCard` showing tool name, risk tier badge, and expandable inputs/results.
  - "Ask Project AI" trigger in the project header.
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
  - Strict cross-tenant project validation: linking a task to a non-existent or foreign project rejects with `404 NOT_FOUND`.
  - Transactional activity logging (`TASK_CREATED`, `TASK_STATUS_CHANGED`, `TASK_DELETED`).
- **Notes with PostgreSQL Full-Text Search (FR-NOTE-1..4):**
  - Markdown note content with tag arrays (`tags: text[]`).
  - Native PostgreSQL Full-Text Search using generated `search_vector tsvector` with GIN indexing and `ts_rank()` relevance scoring.
  - Transactional activity logging (`NOTE_CREATED`, `NOTE_UPDATED`, `NOTE_DELETED`).
- **Activity Timeline API (FR-ACT-1..4):**
  - Append-only event store capturing user and project lifecycle events chronologically.
  - Endpoints for global timeline (`GET /api/activity`) and project timeline (`GET /api/projects/:id/activity`).
- **Continuous Integration (CI):**
  - GitHub Actions workflow (`.github/workflows/ci.yml`) on Node 22 (LTS) with containerized PostgreSQL 17 (`pgvector`) and Redis 7.
  - Automatically verifies package compilation, database migrations, recursive typecheck, linting, 109 unit/integration tests, and production build.

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v22.13+ (Active LTS)
- [pnpm](https://pnpm.io/) v9+ (or v11)
- [Docker](https://www.docker.com/) & Docker Compose
- [Ollama](https://ollama.com/) with `qwen3:8b` pulled (`ollama pull qwen3:8b`)

### Setup

```bash
# 1. Clone and install dependencies
pnpm install

# 2. Create environment file
cp .env.example .env
# Edit .env — set a strong JWT_SECRET (min 32 chars) and verify OLLAMA_BASE_URL

# 3. Start PostgreSQL 17 and Redis 7
docker compose up -d postgres redis

# 4. Start Ollama server
ollama serve

# 5. Run database migrations
pnpm db:migrate

# 6. Start development servers
pnpm dev:backend   # Express API on http://localhost:4000
pnpm dev:frontend  # Next.js app on http://localhost:3000
```

### Verify

```bash
# Health check
curl http://localhost:4000/api/health

# Run automated tests (109 tests across 15 test suites)
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
| `POST` | `/api/conversations` | Create conversation (global or project-scoped) |
| `GET` | `/api/conversations` | List user conversations (supports `projectId`) |
| `GET` | `/api/conversations/:id` | Get conversation with messages & tool calls |
| `PATCH` | `/api/conversations/:id` | Update conversation title |
| `DELETE` | `/api/conversations/:id` | Delete conversation (cascade deletes messages/tool calls) |
| `POST` | `/api/conversations/:id/messages` | Send message & stream assistant response via SSE |

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
│   │   │   │   └── schema/   # users, refresh_tokens, projects, tasks, notes, activity_events, conversations, messages, tool_calls
│   │   │   ├── lib/          # Shared utilities (errors, password hashing)
│   │   │   ├── middleware/   # auth (JWT), validation (Zod), rate limiting, error handling
│   │   │   └── modules/      # Domain modules (peers — no cross-module repository imports)
│   │   │       ├── activity/ # Activity event logging & timeline
│   │   │       ├── ai/       # LLM gateway (Ollama), conversation service, tool registry, SSE chat
│   │   │       ├── auth/     # Dual-token auth, session management
│   │   │       ├── health/   # System health checks
│   │   │       ├── notes/    # Notes CRUD & PostgreSQL full-text search
│   │   │       ├── projects/ # Project lifecycle management
│   │   │       └── tasks/    # Task management with project linking
│   │   ├── drizzle/          # Generated SQL migrations (0000, 0001, 0002, 0003)
│   │   └── drizzle.config.ts
│   ├── frontend/             # Next.js 16 app (Turbopack, TypeScript, Tailwind)
│   │   └── src/
│   │       ├── app/
│   │       │   ├── dashboard/
│   │       │   │   ├── components/ # ProjectSidebar, ProjectView, TaskList, NoteList, ActivityFeed, ChatView
│   │       │   │   └── page.tsx    # Project-centric dashboard layout with AI Assistant view
│   │       │   ├── login/
│   │       │   └── register/
│   │       └── lib/          # Dual-token API client with auto-refresh
│   └── shared/               # Cross-cutting types & validation schemas
│       └── src/
│           ├── schemas/      # Zod validation schemas (auth, project, task, note, activity, conversation)
│           └── types/        # TypeScript DTOs, enums, RiskTier, SSE stream events
├── docker-compose.yml        # PostgreSQL 17 + Redis 7 services
├── docker-compose.dev.yml    # Development override
└── tsconfig.base.json        # Monorepo TypeScript configuration
```

---

## Development Roadmap

| Phase | Focus | Status |
|---|---|---|
| **Phase 0 — Foundation & Hardening** | Repo, Docker, DB, Testing, Dual-Token Auth, E2E | **Completed** |
| **Phase 1 — Productivity Core** | Projects, Tasks Linking, Notes FTS, Activity API, Dashboard | **Completed** |
| **Phase 2 — AI Foundation** | AI Chat, LLM Gateway, Structured Tool Calling, AI Observability | **Completed** |
| **Phase 3 — Memory & Knowledge** | Hybrid Search, Embeddings, Vector Index, Chunking | Next |
| **Phase 4 — Agentic Intelligence** | Multi-Agent Planner, Continue Project, Reflection | Planned |
| **Phase 5 — Integrations** | GitHub, Google Calendar, External Services | Planned |
| **Phase 6 — Evaluation & Production** | Observability, Evals, Security Hardening | Planned |
