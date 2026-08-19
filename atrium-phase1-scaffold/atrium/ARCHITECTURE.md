# Architecture

Status: draft skeleton, Phase 1. Sections below track brief section 10
("ARCHITECTURE.md must contain") exactly, in order.

## 1. Entity Relationship Diagram

TODO — after Prisma schema (Phase 2).

## 2. Booking State Machine Diagram

States: `DRAFT, HELD, PENDING_PAYMENT, CONFIRMED, COMPLETED, EXPIRED, FAILED,
CANCELLED, REFUNDED`. See `backend/src/modules/booking/BookingStateMachine.ts`
for the current transition table stub. Diagram TODO.

## 3. Concurrency Strategy

**This section must be committed within the first 4 hours, before the `hold`
endpoint exists in the repo — this is checked via commit timestamps.**

- Mechanism for **rooms**: Postgres EXCLUDE constraint over a `tstzrange`
  (requires the `btree_gist` extension). Each room has reservation rows with a
  `tstzrange` column and an `EXCLUDE USING gist (room_id WITH =, range WITH &&)`
  constraint. The DB enforces non-overlap atomically: concurrent inserts that
  would overlap the same `room_id` are serialized by Postgres/GiST and one
  transaction will fail cleanly. The application will create the reservation
  inside a transaction and retry on conflict with backoff. This holds across
  3 API processes and ~200 concurrent requests because the correctness
  invariant is enforced at the single source of truth (the database), not in
  process memory.

- Mechanism for **equipment** (interval-based quantities): per-equipment
  mutual exclusion via Postgres advisory locks plus an overlap-sum check.
  Reservation rows are kept as `tstzrange` + `quantity`. To create a new
  reservation the app takes `pg_advisory_xact_lock(equipment_id)` inside the
  transaction, computes `SELECT COALESCE(SUM(quantity),0) FROM reservations
  WHERE equipment_id = $1 AND range && $new_range`, and ensures
  `existing_sum + requested_qty <= capacity`. Holding the advisory lock for
  the duration of the check+insert serializes concurrent attempts for the
  same equipment id while keeping contention scoped per-equipment. If needed
  we can instead use a small `capacities` row and `SELECT ... FOR UPDATE` on
  that row to achieve the same serialized check-and-update.

- Cross-instance guarantees: no in-process mutex (semaphores, maps) is
  sufficient when multiple API instances exist. All invariants rely on Postgres
  as the authoritative coordinator (EXCLUDE constraints, advisory locks,
  transactional checks). Application-level retries and sensible timeouts are
  required for liveness under contention.

Notes: this is an intentionally small, testable first draft of the
concurrency strategy. If the implementation later proves a mechanism
insufficient (e.g. EXCLUDE performance issues under load), the repo will
retain this first-draft commit and append a rationale explaining what changed
and why.

Stack choice
--
I will implement Phase 1 using a PERN stack: Postgres, Express (Node + TypeScript),
React, and a Prisma ORM on the backend. Rationale: tight Postgres feature parity
(needed for `tstzrange`, `EXCLUDE` constraints and advisory locks), excellent
TypeScript ecosystem tooling across backend and frontend, and Prisma simplifies
the data layer without hiding the ability to drop into raw SQL for the DB-level
invariants we require. Alternative considered: Django + Python. I rejected it
because Prisma/Postgres combo gives faster iteration for raw SQL + JS-based
tooling and integrates cleanly with the existing TypeScript codebase in this
repo. The trade-off is a slightly heavier runtime surface for transaction
management compared to Django ORM, but the team familiarity and consistency
across frontend/backend wins here.

## 4. Payment Integrity Model

TODO (Phase 6) — how exactly-once effect is achieved over Paygate's
at-least-once, out-of-order, occasionally-unsigned channel. Must cover
INV-3, INV-4, INV-5.

## 5. Indexing and Query Strategy

TODO (Phase 8, after LOAD_TEST.md) — with `EXPLAIN ANALYZE` evidence,
before/after indexing, for the cross-venue availability search.

## 6. Assumptions

TODO — every ambiguity resolved unilaterally goes here.

## 7. What Breaks at 100x

TODO — first three things that fall over at 25M bookings, and the fix for
each.

## 8. What I'd Do With Two More Weeks

TODO — priority order.
