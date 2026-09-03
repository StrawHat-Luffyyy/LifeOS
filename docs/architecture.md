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

## Data Model

### Phase 0 (Vertical Slice)

```
┌──────────┐     ┌──────────────┐     ┌────────────────┐
│  users   │────<│    tasks      │────>│ activity_events │
│          │     │              │     │ (append-only)   │
│ id (PK)  │     │ id (PK)      │     │                 │
│ email    │     │ userId (FK)  │     │ id (PK)         │
│ password │     │ title        │     │ userId (FK)     │
│ name     │     │ priority     │     │ eventType       │
│          │     │ status       │     │ entityType      │
│          │     │ deletedAt    │     │ entityId        │
└──────────┘     │ projectId?   │     │ summary         │
                 └──────────────┘     │ metadata        │
                                      └────────────────┘
                 ┌──────────────┐
                 │  projects    │
                 │ (scaffold)   │
                 │              │
                 │ id (PK)      │
                 │ userId (FK)  │
                 │ title        │
                 │ deletedAt    │
                 └──────────────┘
```

### Key Conventions

- **UUIDs** for all primary keys (v4, database-generated).
- **Soft deletes** via `deletedAt` timestamp on user-facing entities. Activity events are exempt (append-only).
- **User scoping** — every entity carries `userId`. All queries enforce `WHERE userId = authenticatedUser.id`.
- **Timestamps** — `createdAt` and `updatedAt` with timezone on all tables.
- **Transactional activity logging** — every meaningful mutation inserts an activity event in the same DB transaction (FR-TASK-4).

## Authentication

Phase 0 uses stateless JWT authentication:

```
Register/Login → bcrypt hash verification → JWT issued (7d expiry)
  → Client stores token in localStorage
  → Subsequent requests send Authorization: Bearer <token>
  → Auth middleware verifies + attaches req.user
```

> **Note:** Redis-backed sessions are planned for Phase 1 for improved security (server-side session revocation).

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

## Directory Convention

Each backend module follows a consistent file structure:

```
modules/<name>/
  ├── <name>.routes.ts      # Express routes + middleware wiring
  ├── <name>.controller.ts  # Thin request/response handling
  ├── <name>.service.ts     # Business logic
  ├── <name>.repository.ts  # Data access (Drizzle queries)
  ├── <name>.schema.ts      # Zod validation schemas (if not in shared)
  └── <name>.service.test.ts # Unit tests
```

## Configuration

All environment variables are validated at startup via Zod (`packages/backend/src/config/index.ts`). The app fails fast with descriptive errors if any required variable is missing or invalid.

## Technology Decisions

| Decision | Rationale |
|---|---|
| Drizzle ORM over Prisma | Type-safe SQL, no code generation step, lightweight |
| Express 5 over Fastify | Simpler ecosystem, adequate for MVP, team familiarity |
| Zod for validation | Shares schemas between frontend and backend via `@lifeos/shared` |
| pgvector on PostgreSQL | Single database for relational + vector data, avoids a separate vector DB |
| pnpm workspaces | Fast, disk-efficient, strict dependency resolution |
| JWT (Phase 0) | Stateless, simple to implement. Redis sessions planned for Phase 1 |
