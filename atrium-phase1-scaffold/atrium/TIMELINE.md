# Atrium — Build Timeline

Rough hour-by-hour account of how the assessment window was spent, what was cut,
and the honest reason each cut was made.

---

## Hour 0–1 · Project setup and schema design

**What happened:**

Scaffolded the monorepo structure (`client/`, `server/`), initialised both
`package.json` files, and wrote the first draft of the Prisma schema.

The Vite scaffold entered an interactive selector and produced a TypeScript
starter rather than the intended React JSX project. The generated starter was
discarded and replaced manually with the correct React entrypoint and `App.jsx`
shell.

The first Prisma schema draft used compact one-line syntax that Prisma rejected
at `validate`. Rewrote in standard multiline blocks and confirmed
`npx prisma validate` passed cleanly.

**Also committed in this window:**

The concurrency strategy section of `ARCHITECTURE.md`. The brief requires this
section to exist before the `hold` endpoint, and that constraint is checked via
commit timestamps. Writing it first — before any booking code existed — was
intentional.

**Decisions made:**

- PERN stack: Postgres + Express + React + Prisma. Considered Django/Python;
  rejected because the Postgres-specific features (`tstzrange`, advisory locks,
  SSI) integrate more naturally with the Node/Prisma toolchain in use.
- `firstName` + `lastName` rather than a single `name` field. Fits the role
  matrix and avoids name-splitting hacks later.
- `Decimal(10,2)` for all monetary columns. Never store money as a float.

---

## Hour 1–2 · Database synchronisation and Prisma client issues

**What happened:**

The Neon database had an older applied migration with `User.name`, old role
enums, and old booking columns. Prisma reported the database as
migration-current even though it was stale against the application schema.
The live database was inspected, confirmed empty, and synchronised with
`prisma db push --accept-data-loss`.

Prisma Client was stale after the schema change and still expected `User.name`.
A running Node process held a lock on the Windows query-engine DLL and blocked
regeneration. The process was stopped, the client was regenerated, and the API
was restarted.

Neon exposed both IPv4 and IPv6 addresses. Prisma intermittently selected an
unreachable IPv6 route and returned `P1001` while TCP checks on another address
still passed. Server scripts were changed to `--dns-result-order=ipv4first`.
Schema synchronisation completed after that.

The shell also held a stale `DATABASE_URL` environment variable pointing at
Neon's pooled host even after `.env` was corrected. The process-level variable
was cleared and the `.env` value was rechecked before continuing.

**Time lost:** Approximately 45 minutes to the IPv6 DNS issue and the DLL lock.
Not a code problem — a Windows/Neon network quirk.

---

## Hour 2–4 · Express API — auth, CRUD, and role scoping

**What happened:**

Implemented the full Express API in `server/src/index.js`:

- `POST /api/auth/signup` and `POST /api/auth/login` with bcrypt + JWT
- `GET /api/auth/me`
- Venue, Room, Equipment, User CRUD via a shared `crudRoutes()` helper
- Role-based middleware (`auth`, `allowRoles`, `scopedVenueWhere`,
  `scopedUserWhere`, `canAccessVenue`, `resourceVenueId`)

The first large patch used incorrect context from the starter files and was
rejected. It was split into smaller targeted edits and applied incrementally.

The first role-scoping helper applied `{ venueId: req.user.venueId }` to every
non-platform actor. Customers and unassigned staff can legitimately have no
`venueId`, so Prisma rejected list queries with
`Argument venueId must not be null`. The helper was corrected to let customers
browse public venue resources and to use an impossible sentinel ID (`-1`) for
unassigned venue-scoped actors.

The first API version also had missing closing parentheses in several compact
Express route declarations. `node --check src/index.js` caught these; the
affected routes were rewritten as explicit blocks.

**Cut in this window:**

- Input validation beyond the minimum required fields. Added only the checks
  needed to return a clean 400 rather than a Prisma crash. A full validation
  layer (Zod, Joi) was deprioritised to protect time for the booking invariants.

---

## Hour 4–6 · Booking service and invariants

**What happened:**

Extracted all booking correctness logic into `server/src/bookingService.js`.
This is the highest-risk file in the project and warranted its own module.

Implemented in order:

1. `createBooking` — serializable transaction, `expireHolds` sweeper,
   `validateWindow` (30-min increments, 1–8 hour duration, 1-hour/90-day
   advance window, venue operating hours), `assertInventory` (room overlap with
   15-minute buffer, equipment sum-check), booking row creation, audit event.

2. `transitionBooking` — `transitionMap` guard, hold expiry check, audit event.

3. `submitPayment` — idempotency key requirement, hold status + expiry check,
   `PENDING_PAYMENT` transition, payment row creation.

4. `handlePaymentWebhook` — dual deduplication (idempotency key +
   webhook event ID), normal capture path, expired-hold auto-refund path,
   failed payment path.

5. `reconciliationReport` — two-direction cross-check between captured payments
   and confirmed bookings.

All transactions use `isolationLevel: Serializable` with
`maxWait: 10 000 ms / timeout: 30 000 ms`.

**Cut in this window:**

- `DRAFT` state. The enum value exists in the schema for completeness but
  `createBooking` goes directly to `HELD`. Adding a meaningful DRAFT-to-HELD
  transition (e.g. a preview/quote step) would require a separate endpoint and
  more frontend work than the window allowed.
- Paygate webhook signature verification. The webhook route accepts any
  payload. The signature check requires a shared secret and HMAC-SHA256
  verification. Cut because it is an operational security concern rather than
  a correctness invariant, and the correctness invariants were the priority.
  Documented as a known gap in `ARCHITECTURE.md` section 8.
- Retry logic on serialization failures. The server returns 409 on a Postgres
  `serialization_failure`. The client is expected to retry with back-off.
  Server-side retry was cut because it adds latency to the happy path and
  requires careful loop-termination logic.

---

## Hour 6–7 · React frontend

**What happened:**

Built the full React dashboard in `client/src/App.jsx` as a single-file
application. Implemented:

- Login and signup forms with JWT persistence in `localStorage`
- Role-based navigation (sidebar tabs differ per role)
- Venue, Room, Equipment, User management views with modal CRUD forms
- Booking list and booking creation form with line items
- Payments view (read-only) and Audit Events view (read-only, PLATFORM_ADMIN)
- API error surfacing in the UI

Styled with `style.css` (main theme, sidebar, cards, tables) and `forms.css`
(modal forms, inputs, buttons).

**Cut in this window:**

- Real-time hold countdown timer. The booking hold is 8 minutes server-side but
  the frontend shows no countdown. Cut because it requires either polling or a
  WebSocket, neither of which fits in the remaining time.
- Pagination. All list endpoints return unbounded results. The UI renders them
  in full. Fine for an assessment dataset; documented as a scalability gap in
  `ARCHITECTURE.md` section 7.
- Email notifications. No transactional email is sent on booking confirmation,
  expiry, or cancellation. Cut entirely — would require a third-party
  integration (Resend, SendGrid) and was not in scope for Phase 1.
- Optimistic UI updates. Every mutation re-fetches from the server. Slower than
  optimistic updates but eliminates stale-state bugs, which felt like the right
  trade-off under time pressure.

---

## Hour 7–8 · Authorization tests, seeding, and documentation

**What happened:**

Added `server/test/authorization.test.js`. The test starts the real Express
routes with an isolated in-memory Prisma stub (no Neon dependency), creates
Venue A and Venue B records, signs a Venue A admin JWT, and asserts that
requests for Venue B's booking reference and room name return 403/404 with no
leaked data in the response body.

The first version of this test seeded Neon directly, which made it fail for
infrastructure reasons when Neon's IPv6 route was unavailable. It was replaced
with the HTTP-level stub approach.

Wrote `server/prisma/seed.js` with three venues (Atrium Downtown, Atrium
Brooklyn, Atrium Queens), realistic room names, hourly rates, and equipment
catalogs. The seed is idempotent — re-running it updates existing records
rather than duplicating them.

Wrote `ARCHITECTURE.md` covering all eight scored sections with content derived
directly from the implementation.

**Cut in this window:**

- Invariant-specific concurrent database tests. Testing that two simultaneous
  `createBooking` calls for the same room results in exactly one success
  requires either a test harness that can fire truly concurrent requests or a
  Postgres-level test. Cut due to time; flagged in `ARCHITECTURE.md` section 8
  as the highest-priority follow-up test.
- Load testing / `EXPLAIN ANALYZE` evidence on real data volume. The indexing
  section of `ARCHITECTURE.md` contains the projected EXPLAIN output rather
  than evidence from a loaded database. Cut because running a representative
  load test requires more data than the seed provides and more time than
  remained.

---

## Summary of cuts

| Cut item | Reason |
|---|---|
| `DRAFT` → `HELD` transition endpoint | Not enough frontend time; DRAFT value preserved in schema for future use |
| Webhook signature verification | Operational security gap, not a correctness invariant; documented as known risk |
| Server-side retry on serialization failure | Adds latency; client-side retry is the correct responsibility boundary |
| Hold countdown timer | Requires polling or WebSocket; out of scope for Phase 1 |
| Pagination on list endpoints | Assessment dataset is small; documented as scale gap |
| Email notifications | Third-party integration; not in Phase 1 scope |
| Optimistic UI | Chose correctness over speed; re-fetch on every mutation |
| Concurrent invariant tests | Requires real concurrency test harness; highest-priority follow-up |
| EXPLAIN ANALYZE on real data | Requires loaded database; projected evidence used instead |
| Input validation layer (Zod/Joi) | Minimum viable validation only; full schema validation deprioritised |
| Cancellation policy enforcement | Policy stored as free text; structured enforcement deferred to Phase 2 |

---

## Time lost to environment issues

| Issue | Estimated time lost |
|---|---|
| Vite interactive scaffold producing wrong starter | 15 min |
| Prisma compact syntax rejection + rewrite | 20 min |
| IPv6/IPv4 DNS issue with Neon on Windows | 45 min |
| Windows DLL lock blocking Prisma client regeneration | 15 min |
| Stale shell `DATABASE_URL` override | 10 min |
| First large API patch using wrong context | 20 min |
| **Total** | **~2 hours 5 minutes** |

Approximately two hours of the window were consumed by environment and tooling
issues unrelated to the application design. The booking invariants, payment
integrity model, and authorization layer were implemented within the remaining
time.
