# Atrium

A foundational PERN studio management and booking application.

## Structure

- `client` - Vite + React dashboard with responsive login and workspace views.
- `server` - Express REST API, JWT authentication, and Prisma data access.
- `server/prisma/schema.prisma` - Venue, room, equipment, user, booking, payment, and audit models.

## Run locally

1. Copy `server/.env.example` to `server/.env` and replace the Neon `DATABASE_URL` and `JWT_SECRET` values.
2. Run `npm install` in both `client` and `server`.
3. From `server`, run `npx prisma migrate dev --name init` and then `npm run dev`.
4. From `client`, run `npm run dev`.

The demo UI login accepts any email and password so the frontend can be reviewed before a database is connected. The API login is available at `POST /api/auth/login` once a user exists.

## API

CRUD routes are available under `/api/users`, `/api/venues`, `/api/rooms`, `/api/equipment`, and `/api/bookings`. Payments and audit events are read-only at `/api/payments` and `/api/audit-events`.
