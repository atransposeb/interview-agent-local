# fitfortherole

Practice a live voice interview with AI, then get a scored feedback report.

1. Paste a job description, upload your resume (PDF or text), and optionally add your GitHub profile.
2. Gemini reads your resume and assesses your fit for the role.
3. A five-minute voice interview runs with Gemini Live, tailored to the role and your background.
4. The transcript is scored on relevance, clarity, depth, and role fit, with per-question feedback.

It is a Bun + Turborepo monorepo: a React frontend (`apps/frontend`) and an Express API with Prisma and PostgreSQL (`apps/backend`). [ARCHITECTURE.md](ARCHITECTURE.md) has the full design.

## Requirements

- [Bun](https://bun.com) 1.3+
- PostgreSQL 14+
- A [Google AI Studio](https://aistudio.google.com/apikey) API key with access to the Gemini Live models

## Setup

```sh
bun install

# Backend configuration: fill in DATABASE_URL and GEMINI_API_KEY at minimum
cp apps/backend/.env.example apps/backend/.env

# Create the tables and generate the Prisma client
cd apps/backend
bun run db:migrate
bun run db:generate
cd ../..

bun run dev
```

The frontend runs on http://localhost:3000 and the API on http://localhost:3001. Use Chrome or Edge and allow microphone access when you start the mic.

## Configuration

Backend (`apps/backend/.env`, documented in [.env.example](apps/backend/.env.example)):

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `GEMINI_API_KEY` | yes | Server-side only. Browsers get single-use tokens with the interview config locked in. |
| `FRONTEND_URL` | no | Origin allowed by CORS (default `http://localhost:3000`) |
| `GITHUB_TOKEN` | no | Raises GitHub's API limit from 60 to 5,000 requests per hour |
| `PROXY_URL` | no | HTTPS proxy for outbound GitHub and Gemini calls |
| `GEMINI_LIVE_MODEL` | no | Voice interview model (default `gemini-3.1-flash-live-preview`) |
| `GEMINI_TEXT_MODEL`, `GEMINI_TEXT_FALLBACK_MODEL` | no | Models for resume extraction, job fit, and scoring |

Frontend (`apps/frontend/.env`): `BUN_PUBLIC_BACKEND_URL`, the API's public URL (default `http://localhost:3001`). It is baked in at build time.

## Scripts

Run from the repository root:

| Command | What it does |
|---|---|
| `bun run dev` | Starts the frontend and the API |
| `bun run test` | Unit tests for both apps (`bun test`) |
| `bun run check-types` | TypeScript checks for every workspace |
| `bun run build` | Production build of the frontend into `apps/frontend/dist` |

In `apps/backend`: `bun run db:migrate` applies migrations and `bun run db:generate` regenerates the Prisma client.

## Deploying

The app is three pieces:

1. **Database**: any managed PostgreSQL (Neon, Supabase, Railway). Create a least-privilege user for the app rather than using `postgres`.
2. **API**: a Bun host (Railway, Fly.io, Render). Start command `bun run start` in `apps/backend`. Run `bun run db:migrate` and `bun run db:generate` on each deploy. Set the backend variables above, with `FRONTEND_URL` set to the frontend's public origin.
3. **Frontend**: build with `BUN_PUBLIC_BACKEND_URL=https://your-api.example.com bun run build` and serve `apps/frontend/dist` from any static host. Configure the host to serve `index.html` for unknown paths, so links like `/result/<id>` work.

There are no accounts yet: anyone with an interview's ID can open its report. Add authentication before storing real candidates' data.
