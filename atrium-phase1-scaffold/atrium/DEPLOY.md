# Atrium — Deployment Guide

Stack: Neon (PostgreSQL) · Render (Express/Node backend) · Vercel (React/Vite frontend)

---

## Prerequisites

- Your Neon `DATABASE_URL` connection string (from the Neon dashboard → your project → Connection string).
- Your repository pushed to GitHub.

---

## 1. Deploy the backend to Render

### 1a. Create a Web Service

1. Go to [https://render.com](https://render.com) and sign in (or create a free account).
2. Click **New → Web Service**.
3. Connect your GitHub account and select **Project-Atrium-Studio-Booking-Platform**.
4. Configure the service:

   | Field | Value |
   |---|---|
   | **Root Directory** | `atrium-phase1-scaffold/atrium/server` |
   | **Runtime** | Node |
   | **Build Command** | `npm install && npx prisma generate && npx prisma migrate deploy` |
   | **Start Command** | `npm start` |
   | **Instance Type** | Free |

5. Click **Create Web Service** — Render will attempt a first deploy, which will fail because the env vars are not set yet. That's fine.

### 1b. Set environment variables

In your new Render service, go to **Environment → Add Environment Variable** and add:

| Key | Value |
|---|---|
| `DATABASE_URL` | Your Neon connection string (e.g. `postgresql://user:pass@ep-xxx.neon.tech/atrium?sslmode=require`) |
| `JWT_SECRET` | A long random string (e.g. output of `openssl rand -hex 32`) |
| `NODE_ENV` | `production` |
| `CLIENT_URL` | Leave blank for now — you will fill this in after deploying the frontend |

> **Never commit** `DATABASE_URL` or `JWT_SECRET` to GitHub. Render injects them at runtime.

### 1c. Trigger a redeploy

Go to **Manual Deploy → Deploy latest commit**. Watch the logs — a successful deploy ends with:

```
Atrium API running on port 10000
```

### 1d. Verify the backend

Open `https://<your-service>.onrender.com/api/health` in your browser. You should see:

```json
{ "ok": true }
```

> **Free tier note:** Render free web services spin down after 15 minutes of inactivity. The first request after a cold start takes ~30–60 seconds. This is acceptable for an assessment deployment.

---

## 2. Deploy the frontend to Vercel

### 2a. Import the project

1. Go to [https://vercel.com](https://vercel.com) and sign in (or create a free Hobby account).
2. Click **Add New → Project**.
3. Import **Project-Atrium-Studio-Booking-Platform** from GitHub.
4. In the project configuration, set the **Root Directory**:

   ```
   atrium-phase1-scaffold/atrium/client
   ```

5. Vercel auto-detects Vite. Confirm the build settings:

   | Field | Value |
   |---|---|
   | **Framework Preset** | Vite |
   | **Build Command** | `npm run build` |
   | **Output Directory** | `dist` |

### 2b. Set environment variables

Before clicking **Deploy**, go to **Environment Variables** and add:

| Key | Value |
|---|---|
| `VITE_API_URL` | `https://<your-render-service>.onrender.com/api` |

> `VITE_*` variables are inlined into the client bundle at build time. Never put secrets (DATABASE_URL, JWT_SECRET) here.

6. Click **Deploy**. Vercel builds and deploys. You'll receive a URL like `https://atrium-xxx.vercel.app`.

---

## 3. Connect the two deployments

Now that both are live, go back to Render and set the remaining env var:

| Key | Value |
|---|---|
| `CLIENT_URL` | `https://atrium-xxx.vercel.app` (your actual Vercel URL) |

Trigger a **Manual Redeploy** on Render. This updates the CORS allowed-origin so the frontend can reach the backend.

---

## 4. Verify end-to-end

1. Open your Vercel URL.
2. Sign up for a new account (e.g. role: Platform admin).
3. Create a venue, add a room, then create a booking.
4. Check `https://<your-render-service>.onrender.com/api/health` still returns `{ "ok": true }`.

---

## Local development (unchanged)

```bash
# Terminal 1 — backend
cd atrium-phase1-scaffold/atrium/server
cp .env.example .env        # fill in DATABASE_URL and JWT_SECRET
npm install
npm run dev

# Terminal 2 — frontend
cd atrium-phase1-scaffold/atrium/client
npm install
npm run dev
# Vite proxies /api → http://localhost:4000, no VITE_API_URL needed locally
```

---

## Environment variable summary

### `server/.env` (local only, never committed)

```env
DATABASE_URL="postgresql://..."
JWT_SECRET="your-secret"
PORT=4000
CLIENT_URL="http://localhost:5173"
```

### Render dashboard environment

```
DATABASE_URL   = <neon connection string>
JWT_SECRET     = <random secret>
NODE_ENV       = production
CLIENT_URL     = https://<your-vercel-app>.vercel.app
```

### Vercel dashboard environment variables

```
VITE_API_URL = https://<your-render-service>.onrender.com/api
```
