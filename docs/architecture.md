# LifeOS — Architecture Overview

## System Overview

LifeOS is built as a modular monolith with a clear separation between frontend, backend, and infrastructure. All services run as Docker containers in production; in development, the frontend and backend run locally with Docker providing only PostgreSQL and Redis.

```
┌─────────────────────────────────────────────────────────────┐
│                       Frontend (Next.js)                     │
│                      http://localhost:3000                    │
└─────────────┬───────────────────────────────────────────────┘
              │ HTTP (REST JSON)
              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Express.js)                       │
│                    http://localhost:4000                      │
│                                                              │
│  Route → Validation → Controller → Service → Repository     │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Auth    │  │  Tasks   │  │  Health  │  │  ...     │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────┬────────────────────────┬──────────────────────────┘
          │                        │
          ▼                        ▼
┌──────────────────┐    ┌──────────────────┐
│   PostgreSQL     │    │     Redis        │
│   + pgvector     │    │                  │
│   :5432          │    │   :6379          │
└──────────────────┘    └──────────────────┘
```

---

## Request Flow

All API requests follow the same layered pipeline:

```
HTTP Request
  → Express Route (path, method)
  → Middleware (auth, validation, rate limiting)
  → Controller (thin — delegates to service)
  → Service (business logic, transactions)
  → Repository (data access via Drizzle ORM)
  → Database (PostgreSQL)
  → Response (ApiResponse<T> envelope)
```

### Governing Rules

1. **Controllers stay thin** — no business logic, no direct DB queries.
2. **Services orchestrate** — business rules, transactions, cross-entity coordination.
3. **Repositories own data access** — all Drizzle queries are encapsulated here.
4. **Validation at the boundary** — Zod schemas validate all input before it reaches the controller.
5. **Centralized error handling** — all errors flow through a single error handler middleware.

---

## Data Model

### Phase 0 Tables

```
┌──────────────┐     ┌──────────────┐     ┌────────────────┐
│    users     │────<│    tasks     │────>│ activity_events │
│              │     │              │     │ (append-only)   │
│ id (PK)      │     │ id (PK)      │     │                 │
│ email        │     │ userId (FK)  │     │ id (PK)         │
│ passwordHash │     │ title        │     │ userId (FK)     │
│ name         │     │ priority     │     │ eventType       │
│              │     │ status       │     │ entityType      │
│              │     │ deletedAt    │     │ entityId        │
└──────┬───────┘     │ projectId?   │     │ summary         │
       │             └──────────────┘     │ metadata        │
       │                                  └────────────────┘
       │             ┌──────────────┐
       │             │  projects    │
       │             │ (scaffold)   │
       │             │              │
       │             │ id (PK)      │
       │             │ userId (FK)  │
       │             │ title        │
       │             │ deletedAt    │
       │             └──────────────┘
       │
       │             ┌────────────────┐
       └────────────<│ refresh_tokens │ (Session Entity, P0H-1, P0H-5)
                     │                │
                     │ id (PK)        │
                     │ userId (FK)    │
                     │ tokenHash (UQ) │
                     │ expiresAt      │
                     │ revokedAt      │
                     └────────────────┘
```

### Key Conventions

- **UUIDs** for all primary keys (`gen_random_uuid()`).
- **Soft deletes** via `deletedAt` timestamp on user-facing entities (`tasks`, `projects`). Activity events and refresh tokens are exempt.
- **User scoping** — every entity carries `userId`. All queries enforce `WHERE userId = authenticatedUser.id`.
- **Timestamps** — `createdAt` and `updatedAt` with timezone on all tables.
- **Transactional activity logging** — every meaningful mutation inserts an activity event in the same DB transaction (FR-TASK-4).

---

## Authentication & Token Lifecycle (P0H-1, P0H-5)

LifeOS implements a dual-token authentication model with server-side revocation:

```
Register / Login
  │
  ├─► Access Token:  Short-lived JWT (15 minutes).
  │                  Verified by cryptographic signature & expiry — zero DB hit per request.
  │
  └─► Refresh Token: Cryptographically secure 40-byte hex token (30 days TTL).
                     Stored hashed with SHA-256 in `refresh_tokens` table.
```

### Token Operations

1. **API Requests:** Client attaches `Authorization: Bearer <accessToken>`.
2. **Token Refresh (`POST /api/auth/refresh`):** 
   - Client sends `{ refreshToken }`.
   - Backend hashes the incoming token and checks `refresh_tokens` table.
   - Verifies: token exists, `revokedAt IS NULL`, `expiresAt > now()`.
   - **Rotation:** The old refresh token is marked revoked (`revokedAt = now()`), and a fresh access token + new refresh token pair is issued.
3. **Logout (`POST /api/auth/logout`):**
   - Marks the target refresh token revoked (`revokedAt = now()`).
   - Subsequent refresh attempts return `401 Unauthorized`.
4. **Client Auto-Refresh:** The frontend API client automatically intercepts `401 Unauthorized` responses on authenticated endpoints, transparently exchanges the refresh token for a new access token, and retries the original request without user interruption.

### Security Tradeoff & Documented Invariant

- **Accepted Tradeoff:** An access token that has already been issued remains cryptographically valid until its 15-minute natural expiration. Immediate revocation of the active access token is intentionally traded off against database latency on every API request.
- **Session Domain Entity (P0H-5):** The `refresh_tokens` database entity represents and replaces the placeholder `Session` entity from the PRD domain model, providing persistent, deterministic session tracking with revocation history.

---

## Rate Limiting (FR-AUTH-5, P0H-3)

To prevent brute-force and credential-stuffing attacks:
- **Threshold:** 20 requests per 15-minute window per client IP address.
- **Applied to:** `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`.
- **Exceeded Behavior:** Returns HTTP `429 Too Many Requests` with RFC-compliant retry headers and standard envelope:
  ```json
  {
    "success": false,
    "error": {
      "code": "RATE_LIMIT_EXCEEDED",
      "message": "Too many attempts, please try again later"
    }
  }
  ```

---

## Module Boundary Map & Dependency Rules (OD-4, P0H-6)

LifeOS is designed as a modular monolith. To prevent architectural erosion before Phase 1 and Phase 2:

```
┌─────────────────────────────────────────────────────────────┐
│                 AI Module (Phase 2+)                        │
│                 (Orchestrator / Consumer)                   │
└─────────────┬──────────────────┬─────────────────┬──────────┘
              │                  │                 │ (read-only service calls)
              ▼                  ▼                 ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   Auth Module    │    │   Tasks Module   │    │  Projects Module │ (Domain Peers)
└──────────────────┘    └────────┬─────────┘    └──────────────────┘
                                 │
                                 ▼ (transactional event emission)
                        ┌──────────────────┐
                        │ Activity Events  │
                        └──────────────────┘
```

### Governing Rules

1. **Domain Modules are Peers:**
   `auth`, `tasks`, `projects`, `notes`, and `activity` are peers in the domain layer. They must never directly import another module's database repository, internal schemas, or controllers.
2. **Service-Layer Contracts:**
   Cross-module business logic occurs solely via exported Service interfaces or through append-only domain activity events (`activity_events`).
3. **Unidirectional AI Dependency:**
   The future `ai` module (Phase 2+) will orchestrate retrieval and tool calling. The `ai` module may depend on domain modules' public service read methods. Domain modules must **NEVER** import or depend on the `ai` module.
4. **Data Isolation (PP-6):**
   Every database query in every domain repository must strictly enforce user scoping (`WHERE userId = authenticatedUser.id`).

---

## Error Handling

All errors follow a consistent pattern:

1. **Known errors** extend `AppError` with a status code and machine-readable code.
2. **Validation errors** include field-level details from Zod.
3. **Unknown errors** are logged server-side; clients receive a generic 500 with no internal details.

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": { "body.title": ["Title is required"] }
  }
}
```

---

## Directory Convention

Each backend module follows a consistent file structure:

```
modules/<name>/
  ├── <name>.routes.ts       # Express routes + middleware wiring
  ├── <name>.controller.ts   # Thin request/response handling
  ├── <name>.service.ts      # Business logic & transactions
  ├── <name>.repository.ts   # Data access (Drizzle queries)
  ├── <name>.schema.ts       # Zod validation schemas
  ├── <name>.service.test.ts # Service unit tests
  └── <name>.routes.test.ts  # Route integration tests
```

---

## Technology Decisions

| Decision | Rationale |
|---|---|
| Drizzle ORM over Prisma | Type-safe SQL, no code generation step, lightweight |
| Express 5 over Fastify | Simpler ecosystem, adequate for MVP, team familiarity |
| Zod for validation | Shares schemas between frontend and backend via `@lifeos/shared` |
| pgvector on PostgreSQL | Single database for relational + vector data, avoids a separate vector DB |
| pnpm workspaces | Fast, disk-efficient, strict dependency resolution |
| Dual-Token Auth (P0H-1) | 15m JWT access token + 30d SHA-256 hashed refresh token in PostgreSQL |
