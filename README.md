# LifeOS

A persistent, context-aware personal operating system that stores structured knowledge about your work, retrieves that knowledge when relevant, and uses controlled AI agents to help you plan, understand, and resume your work.

---

## Current Status: Phase 0 Through Phase 5b Complete

LifeOS has completed **Phase 0 (Foundation & Hardening)**, **Phase 1 (Productivity Core)**, **Phase 2 (AI Foundation)**, **Phase 3 (Memory & Knowledge)**, **Phase 4 (Agentic Intelligence)**, and **Phase 5 (Read-Only Integrations: 5a GitHub & 5b Google Calendar)** with verified multi-tenant isolation, **258 automated tests across 38 test suites**, zero lint/typecheck errors, Next.js Turbopack production builds, and an automated GitHub Actions CI pipeline.

### What's Implemented & Verified

- **Read-Only Google Calendar Integration (Phase 5b):**
  - Standard Google OAuth 2.0 flow (`offline` access, `calendar.events.readonly` scope) with zero external SDK dependencies (native Node.js `fetch` client).
  - Cryptographically signed HMAC state parameter (15-minute expiration) preventing CSRF and injection attacks.
  - AES-256-GCM token encryption at rest with autonomous token refresh lifecycle (< 5-minute expiration threshold) against `oauth2.googleapis.com`.
  - Rolling 14-day window background synchronization via BullMQ (15-minute repeatable worker) into `calendar_events` table with automatic pruning of removed events.
  - Dashboard `📅 Upcoming Calendar` view with relative date groupings ("Today", "Tomorrow", day-of-week), time spans, locations, Google Calendar links, and on-demand "Sync Now" button.
- **Read-Only GitHub Integration (Phase 5a):**
  - Personal Access Token (PAT) authentication with AES-256-GCM encryption at rest (`INTEGRATION_ENCRYPTION_KEY`). Zero token leakage in API responses or logs.
  - Project repository linking (`owner/repo`) with remote validation and strict tenant verification.
  - Repeatable BullMQ worker polling every 15 minutes plus manual on-demand sync for open issues and pull requests into local database cache (`github_issues`, `github_pull_requests`).
  - Dashboard `🐙 GitHub` tab in project view with searchable issue/PR tables and interactive task-to-issue linking badges (`🐙 #42 ↗`).
- **Agentic Intelligence & Multi-Agent Workflows (Phase 4):**
  - **Planner Agent:** Multi-agent LangGraph workflow analyzing project context (tasks, notes, documents, memories) to recommend actionable, structured task plans with dependency ordering. Human-in-the-loop review and transactional batch application (`POST /api/planner/apply`).
  - **Continue Project Agent:** Deterministic context extraction synthesizing recent project activity, completed milestones, blockers, and high-impact next steps with confidence scoring.
  - **Hierarchical Agent Runs Tracking:** Audit trail in `agent_runs` capturing execution status, input prompts, model metadata, token usage, and step-by-step tool invocations.
  - **Project Context Engine:** Token-budgeted context assembler combining active tasks, recent notes, relevant document snippets, and memories.
- **Unified RAG Retrieval & Memory Bank (Phase 3):**
  - `HybridRetrievalService` combining PostgreSQL Full-Text Search (`ts_rank`) with 768-dimensional vector cosine distance (`<=>`) via Reciprocal Rank Fusion (RRF, $k=60$).
  - Concrete Ollama embedding provider targeting `nomic-embed-text` with model version tracking and zero-downtime batch re-embedding CLI (`pnpm --filter @lifeos/backend ai:reembed`).
  - Explicit Memory Bank supporting 4 categories (`fact`, `decision`, `preference`, `goal`) with non-destructive conflict resolution ($\ge 0.90$ similarity marks prior memories superseded).
  - Asynchronous document ingestion pipeline (PDF, TXT, MD) with sliding-window chunking and Redis-backed BullMQ processing.
  - System prompt anti-hallucination guardrail and interactive chat citation cards with relevance scores.
- **Provider-Agnostic LLM Gateway & Deterministic Tools (Phase 2):**
  - Internal `LLMProvider` abstraction with local Ollama (`qwen3:8b`, temperature `0.15`).
  - Chain-of-Thought (CoT) suppression stripping `<think>...</think>` tokens in-stream to prevent raw reasoning leaks.
  - Scoped tool registry with risk tiers (`READ_ONLY`, `WRITE`, `DESTRUCTIVE`, `EXTERNAL`) and max-5-calls-per-turn guardrail.
  - Real-time Server-Sent Events (SSE) streaming chat with persistent conversations and activity tagging (`source: 'ai'`).
- **Productivity Core & Multi-Tenant Foundation (Phases 0 & 1):**
  - Dual-token authentication: short-lived 15-minute JWT access tokens and 30-day revocable, rotated refresh tokens in PostgreSQL.
  - Comprehensive CRUD modules: Projects (with status tracking), Tasks (priorities, statuses, project linking), and Notes (markdown, tag arrays).
  - Append-only activity timeline capturing all user, project, AI, and integration events.
  - Rate limiting, security headers (Helmet), response compression, and global error handling.
- **Continuous Integration (CI):**
  - GitHub Actions workflow (`.github/workflows/ci.yml`) on Node 22 (LTS) with containerized PostgreSQL 17 (`pgvector`) and Redis 7.
  - Runs shared build, database migrations, typecheck, linting, all 258 unit/integration tests, and production build.

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v22.13+ (Active LTS)
- [pnpm](https://pnpm.io/) v9+ (or v11)
- [Docker](https://www.docker.com/) & Docker Compose
- [Ollama](https://ollama.com/) with `qwen3:8b` and `nomic-embed-text` pulled:
  ```bash
  ollama pull qwen3:8b
  ollama pull nomic-embed-text
  ```

### Setup

```bash
# 1. Clone and install dependencies
pnpm install

# 2. Create environment file
cp .env.example .env
# Edit .env:
# - Set a strong JWT_SECRET (min 32 chars)
# - Set INTEGRATION_ENCRYPTION_KEY (32-byte / 64-hex string for token encryption at rest)
# - (Optional) Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET for Google Calendar OAuth

# 3. Start PostgreSQL 17 and Redis 7
docker compose up -d postgres redis

# 4. Start Ollama server
ollama serve

# 5. Run database migrations
pnpm db:migrate

# 6. Start development servers
pnpm dev:backend   # Express API on http://localhost:4000
pnpm dev:frontend  # Next.js app on http://localhost:3000
pnpm dev:worker    # (Optional) BullMQ background sync worker
```

### Verify

```bash
# Health check
curl http://localhost:4000/api/health

# Run automated tests (258 tests across 38 test suites)
pnpm test

# Type-check all workspace packages
pnpm typecheck

# Lint all workspace packages
pnpm lint

# Production build (Next.js Turbopack + backend tsc)
pnpm build

# Live Google Calendar cryptographic round-trip check
pnpm --filter @lifeos/backend verify:google:live
```

---

## API Surface

All domain routes require `Authorization: Bearer <accessToken>` unless marked public.

| Method | Endpoint | Description |
|---|---|---|
| **Auth** | | |
| `POST` | `/api/auth/register` | Register new user (returns tokens) |
| `POST` | `/api/auth/login` | Log in user (returns tokens) |
| `POST` | `/api/auth/refresh` | Rotate refresh token & issue new pair |
| `POST` | `/api/auth/logout` | Revoke refresh token |
| `GET` | `/api/health` | Service health status *(public)* |
| **Projects & Tasks** | | |
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
| **Notes & Knowledge** | | |
| `POST` | `/api/notes` | Create note (with tags & optional `projectId`) |
| `GET` | `/api/notes` | List notes (supports `projectId`, `tag`, pagination) |
| `GET` | `/api/notes/search` | Search notes via hybrid vector + FTS search (`q=...`) |
| `GET` | `/api/notes/:id` | Get note by ID |
| `PATCH` | `/api/notes/:id` | Update note details, tags, or content |
| `DELETE` | `/api/notes/:id` | Soft-delete note |
| `POST` | `/api/memories` | Create explicit memory (`fact`, `decision`, `preference`, `goal`) |
| `GET` | `/api/memories` | List memories (supports `category`, `includeSuperseded`) |
| `GET` | `/api/memories/:id` | Get memory by ID |
| `DELETE` | `/api/memories/:id` | Soft-delete memory |
| `POST` | `/api/documents` | Upload document file (multipart: PDF, TXT, MD) |
| `POST` | `/api/documents/:id/versions` | Re-upload new document version |
| `GET` | `/api/documents` | List documents (supports `status`, `projectId`) |
| `GET` | `/api/documents/:id` | Get document metadata & active version |
| `GET` | `/api/documents/:id/chunks` | Get document chunks & token counts |
| `DELETE` | `/api/documents/:id` | Soft-delete document & cascades |
| `GET` | `/api/activity` | List user activity timeline (chronological) |
| **AI & Conversations** | | |
| `POST` | `/api/conversations` | Create conversation (global or project-scoped) |
| `GET` | `/api/conversations` | List user conversations (supports `projectId`) |
| `GET` | `/api/conversations/:id` | Get conversation with messages & tool calls |
| `PATCH` | `/api/conversations/:id` | Update conversation title |
| `DELETE` | `/api/conversations/:id` | Delete conversation (cascades) |
| `POST` | `/api/conversations/:id/messages` | Send message & stream assistant response via SSE |
| **Agentic Intelligence** | | |
| `POST` | `/api/planner/plan` | Generate AI project plan from context |
| `POST` | `/api/planner/apply` | Apply approved plan recommendations into tasks |
| `GET` | `/api/agent-runs` | List agent execution runs (supports `projectId`) |
| `GET` | `/api/agent-runs/:id` | Get agent run audit details & step log |
| **Integrations (GitHub & Google Calendar)** | | |
| `POST` | `/api/integrations/github/connect` | Connect GitHub via Personal Access Token |
| `DELETE` | `/api/integrations/github/disconnect` | Disconnect GitHub integration |
| `GET` | `/api/integrations/github` | Get GitHub connection status |
| `POST` | `/api/projects/:id/github/link` | Link project to GitHub repository (`owner/name`) |
| `DELETE` | `/api/projects/:id/github/link` | Unlink project from GitHub repository |
| `GET` | `/api/projects/:id/github` | Get linked GitHub repo data (issues, PRs, sync status) |
| `POST` | `/api/projects/:id/github/sync` | Trigger on-demand sync of project GitHub data |
| `GET` | `/api/integrations/google/auth-url` | Generate Google OAuth authorization URL |
| `GET` | `/api/integrations/google/callback` | OAuth redirect callback *(public)* |
| `GET` | `/api/integrations/google` | Get Google Calendar connection status |
| `DELETE` | `/api/integrations/google/disconnect` | Disconnect Google Calendar integration |
| `GET` | `/api/calendar/events` | List rolling 14-day cached calendar events |
| `POST` | `/api/calendar/sync` | Trigger on-demand sync of primary Google Calendar |

---

## Project Structure

```
lifeos/
├── .github/
│   └── workflows/
│       └── ci.yml            # GitHub Actions CI workflow (Node 22, PG 17, Redis 7)
├── docs/
│   ├── architecture.md       # Architecture & module boundary guidelines
│   ├── hld.md                # System-level High-Level Design
│   └── lld.md                # Schema-level Low-Level Design
├── packages/
│   ├── backend/              # Express.js 5 API (TypeScript, NodeNext)
│   │   ├── src/
│   │   │   ├── config/       # Typed env config with Zod validation
│   │   │   ├── db/           # Drizzle ORM client + schemas (PostgreSQL + pgvector)
│   │   │   │   └── schema/   # users, projects, tasks, notes, memories, documents,
│   │   │   │                 # conversations, agent_runs, integrations, github_*, calendar_events...
│   │   │   ├── lib/          # Shared utilities (encryption, errors, github/google clients)
│   │   │   ├── middleware/   # auth (JWT), validation (Zod), rate limiting, error handling
│   │   │   ├── modules/      # Domain modules (strict peer isolation)
│   │   │   │   ├── activity/ # Append-only activity timeline
│   │   │   │   ├── ai/       # LLM gateway (Ollama), hybrid retrieval, agents (Planner, Continue)
│   │   │   │   ├── auth/     # Dual-token auth, session management
│   │   │   │   ├── calendar/ # Google Calendar repository, sync engine, queue, worker
│   │   │   │   ├── documents/# Document ingestion pipeline, chunking, BullMQ worker
│   │   │   │   ├── github/   # GitHub sync service, repository links, queue, worker
│   │   │   │   ├── health/   # System health checks
│   │   │   │   ├── integrations/ # GitHub PAT & Google OAuth services, token lifecycle
│   │   │   │   ├── memory/   # Explicit memory bank & conflict resolution
│   │   │   │   ├── notes/    # Notes CRUD & hybrid search
│   │   │   │   ├── projects/ # Project lifecycle management
│   │   │   │   └── tasks/    # Task management with project linking
│   │   │   ├── app.ts        # Express app factory
│   │   │   ├── server.ts     # HTTP server entrypoint
│   │   │   └── worker.ts     # BullMQ background worker entrypoint
│   │   ├── drizzle/          # Generated SQL migrations (0000 through 0007)
│   │   └── drizzle.config.ts
│   ├── frontend/             # Next.js 16 app (Turbopack, TypeScript, Tailwind)
│   │   └── src/
│   │       ├── app/
│   │       │   ├── dashboard/
│   │       │   │   ├── components/ # ProjectSidebar, CalendarView, SettingsView, GitHubTabView,
│   │       │   │   │               # MemoryView, DocumentManagerView, ChatView, PlannerView...
│   │       │   │   └── page.tsx    # Unified dashboard layout
│   │       │   ├── login/
│   │       │   └── register/
│   │       └── lib/          # Typed API client with auto-refresh & error handling
│   └── shared/               # Cross-cutting types & validation schemas
│       └── src/
│           ├── schemas/      # Zod validation schemas (calendar, integration, memory, task, etc.)
│           └── types/        # TypeScript DTOs, enums, RiskTier, SSE stream events
├── scripts/                  # Migration runner and verification utilities
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
| **Phase 3 — Memory & Knowledge** | Hybrid Search, Embeddings, Vector Index, Ingestion, RAG | **Completed** |
| **Phase 4 — Agentic Intelligence** | Multi-Agent Planner, Continue Project, Execution Audit Logs | **Completed** |
| **Phase 5a — Read-Only GitHub Integration** | PAT Connection, Repo Linking, Issue/PR Sync, Task Linking | **Completed** |
| **Phase 5b — Read-Only Google Calendar** | OAuth 2.0 Flow, Token Refresh, 14-Day Sync, Upcoming Agenda | **Completed** |
| **Phase 6 — Evaluation & Production** | Observability, Evals, Security Hardening, Production Deployment | Planned |
