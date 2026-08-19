# Atrium AI Log

## Project

Atrium is a PERN studio management and booking application.

- Frontend: Vite + React + Lucide React
- Backend: Express + Node.js
- Database: Neon PostgreSQL
- ORM: Prisma 6
- Authentication: JWT + bcrypt

## Current implementation

- Login and signup flows
- Actor roles: `CUSTOMER`, `VENUE_STAFF`, `VENUE_ADMIN`, `PLATFORM_ADMIN`
- JWT-protected API routes
- Venue CRUD
- Room CRUD
- Equipment CRUD
- User CRUD
- Booking create, read, update, and cancel operations
- Explicit booking lifecycle: `DRAFT`, `HELD`, `PENDING_PAYMENT`, `CONFIRMED`, `EXPIRED`, `FAILED`, `CANCELLED`, `COMPLETED`, `REFUNDED`
- Serializable room and equipment interval checks with hold expiry
- Idempotent payment submission/webhooks and reconciliation reporting
- Booking line items for equipment
- Automatic booking total calculation from room and equipment hourly rates
- Read-only payments endpoints and view
- Read-only audit event endpoints and view
- Responsive React dashboard and CRUD modal forms
- Role-based write permissions in the API

## Important files

- `client/src/App.jsx` - React application, auth, dashboard, CRUD views, booking form
- `client/src/style.css` - Main visual theme
- `client/src/forms.css` - CRUD and booking form styles
- `server/src/index.js` - Express API, auth, CRUD routes, booking calculations
- `server/prisma/schema.prisma` - Current database schema
- `server/.env` - Local Neon credentials; never commit or print this file
- `server/.env.example` - Environment variable template

## Database state

The Neon database was initially created with an older Prisma schema. The current schema uses `firstName` and `lastName`, while the old database used `name`. The database tables were empty, so the current schema was applied with Prisma `db push` and accepted data-loss warnings for the obsolete enum values.

The current schema has been validated and Prisma Client has been regenerated.

## Neon connection note

The Neon hostname exposes both IPv4 and IPv6 addresses. On this Windows environment, Prisma intermittently selected an unreachable IPv6 route and returned `P1001`. The server scripts now force IPv4-first DNS resolution:

```json
"dev": "nodemon --exec \"node --dns-result-order=ipv4first\" src/index.js",
"start": "node --dns-result-order=ipv4first src/index.js"
```

The active `DATABASE_URL` in `server/.env` uses the direct, non-pooled Neon host. Do not expose the password from this file.

## Run the project

Backend terminal:

```powershell
cd D:\Atrium\server
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
npm run dev
```

Frontend terminal:

```powershell
cd D:\Atrium\client
npm run dev
```

Open `http://localhost:5173`.

The API health check is available at `http://localhost:4000/api/health`.

## Validation commands

```powershell
cd D:\Atrium\client
npm run build

cd D:\Atrium\server
npx prisma validate
npx prisma generate
node --check src/index.js
```

Do not run `prisma migrate dev` or `prisma db push` repeatedly against the live database unless the schema intentionally changes. The current Neon database is already synchronized.

## Known notes

- `Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue` may return exit code 1 when the variable is not set; that is harmless.
- The repository has npm audit warnings from installed dependencies. They are separate from the application implementation and should be reviewed before production deployment.
- Payments are basic read-only records; no payment gateway or webhook integration is implemented.
- Audit events are read-only; advanced state-transition auditing is not implemented.

## Review and Delegation Ledger

This section is intentionally maintained as an honest review record. The goal is to document whether the implementation was actively reviewed rather than treating generated output as correct by default.

### Delegated work

- No autonomous coding subagent was delegated implementation ownership.
- Tooling was used for workspace inspection, package scaffolding, file edits, builds, Prisma validation, database checks, and runtime health checks.
- The implementation decisions, corrections, and validation interpretation remained under direct review.

### Mistakes found and overridden

1. The initial Vite scaffold entered an interactive selector and produced a TypeScript starter instead of the intended React JSX starter. The starter was replaced with the actual React entrypoint and app.
2. The first large patch used incorrect starter-file context and was rejected. It was split into smaller, targeted edits.
3. The first Prisma schema draft used compact one-line blocks and enums that Prisma rejected. The schema was rewritten using standard multiline syntax.
4. Prisma 7 was installed transiently by `latest`, but the project relied on the Prisma 6 `DATABASE_URL` workflow. Prisma and `@prisma/client` were pinned to 6.19.3.
5. The first generated API version contained missing closing parentheses in several compact Express route declarations. Node syntax checks caught this; the routes were rewritten as explicit blocks.
6. The database had an older applied migration with `User.name`, old role values, and old booking columns, while the application expected `firstName`, `lastName`, and the newer schema. Prisma reported the database as migration-current even though it was application-schema stale. The live database was inspected, confirmed empty, and synchronized with the current schema.
7. Prisma Client was initially stale and still expected `User.name`. A running Node process locked the Windows query-engine DLL and blocked regeneration. The process was stopped, Prisma Client was regenerated, and the API was restarted.
8. The shell had a stale `DATABASE_URL` override pointing at Neon’s pooled host even after `.env` was corrected. The process-level variable was cleared and the `.env` value was rechecked.
9. Neon exposed multiple IPv6 and IPv4 addresses. Prisma intermittently selected an unreachable IPv6 route and returned `P1001`, while TCP checks could still pass on another address. Server scripts were changed to use `--dns-result-order=ipv4first`, and schema synchronization then completed.
10. `prisma db push` initially returned an interactive data-loss warning and then a connection-close error. Because all application tables were empty, the schema push was retried with `--accept-data-loss`; the schema synchronized successfully, while Prisma’s automatic client regeneration was handled separately after releasing the file lock.
11. The first version of the cross-venue negative test seeded Neon directly, which made the authorization test fail for infrastructure reasons when Neon’s IPv6 route was unavailable. It was overridden with an HTTP-level test using an injected isolated Prisma stub, preserving the real Express auth/scope path without coupling the security assertion to database uptime.
12. The first role-scoping helper applied `{ venueId: req.user.venueId }` to every non-platform actor. Customers and unassigned staff/admin accounts can legitimately have no `venueId`, so Prisma rejected list queries with `Argument venueId must not be null`. The helper was overridden to let customers browse public venue resources and to use an impossible sentinel ID for unassigned venue-scoped actors.

### Overrides and final decisions

- Replaced demo-only login behavior with real signup/login requests and JWT persistence.
- Replaced empty management views with API-backed CRUD tables and forms.
- Kept payments and audit events read-only, matching the stated basic scope.
- Kept booking cancellation as a simple status update rather than implementing the excluded state machine and concurrency controls.
- Used the direct Neon endpoint for database setup and IPv4-first startup behavior for this Windows environment.

### Remaining review risks

- No automated API integration test suite has been added yet.
- Booking overlap prevention and equipment availability enforcement are intentionally absent from this basic milestone.
- The database connection depends on the current Neon project being active and the local `.env` credentials remaining valid.
- The lifecycle schema changes require a database migration or an intentional `npx prisma db push --accept-data-loss` before the new booking/payment routes can run against an older database.

## Lifecycle and Invariant Update

Added `server/src/bookingService.js` as the owning abstraction for booking correctness.

- `POST /api/bookings` creates a `HELD` booking with an 8-minute hold TTL and a 10-minute checkout window.
- `PATCH /api/bookings/:id/transition` enforces the legal transition graph and writes one `AuditEvent` per transition.
- Room overlaps include a 15-minute turnaround buffer.
- Equipment reservations are summed across overlapping active bookings and rejected when they exceed `totalUnits`.
- Booking times require 30-minute increments, 1-8 hour duration, a 1-hour to 90-day advance window, and venue operating hours.
- `POST /api/bookings/:id/payment` requires an idempotency key and moves a hold to `PENDING_PAYMENT`.
- `POST /api/payments/webhook` deduplicates by idempotency key/webhook event, captures at most once, and marks late captures as `REFUNDED` while expiring the booking.
- `GET /api/reports/reconciliation` is restricted to platform admins and reports captured charges without confirmed bookings and confirmed bookings without captured charges.

The current automated test suite still focuses on authorization. Invariant-specific concurrent database tests remain a follow-up requirement.

## Role and Authorization Update

The dashboard and API were updated against the domain role matrix:

- `CUSTOMER` sees Overview, Bookings, Venues, and Rooms; booking queries are limited to the authenticated customer, and cancellation/update access is limited to their own bookings.
- `VENUE_STAFF` sees Overview and Bookings only; booking reads/writes are scoped to `venueId`, and staff cannot change room/equipment pricing or venue policy.
- `VENUE_ADMIN` sees Overview, Bookings, Rooms, Equipment, Users, and Venues; all records are scoped to the assigned venue. Venue admins can edit their venue but cannot create/delete venues.
- `PLATFORM_ADMIN` sees all workspace resources plus read-only Payments and Audit log sections, with cross-venue access.

Frontend visibility is backed by server authorization. Direct IDs are checked server-side before returning records, so guessing a valid record ID from another venue does not bypass scope.

### Required negative test

Added `server/test/authorization.test.js`. It starts the real Express routes with isolated Venue A and Venue B records, signs a Venue A admin JWT, requests valid Venue B booking and room IDs, and asserts:

- response is `403` or `404`
- response body does not contain the Venue B booking reference or room name

Run it with:

```powershell
cd D:\Atrium\server
npm test
```

The test is intentionally isolated from Neon so authorization cannot appear to pass or fail because of database availability. The current schema uses integer surrogate IDs rather than UUIDs; the test uses valid Venue B integer IDs from that schema.
