# LifeOS Architecture Principles

LifeOS is built with strict privacy-first local AI execution and clear module boundaries.

## Module Boundaries and Isolation

Each domain module in LifeOS maintains strict encapsulation:
- Tasks, Projects, Notes, Activity, Memory, and Documents have independent repositories and service layers.
- Cross-module operations must go through service boundaries, never direct cross-table SQL joins across modules.
- Strict multi-tenant isolation ensures any attempt to access or mutate resources belonging to another user responds with 404 Not Found, never revealing resource existence.

## Hybrid Search and Dense Retrieval

LifeOS uses a reciprocal rank fusion formula with k=60 to merge full-text search rankings with pgvector cosine distance rankings.
Embeddings are generated via Ollama running the nomic-embed-text model with 768 dimensions and 8192 native context window.

## Explicit Memory Bank

The memory bank records explicit facts, decisions, preferences, and goals.
When an existing active memory has high semantic similarity (cosine similarity >= 0.90) with a newly recorded memory, the system supersedes the old memory rather than deleting it.
This ensures complete provenance tracking and auditability.
