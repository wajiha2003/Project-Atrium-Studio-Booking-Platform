# Atrium — Decisions

8–15 decisions, each three lines: the choice made, the alternative rejected, and the trade-off accepted.

---

**1. Serializable transaction for concurrency instead of EXCLUDE constraint**
Chose Postgres `Serializable` isolation with an overlap `SELECT` + `INSERT` inside `$transaction`. Rejected a `tstzrange` + `EXCLUDE USING gist` constraint, which would require enabling the `btree_gist` extension and a raw migration.
Trade-off: SSI aborts the losing transaction with `P2034` (requiring client retry) rather than failing cleanly at the constraint level, but the correctness guarantee is identical and the implementation stays within the Prisma abstraction.

---

**2. Single `bookingService.js` module for all booking invariants**
Isolated `createBooking`, `transitionBooking`, `submitPayment`, `handlePaymentWebhook`, and `reconciliationReport` into one file. Rejected spreading the logic across individual route handlers in `index.js`.
Trade-off: a larger single file, but every invariant is in one place and can be tested without spinning up Express.

---

**3. `HELD` directly on creation — `DRAFT` state skipped**
`createBooking` moves a booking straight to `HELD`. `DRAFT` exists in the enum but is never entered. Rejected a two-step flow (create DRAFT, then confirm to HELD) that would require a separate endpoint.
Trade-off: no preview/quote step for customers; gained a simpler API surface and one fewer state transition to test.

---

**4. Idempotency key on both `submitPayment` and webhook — two separate unique columns**
`Payment.idempotencyKey` covers the client submission; `Payment.webhookEventId` covers the Paygate delivery. Rejected a single shared key across both paths.
Trade-off: two unique indexes instead of one, but the two keys have independent lifecycles — the client key is chosen before the charge, the webhook event ID is assigned by Paygate after it.

---

**5. `expireHolds` sweeper runs inline inside `createBooking`**
Expired holds are cleaned up lazily on the next booking attempt. Rejected a separate cron job or `pg_cron` scheduled task.
Trade-off: expiry is only guaranteed when traffic is flowing; a room could appear unavailable for up to 8 minutes with no active requests. Acceptable for Phase 1; documented as the first fix at scale in `ARCHITECTURE.md`.

---

**6. JWT stored in `localStorage` on the frontend**
Token is persisted in `localStorage` and sent as a `Bearer` header. Rejected `httpOnly` cookie storage.
Trade-off: vulnerable to XSS token theft, but avoids CSRF complexity and works immediately across any deployment domain without cookie configuration. Acceptable for an assessment; would change for production.

---

**7. Decimal(10,2) for all monetary columns**
`hourlyRate`, `totalAmount`, and `amount` use Postgres `DECIMAL(10,2)` via Prisma's `@db.Decimal`. Rejected `FLOAT` or storing cents as `INTEGER`.
Trade-off: Prisma returns `Decimal` objects (not plain numbers), so the API serialises them correctly without rounding, but callers must handle `Decimal` arithmetic carefully.

---

**8. 15-minute turn-around buffer baked into the overlap check**
`assertInventory` extends the overlap window by 15 minutes on each side when checking room conflicts. Rejected a separate `bufferMinutes` column on `Room`.
Trade-off: buffer is not configurable per venue; all rooms get the same 15-minute gap. Simple and correct for Phase 1.

---

**9. Operating schedule stored as a free-text string**
`Venue.operatingSchedule` is a semicolon-delimited string (`Mon-Fri 08:00-22:00; Sat-Sun 09:00-20:00`), parsed in `scheduleAllows()`. Rejected a structured `VenueSchedule` table with day/open/close rows.
Trade-off: harder to query and validate, but requires no extra migration or join, and the parser is straightforward for the patterns actually used.

---

**10. Single shared `DATABASE_URL` across all Prisma instances in the concurrency test**
All three replica PrismaClients connect to the same Neon database, which is the correct model for a real horizontally-scaled deployment. Rejected using SQLite in-memory databases per instance.
Trade-off: the test requires a live Neon connection and will fail without a valid `DATABASE_URL`; in exchange, it tests the actual serialization behaviour rather than a stub.

---

**11. `P2034` → 409, `P2024`/`P2028` → 503 in the error handler**
Serialization failures return 409 (client should retry); connection pool exhaustion returns 503 (server busy). Rejected mapping all Prisma errors to 500.
Trade-off: clients must handle two distinct retry signals; in exchange, no concurrency rejection is ever misread as a server bug.

---

**12. Role-scoped queries use a sentinel ID (`-1`) for unassigned venue actors**
When a `VENUE_STAFF` or `VENUE_ADMIN` has no `venueId`, queries use `{ venueId: -1 }` (which matches nothing) rather than throwing or returning all records. Rejected returning an empty array from middleware before reaching the database.
Trade-off: a database round-trip is made even for an unassigned actor; in exchange, the scoping logic is uniform and the route handler code is unchanged.

---

**13. Booking reference generated from `Date.now()` suffix**
`reference` is `BK-` + the last 7 digits of the current Unix millisecond timestamp. Rejected a UUID or a sequential DB-generated reference.
Trade-off: not guaranteed unique under true simultaneity (two bookings in the same millisecond collide), but the `@unique` constraint on `reference` will catch it and the client receives a 409 rather than a silent duplicate. Acceptable for Phase 1 volume.

---

**14. Frontend is a single `App.jsx` file**
The entire React application — auth, routing, all views, all API calls — lives in one file. Rejected a component-per-file structure with React Router.
Trade-off: the file is large and hard to navigate, but there is no build-time routing configuration, no code-splitting decisions, and no import path maintenance. Correct for a time-boxed assessment; would restructure for a real product.

---

**15. `npm run test:concurrency` requires a live database — no mock**
The concurrency test creates real rows in Neon, fires real HTTP requests, and queries the database to verify invariants. Rejected mocking PrismaClient with an in-memory stub.
Trade-off: the test is slower (~27 seconds) and requires credentials; in exchange, it proves the actual Postgres serialization behaviour rather than simulating it, which is the point of the test.
