# fitfortherole

Practice a live voice interview with AI, then get a scored feedback report.

1. Add your Gemini API key, paste a job description, upload your resume (PDF or text), and optionally add your GitHub profile.
2. Gemini reads your resume and assesses your fit for the role.
3. A five-minute voice interview runs with Gemini Live, tailored to the role and your background.
4. The transcript is scored on relevance, clarity, depth, and role fit, with per-question feedback.

It is a Bun + Turborepo monorepo: a React frontend (`apps/frontend`) and an Express API with Prisma and PostgreSQL (`apps/backend`). [ARCHITECTURE.md](ARCHITECTURE.md) has the full design.

## Requirements

- [Bun](https://bun.com) 1.3+
- PostgreSQL 14+
- A [Google AI Studio](https://aistudio.google.com/apikey) API key with access to the Gemini Live models, either in the backend `.env` or entered in the browser

## Setup

```sh
bun install

# Backend configuration: fill in DATABASE_URL at minimum (GEMINI_API_KEY saves pasting a key while developing)
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

Backend (`apps/backend/.env`, documented in .env.example):

| Variable                                          | Required | Purpose                                                                                                                                                                                 |
| ------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                    | yes      | PostgreSQL connection string                                                                                                                                                            |
| `GEMINI_API_KEY`                                  | no       | Fallback key. When empty, every user enters their own key in the browser, which sends it with each request; the server never stores it. When set, anyone who can reach the API uses it. |
| `FRONTEND_URL`                                    | no       | Origins allowed by CORS, comma-separated (default `http://localhost:3000`)                                                                                                              |
| `PORT`                                            | no       | Port to listen on (default `3001`); hosts usually set it                                                                                                                                |
| `GITHUB_TOKEN`                                    | no       | Raises GitHub's API limit from 60 to 5,000 requests per hour                                                                                                                            |
| `PROXY_URL`                                       | no       | HTTPS proxy for outbound GitHub and Gemini calls                                                                                                                                        |
| `GEMINI_LIVE_MODEL`                               | no       | Voice interview model (default `gemini-3.1-flash-live-preview`)                                                                                                                         |
| `GEMINI_TEXT_MODEL`, `GEMINI_TEXT_FALLBACK_MODEL` | no       | Models for resume extraction, job fit, and scoring                                                                                                                                      |

Frontend (`apps/frontend/.env`): `BUN_PUBLIC_BACKEND_URL`, the API's public URL (default `http://localhost:3001`). It is baked in at build time.

## Scripts

Run from the repository root:

| Command               | What it does                                               |
| --------------------- | ---------------------------------------------------------- |
| `bun run dev`         | Starts the frontend and the API                            |
| `bun run test`        | Unit tests for both apps (`bun test`)                      |
| `bun run check-types` | TypeScript checks for every workspace                      |
| `bun run build`       | Production build of the frontend into `apps/frontend/dist` |

In `apps/backend`: `bun run db:migrate` applies migrations and `bun run db:generate` regenerates the Prisma client.

## Deploying

The app is three pieces: PostgreSQL, the API (a long-running Bun process), and the frontend (static files). The free setup is Render for the API, Neon for the database, and Cloudflare Pages for the frontend.

The API needs a host that keeps a process running: it uses Bun APIs, interview setup can take most of a minute, a resume upload is about 5.4 MB of JSON, and scoring is deduplicated in memory. Serverless functions (Vercel, Netlify) don't fit; their static hosting is fine for the frontend.

### Database on Neon

1. Create a Neon project in the same region as the API. The Blueprint below uses Render's Singapore region, so pick AWS Asia Pacific (Singapore), or change both.
2. Copy the **direct** connection string (connection pooling off, so the host has no `-pooler`). Migrations run when the API starts, and they need a direct connection.

### API on Render

1. In Render, choose **New > Blueprint** and select this repository. [`render.yaml`](render.yaml) creates a free Docker web service from `apps/backend/Dockerfile`, health-checks `/health` (which also checks the database), and only redeploys when backend files, `package.json`, or `bun.lock` change. The container runs `prisma migrate deploy` before starting, so migrations apply on every deploy.
2. When asked, set `DATABASE_URL` to the Neon connection string and `FRONTEND_URL` to the frontend's origin, for example `https://fitfortherole.pages.dev` (add a custom domain with a comma). `GEMINI_API_KEY` stays unset, so each user brings their own key.
3. The service's `onrender.com` URL is the API URL.

Free instances sleep after about 15 minutes without traffic and take up to a minute to wake. The landing page calls the API as soon as it loads, so the API is usually awake by the time someone submits the form. Paid instances don't sleep.

### Other hosts

[`railway.json`](railway.json) does the same job on Railway: add the repository as a service at the repository root and set the same variables (with Railway's Postgres, `DATABASE_URL` is `${{Postgres.DATABASE_URL}}`). Any other container host works too: build from the repository root with `docker build -f apps/backend/Dockerfile .` and set the same variables. `PORT` is read from the environment.

### Frontend on Cloudflare

In the Cloudflare dashboard, go to **Workers & Pages** > **Create** and import this repository. Cloudflare creates a Worker that serves static files; [`wrangler.jsonc`](wrangler.jsonc) tells it to upload `apps/frontend/dist` and to answer unknown paths such as `/result/<id>` with `index.html`. The `name` in that file must match the Worker's name in the dashboard.

| Setting                  | Value                          |
| ------------------------ | ------------------------------ |
| Root directory           | leave empty                    |
| Build command            | `bun install && bun run build` |
| Deploy command           | `npx wrangler deploy`          |
| `BUN_PUBLIC_BACKEND_URL` | the API URL from Render        |
| `BUN_VERSION`            | `1.3.14`                       |

Add the two variables as build variables. The site is then at `https://<worker-name>.<your-subdomain>.workers.dev`; set that as `FRONTEND_URL` on Render.

A Cloudflare Pages project works too: same build command, build output directory `apps/frontend/dist`, and no deploy command. On another static host, add the `index.html` fallback yourself (for Netlify, a `_redirects` file with `/* /index.html 200`).

The repository pins Bun in `devEngines` with `onFail: "warn"`, so tools that go through npm (like `npx wrangler`) still run.

The API URL is baked in at build time, so rebuild the frontend when it changes. A CI build without `BUN_PUBLIC_BACKEND_URL` fails rather than shipping a site that calls `localhost`.

There are no accounts yet: anyone with an interview's ID can open its report. Add authentication before storing real candidates' data.
