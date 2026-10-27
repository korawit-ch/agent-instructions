---
name: analyze-repo
description: Top-down analysis of a whole repository - architecture, data model, critical flows, risks. Use when asked to learn, map, onboard onto, or audit an entire codebase, or to write an architecture guide.
---

# Repository analysis

Work top-down. Don't walk through files one by one. Skip generated code and repetitive
boilerplate unless it affects behavior. For a large repo, fan out read-only subagents per area
and merge their results.

1. System overview: apps/services, runtime boundaries, entry points, frontend/backend split,
   datastores, caches, queues, storage, external services, auth, deploy/runtime infra.
2. Module map: important modules only, with their responsibility, dependencies, consumers, and
   key files.
3. Data model: core entities, relationships, ownership, constraints and unique keys/indexes,
   lifecycle, transaction boundaries, important invariants.
4. Critical flows: pick the 3–6 most important behaviors (e.g. auth, registration, permissions,
   primary mutations, payments, uploads, sync, background jobs, notifications) and trace each
   end to end through real files/functions.
5. State and side effects: for major mutations, what happens on success, on failure, on retry,
   and when run twice.
6. Risks: auth/permission gaps, validation, transactions, concurrency, idempotency, cache
   consistency, external failure handling, sensitive data, destructive ops, N+1/perf hotspots.
   Use the risk-review severity labels (BLOCKER / IMPORTANT / SUGGESTION / NIT).

## Rules

- Mark unverified claims (INFERRED).
- Say "can't determine from the repo" instead of guessing.
- Point out where docs disagree with the code.

## Output

A document following sections 1–6, plus "Known architectural risks" and "Where to change common
things" (feature X → files). If the user wants it saved, write or update the repo's architecture
guide (e.g. docs/ARCHITECTURE.md) with the same structure. That guide documents why and how the
system works, not a file catalogue.
