# LifeOS — Low-Level Design (LLD)

## 1. Database Schema & Relationships

LifeOS uses PostgreSQL 17 managed via Drizzle ORM. All primary keys are UUIDs (`gen_random_uuid()`).

```
  ┌─────────────────────────────────────────────────────────────┐
  │                           users                             │
  ├─────────────────────────────────────────────────────────────┤
  │ id (PK, uuid)                                               │
  │ email (varchar 255, unique, not null)                       │
  │ passwordHash (varchar 255, not null)                        │
  │ name (varchar 100, not null)                                │
  │ createdAt, updatedAt (timestamptz)                          │
  └──────────┬───────────────────────┬──────────────────────┬───┘
             │ 1                     │ 1                    │ 1
             │ N                     │ N                    │ N
             ▼                       ▼                      ▼
  ┌──────────────────────┐  ┌─────────────────────┐  ┌──────────────────────┐
  │    refresh_tokens    │  │      projects       │  │   activity_events    │
  ├──────────────────────┤  ├─────────────────────┤  ├──────────────────────┤
  │ id (PK, uuid)        │  │ id (PK, uuid)       │  │ id (PK, uuid)        │
  │ userId (FK → users)  │  │ userId (FK → users) │  │ userId (FK → users)  │
  │ tokenHash (unique)   │  │ name (varchar 200)  │  │ eventType (varchar)  │
  │ expiresAt (tz)       │  │ description (text)  │  │ entityType (varchar) │
  │ revokedAt (tz, null) │  │ status (varchar 20) │  │ entityId (uuid, null)│
  │ createdAt (tz)       │  │ deletedAt (tz, null)│  │ summary (varchar 500)│
  └──────────────────────┘  │ createdAt, updatedAt│  │ metadata (jsonb)     │
                            └──────────┬──────────┘  │ createdAt (tz)       │
                                       │ 1           └──────────────────────┘
                                       │ N
                   ┌───────────────────┴───────────────────┐
                   │                                       │
                   ▼                                       ▼
        ┌─────────────────────┐                 ┌─────────────────────┐
        │        tasks        │                 │        notes        │
        ├─────────────────────┤                 ├─────────────────────┤
        │ id (PK, uuid)       │                 │ id (PK, uuid)       │
        │ userId (FK → users) │                 │ userId (FK → users) │
        │ projectId (FK, null)│                 │ projectId (FK, null)│
        │ title (varchar 500) │                 │ title (varchar 500) │
        │ status (varchar 20) │                 │ content (text)      │
        │ priority (varchar)  │                 │ tags (text[])       │
        │ dueDate (tz, null)  │                 │ searchVector (tsvec)│
        │ deletedAt (tz, null)│                 │ deletedAt (tz, null)│
        │ createdAt, updatedAt│                 │ createdAt, updatedAt│
        └─────────────────────┘                 └─────────────────────┘
```

## 2. Table Specifications & Constraints

- **`users`**: Root tenant boundary. Email is case-insensitively indexed and unique.
- **`refresh_tokens`**: Stores SHA-256 digests (`tokenHash`) of issued refresh tokens. Revocation sets `revokedAt = now()`. Indexed on `tokenHash`.
- **`projects`**: Core organizing entity. Contains `status` (`'active' | 'archived'`). Soft-deleted via `deletedAt`.
- **`tasks`**: Work items optionally linked to a project (`projectId`). Indexed on `(userId, status)` and `(userId, projectId)`.
- **`notes`**: Free-form content with `tags: text[]` for tag queries. Uses PostgreSQL generated `tsvector` column (`searchVector`) over `title` and `content`, indexed with GIN for fast keyword search.
- **`activity_events`**: Immutable append-only event stream recording all lifecycle mutations. Foreign key references to entities are nullable to survive soft or hard deletions.

## 3. Key Design Decisions

| Decision | Context & Rationale |
|---|---|
| **Dual-Token Auth** | Replaces stateful session lookup on every request. 15-minute JWT provides zero-latency stateless verification; 30-day SHA-256 hashed refresh tokens enable immediate revocation. |
| **Session → `refresh_tokens`** | Resolves PRD open decision OD-4. The `refresh_tokens` table serves as the persistent session entity, tracking individual active device tokens. |
| **Soft Deletes vs Append-Only** | User-facing entities (`tasks`, `projects`, `notes`) support soft deletion (`deletedAt IS NOT NULL`) for recovery and referential integrity. `activity_events` are strictly append-only. |
| **PostgreSQL Full-Text Search** | Notes search leverages native Postgres `tsvector` and `tsquery` with GIN indexing, avoiding external search services while providing ranking via `ts_rank()`. |
| **Transactional Event Logging** | Mutation services write the primary entity change and the corresponding `activity_events` row inside a single Drizzle database transaction. |
