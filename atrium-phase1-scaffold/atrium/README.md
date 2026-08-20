# Atrium

A PERN studio booking platform built against the Adept Tech Solutions assessment brief.

**Stack:** Neon (PostgreSQL) · Express 5 / Node 22 · React 19 / Vite 6 · Prisma 6 · JWT

**Live deployment:**
- Frontend: https://project-atrium-studio-booking.netlify.app
- API: https://project-atrium-studio-booking-platform-production.up.railway.app/api/health

---

## What is built

### Auth and roles

- Signup and login with bcrypt-hashed passwords and 7-day JWTs
- Four roles: `CUSTOMER`, `VENUE_STAFF`, `VENUE_ADMIN`, `PLATFORM_ADMIN`
- Every route enforces role and venue scope server-side — guessing a foreign ID returns 403/404, never data

### Domain model

Full Prisma schema: `Venue`, `Room`, `EquipmentType`, `User`, `Booking`, `BookingLineItem`, `Payment`, `AuditEvent`

### Booking lifecycle

Explicit state machine: `HELD → PENDING_PAYMENT → CONFIRMED / FAILED / EXPIRED / CANCELLED → REFUNDED`

Rules enforced on every `createBooking`:
- 30-minute increments, 1–8 hour duration (per-room min/max respected)
- 1-hour minimum and 90-day maximum advance window
- 15-minute turn-around buffer between room bookings
- Venue operating hours checked against a schedule string
- Room overlap and equipment capacity checked inside a `Serializable` transaction

### Concurrency

Room and equipment conflicts are prevented by a Postgres `Serializable` transaction with an overlap query. Under three concurrent instances, Postgres SSI aborts conflicting transactions (`P2034` → 409). Verified by the concurrency test below.

### Payment integrity

- `POST /api/bookings/:id/payment` — idempotency-key gated, moves booking to `PENDING_PAYMENT`
- `POST /api/payments/webhook` — deduplicates on both `idempotencyKey` and `webhookEventId`; auto-refunds a capture that arrives after hold expiry
- `GET /api/reports/reconciliation` — cross-checks captured payments against confirmed bookings (PLATFORM_ADMIN only)

### Audit trail

Every booking state transition writes an `AuditEvent` row. Rows are never updated or deleted.

### Frontend

React dashboard with role-aware sidebar, CRUD views for all entities, booking creation form with equipment line items, read-only payments and audit log views for platform admins.

---

## What is not built

| Item | Status |
|---|---|
| Paygate mock provider | Not implemented — `handlePaymentWebhook` handles the shape of the problem but has never been exercised against a chaotic provider |
| Webhook signature verification | Not implemented — `X-Paygate-Signature` check is the first security item in the two-more-weeks list |
| Cancellation policy enforcement | Not implemented — `DELETE /api/bookings/:id` transitions to `CANCELLED` with no tiered refund calculation |
| Hold countdown timer in UI | Not implemented — hold expires server-side after 8 minutes; no client-side indicator |
| Cross-venue availability search | Not implemented — frontend has CRUD tables, not a search/filter view |
| Pagination on list endpoints | Not implemented — all lists return unbounded results |
| Load test / EXPLAIN evidence | Not implemented — `ARCHITECTURE.md` section 5 contains projected EXPLAIN output, not evidence from a loaded database |
| CI pipeline | Not implemented — no `.github/workflows` |
| Email notifications | Not implemented |
| Tier 3 features | Not implemented — no heatmap, natural-language search, recurring bookings, or waitlist |

---

## Repository layout

```
atrium/
├── client/                  Vite + React frontend
│   ├── src/App.jsx           Entire React application (single file)
│   ├── src/style.css
│   └── src/forms.css
├── server/
│   ├── src/index.js          Express API, auth, CRUD routes
│   ├── src/bookingService.js Booking invariants, payment, reconciliation
│   ├── prisma/schema.prisma  Data model
│   ├── prisma/seed.js        3 venues, rooms, equipment (idempotent)
│   └── test/
│       ├── authorization.test.js   Cross-venue isolation negative test
│       └── concurrency.test.js     200-request / 3-replica concurrency proof
├── ARCHITECTURE.md           ERD, state machine, concurrency, payment integrity,
│                             indexing, assumptions, 100x analysis, two-more-weeks,
│                             concurrency test output
├── DECISIONS.md              15 design decisions with alternatives and trade-offs
├── TIMELINE.md               Hour-by-hour build log, cuts, and environment issues
├── DEPLOY.md                 Railway + Netlify + Neon deployment guide
└── AI_LOG.md                 Delegation ledger and mistake record
```

---

## Run locally

```powershell
# 1. Copy and fill the env file
Copy-Item server\.env.example server\.env
# Edit server\.env — set DATABASE_URL (Neon connection string) and JWT_SECRET

# 2. Install dependencies
cd server ; npm install ; cd ..
cd client ; npm install ; cd ..

# 3. Apply the schema and start the API
cd server
npx prisma migrate deploy   # or: npx prisma db push
npm run dev                 # Express on http://localhost:4000

# 4. Start the frontend (separate terminal)
cd client
npm run dev                 # Vite on http://localhost:5173
                            # /api requests proxy to localhost:4000
```

### Seed the database

```powershell
cd server
npm run seed
```

Seeds 3 venues (Atrium Downtown, Atrium Brooklyn, Atrium Queens) with rooms, equipment, and hourly rates. The seed is idempotent — safe to re-run.

---

## Tests

### Authorization test — cross-venue isolation

Proves a `VENUE_ADMIN` from Venue A receives 403/404 (never Venue B data) when
requesting valid Venue B resource IDs directly. Runs against an in-memory Prisma
stub — no live database required.

```powershell
cd server
npm test
```

### Concurrency test — 3-replica proof

Spins up **3 independent Express + Prisma instances** (each with its own 30-connection
pool, simulating 3 API replicas behind a load balancer), then fires **200 simultaneous
`POST /api/bookings` requests** round-robin across them, all targeting the same room,
slot, and equipment type (3 total units).

Asserts:
- Exactly **1** booking succeeds (HTTP 201)
- At most **3** equipment units reserved in the database
- Every other request returns **409** (serialization conflict) or **503** (pool overload) — no 5xx, no duplicate successes, no data corruption

Requires a live `DATABASE_URL` in `server/.env`.

```powershell
cd server
npm run test:concurrency
```

Passing output:
```
201 successes : 1
409 conflicts : 29
503 overloaded: 170
other         : 0
Active room bookings : 1  ✓
Equipment units held : 1  ✓
pass 1 / fail 0
```

Full output, analysis, and environment details in `ARCHITECTURE.md` section 9.

### Run both tests

```powershell
cd server
npm run test:all
```

---

## API reference

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | — | Create account |
| POST | `/api/auth/login` | — | Get JWT |
| GET | `/api/auth/me` | JWT | Current user |
| GET/POST | `/api/venues` | JWT | List / create venues |
| GET/PUT/DELETE | `/api/venues/:id` | JWT | Read / update / delete venue |
| GET/POST | `/api/rooms` | JWT | List / create rooms |
| GET/PUT/DELETE | `/api/rooms/:id` | JWT | Read / update / delete room |
| GET/POST | `/api/equipment` | JWT | List / create equipment types |
| GET/PUT/DELETE | `/api/equipment/:id` | JWT | Read / update / delete equipment |
| GET/POST | `/api/users` | JWT | List / create users |
| GET/PUT/DELETE | `/api/users/:id` | JWT | Read / update / delete user |
| GET/POST | `/api/bookings` | JWT | List / create bookings |
| GET | `/api/bookings/:id` | JWT | Read booking |
| PATCH | `/api/bookings/:id/transition` | JWT | Advance booking state |
| POST | `/api/bookings/:id/payment` | JWT | Submit payment (idempotency key required) |
| DELETE | `/api/bookings/:id` | JWT | Cancel booking |
| POST | `/api/payments/webhook` | — | Paygate webhook receiver |
| GET | `/api/payments` | JWT | List payments |
| GET | `/api/audit-events` | JWT | List audit events |
| GET | `/api/reports/reconciliation` | PLATFORM_ADMIN | Payment/booking cross-check |
| GET | `/api/health` | — | `{ ok: true }` |

---

## Deployment

Deployed on Railway (API) + Netlify (frontend) + Neon (database). See `DEPLOY.md` for the full setup guide including environment variables, build commands, and the CLIENT_URL / VITE_API_URL wiring.

Railway environment variables required: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`, `CLIENT_URL`

Netlify environment variable required: `VITE_API_URL`
