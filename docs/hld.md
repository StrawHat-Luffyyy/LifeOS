# LifeOS — High-Level Design (HLD)

## 1. System Architecture & Layers

LifeOS is a modular monolith designed for personal knowledge management and AI-assisted productivity. The system is split across clear operational layers:

```
┌─────────────────────────────────────────────────────────────┐
│                 Client Layer (Next.js 16)                   │
│   App Router · React Components · LocalStorage Auth Token    │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / REST / JSON
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 API Layer (Express.js 5)                    │
│   Rate Limiting · JWT Auth Middleware · Zod Validation      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Domain Services Layer                       │
│   Auth · Projects · Tasks · Notes · Activity · AI (Phase 2) │
└──────────────────────────────┬──────────────────────────────┘
                               │ Drizzle ORM / SQL
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Data & Infrastructure Layer                 │
│      PostgreSQL 17 (pgvector + FTS) · Redis 7 (BullMQ)      │
└─────────────────────────────────────────────────────────────┘
```

## 2. Module Boundaries & Dependency Rules

To prevent coupling and architectural drift:
- **Domain Modules are Peers:** `auth`, `projects`, `tasks`, `notes`, and `activity` reside on the same conceptual tier. No module repository directly accesses another domain module's tables.
- **Service-Level Inter-Module Calls:** Cross-entity validation (e.g. checking project ownership when assigning a task) occurs strictly via public service interfaces.
- **Event-Driven Activity Logging:** Mutations append immutable records to `activity_events` within the same database transaction.
- **Strict Data Scoping:** Every database query enforces tenant isolation (`userId = authenticatedUser.id`).

## 3. Auth Token Lifecycle

LifeOS uses a dual-token authentication model:
- **Access Token:** Short-lived JWT (15 minutes), verified statelessly by cryptographic signature.
- **Refresh Token:** Cryptographically secure 40-byte hex token (30 days TTL), hashed using SHA-256 and stored in the database (`refresh_tokens` table).
- **Rotation & Revocation:** Each refresh issues a new access/refresh pair while revoking the old token. Explicit logout instantly revokes the active refresh token.

## 4. AI & Retrieval Flow (Planned Phase 2+)

The forthcoming AI module will act as a unidirectional consumer of domain services:
- **Agents Reason, Services Execute:** LLMs orchestrate workflows using tool calling; deterministic services perform mutations.
- **Conditional RAG:** Search queries will combine PostgreSQL full-text search (`tsvector`/`tsquery`) with dense vector search (`pgvector`) before feeding filtered context into the model.
- **Human In The Loop:** High-impact state changes require user approval before execution.
