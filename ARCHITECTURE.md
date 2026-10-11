# Architecture

This repository is a Bun-powered Turborepo monorepo for an AI interview practice app called `fitfortherole`. A candidate provides their own Gemini API key (unless the server has one), a job description, a resume (PDF or text), and optionally a GitHub profile. The backend turns that into a stored interview profile, runs a five-minute voice interview through Gemini Live, saves the transcript, and scores it into a feedback report.

## Tech Stack

### Monorepo and Runtime

- **Package manager/runtime:** Bun `1.3.14`
- **Monorepo orchestration:** Turborepo
- **Language:** TypeScript (strict, `noUncheckedIndexedAccess`)
- **Workspace layout:** `apps/*` and `packages/*`
- **Root scripts:**
  - `bun run dev`: runs Turbo `dev` tasks (frontend and backend)
  - `bun run build`: runs Turbo `build` tasks (frontend bundle to `dist/`)
  - `bun run test`: runs `bun test` in both apps
  - `bun run check-types`: runs `tsc --noEmit` in every workspace

### Frontend

- **Framework:** React 19
- **Routing:** React Router 7
- **Bundling/dev server:** Bun `serve` with HMR; `build.ts` for production
- **Styling:** Tailwind CSS 4, `tw-animate-css`, CSS theme tokens
- **UI primitives:** Radix UI primitives, class-variance-authority, local shadcn-style components
- **Notifications:** Sonner
- **HTTP client:** browser `fetch`, wrapped in `src/lib/api.ts`
- **Audio/WebSocket:** `WebSocket`, `AudioContext`, `AudioWorklet`, `MediaDevices`

### Backend

- **Runtime:** Bun
- **HTTP server:** Express 5 (async handler errors reach the error middleware)
- **Validation:** Zod 4, for requests, LLM output, and JSON read back from the database
- **Database ORM:** Prisma 7 with the `pg` driver adapter
- **Database:** PostgreSQL
- **External APIs** (all through axios, with optional `PROXY_URL`):
  - GitHub REST API for public repositories
  - Gemini `generateContent` with structured output, for resume extraction, job fit, and scoring
  - Gemini auth token API for single-use Live tokens with the session config locked in
- **Browser-side external API:** the Gemini Live WebSocket, opened directly from the browser with the ephemeral token

### Shared Packages

`packages/ui`, `packages/eslint-config`, and `packages/typescript-config` are Turborepo starter scaffolding. Neither app uses them.

## Repository Structure

```text
.
|-- apps
|   |-- backend
|   |   |-- agents             LLM steps: resumeExtractor, jdFeedbackAgent, interviewEvaluator
|   |   |-- lib                gemini (structured output, key checks), apiKey (per-request key),
|   |   |                      liveSession (prompt + Live setup), interviewContext (lenient
|   |   |                      JSON readers), resumeParser (fallback), httpError
|   |   |-- prisma             schema, migrations, client singleton
|   |   |-- routes             interviews.ts: every /api/v1 route
|   |   |-- scrapers           github.ts
|   |   |-- index.ts           app setup, CORS, error handling
|   |   |-- sideband.ts        ephemeral Live tokens
|   |   |-- proxy.ts           optional HTTPS proxy agent
|   |   `-- types.ts           request schemas
|   `-- frontend
|       |-- src
|       |   |-- components     Home (home/*), Interview, Result (report/*), ApiKeyField,
|       |   |                  site/* (header, footer, backdrop), ui/*
|       |   |-- lib            api, apiKey, geminiLive, audioUtils, transcript, utils
|       |   |-- App.tsx        routes
|       |   `-- config.ts      BACKEND_URL from BUN_PUBLIC_BACKEND_URL
|       |-- styles
|       `-- build.ts
|-- packages                   unused starter scaffolding
|-- turbo.json
`-- package.json
```

Tests live next to the code they cover (`*.test.ts`).

## High-Level Design

### Primary User Flow

1. `/` (`Home`) is a landing page whose setup form collects the user's Gemini API key, a job description, a resume as a PDF (up to 4 MB) or pasted text, and an optional GitHub profile URL. The key is checked with `POST /api-key/verify` and kept in the browser; every later request carries it in the `X-Gemini-Api-Key` header (see [API Keys](#api-keys)).
2. `POST /api/v1/pre-interview` validates the input. In parallel it:
   - fetches the candidate's non-fork GitHub repositories (optional; an outage becomes a warning, a missing user is a 404),
   - extracts structured resume data with Gemini, which reads PDFs natively (pasted text falls back to a regex parser),
   - assesses job fit with Gemini as soon as the repositories arrive (falls back to keyword matching).
3. The backend stores an `Interview` with status `pre`, and the browser navigates to `/interview/:id`.
4. `POST /api/v1/interviews/:id/session` builds the complete Live session config: the interview plan, the candidate context, the `end_interview` tool, and transcription. It mints a single-use token with that config locked in, moves the interview to `InProgress`, and returns the token, the model, the duration, and the next transcript sequence number.
5. The browser opens the Live WebSocket, sends only `{ setup: { model } }`, and starts the conversation with a `realtimeInput` text message. The interviewer greets the candidate by name.
6. Microphone audio streams to Gemini as 16 kHz PCM, and Gemini's 24 kHz audio plays through an `AudioWorklet`. Input and output transcriptions build the transcript. Each finished turn is saved with `POST /api/v1/interviews/:id/messages`.
7. The interview ends when the model calls `end_interview` after its goodbye, when the five-minute clock runs out (the interviewer is told the time is up and the wrap-up turn ends it, with a 30-second backstop), or when the candidate clicks **End interview**. The browser re-sends the full transcript and opens `/result/:id`.
8. `Result` calls `POST /api/v1/interviews/:id/complete`, which marks the interview `Done`, scores the transcript once, and returns the report.

### System Context

```text
Browser
  |  fetch
  v
Frontend (React)  --- WebSocket + ephemeral token --->  Gemini Live API
  |
  |  /api/v1
  v
Backend (Express) --- axios ---> GitHub REST API
  |               --- axios ---> Gemini generateContent (extract, fit, score)
  |               --- axios ---> Gemini auth_tokens (locked Live config)
  |  Prisma
  v
PostgreSQL
```

### Main Architectural Boundaries

- **Frontend:** user input, the user's Gemini key, routing, microphone capture, the Live WebSocket, audio playback, transcript assembly, the interview clock, and the report view. It never sees the prompt or the raw resume.
- **Backend:** validation, GitHub and resume processing, job fit, prompt and session construction, token minting, transcript storage, the interview lifecycle, and scoring.
- **Database:** interview records, structured candidate context, transcripts, and evaluations.
- **Gemini Live:** real-time questions, voice, and transcription, constrained by the locked config.

## Low-Level Design

## Frontend LLD

### Entry Points

- `src/index.ts`: Bun's dev server; serves `index.html` for every route so React Router can handle client-side routing.
- `src/index.html`: loads fonts and mounts the app through `frontend.tsx`.
- `src/frontend.tsx`: creates the React root in `StrictMode` and keeps it across hot reloads.
- `build.ts`: production bundle with absolute asset URLs (`publicPath: "/"`) so deep links load, and `BUN_PUBLIC_*` variables inlined.

### Routing

`src/App.tsx`:

- `/`: `Home`
- `/interview/:interviewId`: `Interview`
- `/result/:interviewId`: `Result`
- `/result`: redirects to `/`

### API Client

`src/lib/api.ts` wraps `fetch`. It adds the stored Gemini key as `X-Gemini-Api-Key` to every request. Error responses become `ApiError(status, message)` using the server's `message`, and network failures become a readable "can't reach the server" error. It exports typed calls for every endpoint (including `getConfig` and `verifyApiKey`) and the report types.

`src/lib/apiKey.ts` keeps the key in `sessionStorage` for the tab, and also in `localStorage` when the user ticks **Remember on this device**. Every storage access is guarded, so blocked storage only means the key isn't persisted.

### Home Screen

`src/components/Home.tsx` composes the landing page from `src/components/home/*`: a hero with an illustrated interview preview, a marquee of example roles, how it works, the setup form, a sample report, an FAQ, and a closing call to action.

`src/components/home/SetupForm.tsx`

- Step 1 is `ApiKeyField`: paste, show or hide, **Verify & save** (`POST /api-key/verify`), remember on this device, and a link to Google AI Studio. `GET /config` says whether a key is required; when the server has its own key, the step is optional.
- Job description textarea with a character counter (20,000 max) and example role titles, resume as PDF (click or drop, 4 MB limit checked client-side) or pasted text (50,000 max), and optional GitHub URL.
- A sticky sidebar with a live ready check, tips for the session, and a plain-language data note.
- Reads a PDF as base64 with `FileReader` and posts it with the rest of the form. While the server works, a staged progress list replaces the submit button.
- Shows server validation messages and warnings (for example, GitHub unreachable) as toasts.

### Interview Screen

`src/components/Interview.tsx`

- On mount: `POST /session`. A `409` (already finished) redirects to the report.
- Creates `GeminiLiveAPI` and `AudioPlayer`. On setup complete it sends the kickoff text and starts the clock.
- Transcript: `lib/transcript.ts` merges streamed chunks into entries. A speaker change closes the open entry, and turn-complete or interrupted events close the interviewer's entry. Each closed entry is saved right away.
- Ending: `finishInterview()` stops the clock and mic, lets the goodbye finish (`AudioPlayer.drain`) or cuts playback, disconnects, re-sends the whole transcript, and navigates to the report. Pending timers are ignored after unmount.
- States: `connecting`, `live`, `disconnected`, `error`, and `finishing`. A `401` from `/session` shows `ApiKeyField` inline and retries once a key is saved. **Reconnect** reruns the setup and keeps the turns already on screen; **Finish and see report** ends the interview.
- UI: an interviewer orb that animates while the interviewer speaks, a time bar and countdown badge (terracotta in the last 30 seconds), a mic button with a live input-level ring (`AudioStreamer.onLevel`) and an **M** shortcut, labeled transcript bubbles with auto-scroll, quick tips, a two-click **End interview**, and a saving overlay. A blocked microphone shows a toast instead of failing silently.

### Transcript Reducer

`src/lib/transcript.ts` is pure and unit-tested. Entries carry a `seq` that continues from the server's `nextSeq` after a reconnect. Whitespace-only entries are dropped and their `seq` reused. It returns the entries each update closed, so the component knows what to save.

### Gemini Live Client

`src/lib/geminiLive.ts`

- Connects to `BidiGenerateContentConstrained` with the ephemeral token and sends `{ setup: { model } }`. Every other setup field is locked into the token by the backend and would be ignored anyway.
- Sends realtime text, realtime audio, and tool responses.
- Normalizes server messages into `SETUP_COMPLETE`, `AUDIO`, `TEXT`, `INPUT_TRANSCRIPTION`, `OUTPUT_TRANSCRIPTION`, `INTERRUPTED`, `TURN_COMPLETE`, and `TOOL_CALL`.
- Why realtime text for the kickoff: on `gemini-3.1-flash-live-preview`, `clientContent` turns are only accepted as initial history and produce no reply.

### Audio Utilities

`src/lib/audioUtils.ts`

- `AudioStreamer`: microphone at 16 kHz with echo cancellation, noise suppression, and gain control, then an `AudioWorklet`, Float32 to PCM16, base64, and `sendAudioMessage`. `onLevel` reports each chunk's RMS loudness for the level meter.
- `AudioPlayer`: base64 PCM16 at 24 kHz into a queueing `AudioWorklet`. `interrupt()` clears the queue, and `drain()` waits for queued audio to finish (tracked in `AudioContext` time).

### Result Screen

`src/components/Result.tsx`

- Calls `POST /complete`, which is idempotent, so a refresh or retry never scores twice. Shows a staged scoring state with skeletons, and an error state with retry (or `ApiKeyField` on a `401`).
- Report: a headline from the score band, the overall score as a hero figure (0-100) with a meter, the summary with length and question count, highlight tiles (strongest area, focus area, resume match), one meter per dimension (score as text beside it), strengths, improvements, per-question feedback with pips, the resume match with evidence and gaps, next steps (weakest dimension, first improvement, first resume gap), and the transcript in a collapsible section. **Copy link** and **Print** sit in the header; print styles hide the page chrome.
- An interview with no real answers shows an explanation and a checklist for the next try instead of scores.
- `src/components/report/Meter.tsx` holds the shared meter, pips, dimension labels, and score bands, also used by the sample report on the home page.

### Styling and UI

- `styles/globals.css` defines Tailwind imports, theme tokens (sage, moss, forest, terracotta, clay, sand, stone, plus the lake, ochre, heather, and pine accents, each with a pale tint and a darker ink step that meets WCAG AA for text), fonts, keyframe animations (float, wave, marquee, ripple, blink, shimmer), grain and dot textures, base styles, and print styles. Animations are switched off under `prefers-reduced-motion`.
- `src/lib/accents.ts` maps each accent to its static Tailwind classes (fill, tint, ink, focus ring). The report's four dimensions keep one accent each (relevance lake, clarity ochre, depth heather, role fit pine), validated together as a categorical palette; other data marks stay forest.
- `src/components/form/Field.tsx` holds the form controls: `FieldFrame` (a filled field that turns white with an accent ring on focus, with an optional icon tile and inline adornments), a footer bar and character count for textareas, and `Switch`.
- `src/components/site/*` holds the wordmark, sticky header, footer, page backdrop, and section headings shared by every page.
- `src/components/ui/*` holds the shadcn-style primitives.

## Backend LLD

### Server Entry Point

`apps/backend/index.ts`

- JSON body limit of `6mb`, enough for a base64 resume PDF.
- Manual CORS for the comma-separated origins in `FRONTEND_URL` (default `http://localhost:3000`; trailing slashes ignored, see `lib/origins.ts`), allowing the `X-Gemini-Api-Key` header.
- `GET /health`: `200` when the database answers `SELECT 1`, otherwise `503`, for the host's health checks.
- Mounts `routes/interviews.ts` at `/api/v1`.
- Error middleware: `HttpError` becomes its status and message, an oversized body `413`, malformed JSON `400`, and anything else `500`. Axios errors are logged without request headers so API keys never reach the logs.
- Listens on `PORT` (default `3001`). On `SIGTERM` it stops accepting connections, lets in-flight requests finish (up to 60 seconds), and disconnects Prisma.

### Routes

`apps/backend/routes/interviews.ts`

- `GET /config`: `{ apiKeyRequired }`, true when the server has no `GEMINI_API_KEY`.
- `POST /api-key/verify`: checks the caller's key with one cheap authenticated Gemini call (list models). `204`, or `401` when Google rejects it.
- `POST /pre-interview`: validation (`PreInterviewRequestSchema`), PDF checks (size, `%PDF-` signature), parallel GitHub, extraction, and job fit, then creates the interview.
- `POST /interviews/:id/session`: `404` if unknown, `409` if `Done`. Builds the Live setup, mints the token, moves `pre` to `InProgress` (`startedAt`) atomically with `updateMany`, and returns `nextSeq`.
- `POST /interviews/:id/messages`: validates up to 500 messages and upserts each by `(interviewId, seq)` in one transaction. `409` once `Done`.
- `POST /interviews/:id/complete`: marks `Done` (`endedAt`) if needed. If there is no evaluation, scores through an in-memory map so concurrent calls share one run, then returns the report.

### Request Validation

`apps/backend/types.ts`

- `jobDescription`: required, trimmed, at most 20,000 characters.
- `githubUrl`: optional; must parse as a GitHub profile URL or username.
- Exactly one of `resumeText` (at most 50,000 characters) or `resumePdfBase64`.
- `SaveMessagesRequestSchema`: `seq` 0-10,000, role `user` or `assistant`, non-empty text.

### GitHub Scraper

`apps/backend/scrapers/github.ts`

- `parseGithubUsername` accepts profile URLs (with or without scheme or `www`), repository URLs, `@user`, or a bare username, and validates GitHub's username rules.
- `scrapeGithub` lists owned repositories sorted by last push, drops forks, keeps 20, and maps them to name, full name, description, language, and stars. Sends `GITHUB_TOKEN` when set.
- `loadGithubRepos`: a `404` becomes `HttpError(404)`. Other failures (rate limit, outage) return no repositories and a warning.

### Gemini Structured Output

`apps/backend/lib/gemini.ts`

- `generateJson({ schema, system, parts })` sends the Zod schema as `responseJsonSchema` (via `z.toJSONSchema`) and validates the reply with the same schema.
- Takes the request's `apiKey`. `keyRejection` turns Google's answers to a bad key (`400 API key not valid`, `401`, `403`) into `HttpError(401)`; these are never retried and skip the fallbacks below, since nothing else would work with that key.
- Models: `GEMINI_TEXT_MODEL` (default `gemini-3.5-flash-lite`), falling back to `GEMINI_TEXT_FALLBACK_MODEL` (default `gemini-3.1-flash-lite`) on 429, 5xx, or connection errors. Timeouts (45 seconds) are not retried.

### API Keys

`apps/backend/lib/apiKey.ts`

- `geminiApiKey(req)` returns the `X-Gemini-Api-Key` header, or `GEMINI_API_KEY` when the header is absent. With neither it throws `401`. Values over 200 characters or containing whitespace are rejected with `400`.
- The key is passed down to `generateJson` and `createEphemeralToken` for that request only. It is never written to the database or logs.
- `/complete` only resolves a key when the interview still needs scoring, so a finished report opens without one.

### Resume Extraction

`apps/backend/agents/resumeExtractor.ts`

- Sends the PDF as `inlineData` or the text as-is, and asks for name, contacts, education, work entries, projects, skills, and years of experience.
- On failure (other than a rejected key): pasted text falls back to `lib/resumeParser.ts` (regex and keywords, including a projects section), and a PDF returns `502` asking the user to retry or paste text.

### Job Fit

`apps/backend/agents/jdFeedbackAgent.ts`

- `assessJobFit`: Gemini compares the job description with the resume and repositories, returning a score, summary, and up to 10 matched and 8 missing requirements.
- `keywordJobMatch` (fallback): frequency-ranked keywords from the job description, with filler words and sentence punctuation removed, scored on every match.

### Live Session

`apps/backend/lib/liveSession.ts`

- `buildSystemInstruction`: a five-minute plan (greeting by first name, project deep dive with a trade-off, one or two technical questions favoring job-fit gaps, one behavioral question, wrap-up, then `end_interview`), conduct rules, and the candidate context. The context is marked as data, not instructions.
- `buildLiveSetup`: model (`GEMINI_LIVE_MODEL`), audio-only responses with the `Puck` voice, the prompt, the `end_interview` function declaration, automatic activity detection, and input and output transcription.

### Interview Context

`apps/backend/lib/interviewContext.ts` reads the JSON columns through lenient Zod schemas. Missing fields on older rows get defaults, and email, phone, and raw resume text are dropped before anything reaches a prompt. It also formats the job description, candidate, and job fit for prompts.

### Scoring

`apps/backend/agents/interviewEvaluator.ts`

- Rubric from Gemini: relevance, clarity, depth, and role fit (each 1-10 with a comment), a summary, strengths, improvements, and per-question feedback.
- `overallScore` is the mean of the four dimensions times 10, computed in code so it always matches them.
- Fewer than 15 words from the candidate returns a fixed "no answers" evaluation without calling the model.

### Ephemeral Tokens

`apps/backend/sideband.ts` calls `v1alpha/auth_tokens` with `uses: 1`, a 30-minute expiry, a 60-second window to start the session, and `bidiGenerateContentSetup` set to the interview's full setup. Without a field mask, every field in that setup is locked.

### Proxy Configuration

`apps/backend/proxy.ts` exports an `HttpsProxyAgent` when `PROXY_URL` is set. Every outbound axios call passes it and disables axios's own proxy detection (`proxy: false`).

### Deployment

- `apps/backend/Dockerfile` (built from the repository root) installs the workspace with the frozen lockfile, generates the Prisma client, and runs `start:prod`: `prisma migrate deploy`, then the API, as the unprivileged `bun` user. `.dockerignore` keeps `node_modules`, builds, generated code, and `.env` files out of the image.
- `prisma.config.ts` reads `DATABASE_URL` directly, so `prisma generate` works in build environments without a database; `migrate` still fails clearly without one.
- `render.yaml` (a Render Blueprint) and `railway.json` both point at that Dockerfile, health-check `/health`, and limit redeploys to backend changes. The free setup is Render for the API and Neon for Postgres; Render's free Postgres expires, so the Blueprint defines no database.
- The frontend's `BUN_PUBLIC_*` variables are declared in `turbo.json`, so Turbo passes them to the build and includes them in its cache key. `build.ts` fails a CI build (`CI` set) without `BUN_PUBLIC_BACKEND_URL`, and `config.ts` drops a trailing slash from it.

## Database Design

`apps/backend/prisma/schema.prisma`

### `Interview`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | primary key |
| `jobDescription` | text | from the form |
| `githubMetadata` | JSON | repositories (may be empty) |
| `resumeData` | JSON | extracted resume, including contacts and raw text for pasted resumes |
| `jdFeedback` | JSON? | job fit from the resume screen |
| `evaluation` | JSON? | the scored report |
| `status` | enum | `pre` → `InProgress` → `Done` |
| `score` | int? | interview score 0-100, set when scored |
| `createdAt`, `updatedAt` | timestamp | |
| `startedAt`, `endedAt` | timestamp? | set by the session and complete endpoints |

### `Message`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | primary key |
| `seq` | int | position in the transcript; unique with `interviewId` |
| `message` | text | transcribed speech |
| `type` | enum | `User` or `Assistant` |
| `createdAt` | timestamp | |
| `interviewId` | FK | `ON DELETE CASCADE` |

The `(interviewId, seq)` unique index gives ordering, idempotent saves, and an index on the foreign key.

### Migrations

1. `20260713131418_init`: interviews and messages.
2. `20260718120000_add_resume_data`: `resumeData` and `jdFeedback`.
3. `20260929120000_add_job_description`: `jobDescription` (existing rows backfilled with an empty string); drops a stray `resumeData` default.
4. `20260929130000_interview_lifecycle`: timestamps, `evaluation`, nullable `score` (old values, which were resume-screen scores, cleared), and `Message.seq` with its unique index and cascade.

## API Contracts

All routes are under `/api/v1`. Errors are `{ "message": string }`.

### `POST /pre-interview`

```json
{
  "jobDescription": "Senior Frontend Engineer ...",
  "githubUrl": "https://github.com/octocat",
  "resumePdfBase64": "JVBERi0xLjQK..."
}
```

Send `resumeText` instead of `resumePdfBase64` for a pasted resume. Response:

```json
{ "interviewId": "uuid", "warnings": [] }
```

Errors: `400` validation or not a PDF, `401` missing or rejected Gemini key, `404` GitHub user not found, `413` file too large, `502` PDF could not be read.

Every route below also takes the `X-Gemini-Api-Key` header; the ones that call Gemini return `401` without a usable key.

### `GET /config`

```json
{ "apiKeyRequired": true }
```

### `POST /api-key/verify`

Send the key in `X-Gemini-Api-Key`. Response: `204`. Errors: `401` rejected key, `502` Google unreachable.

### `POST /interviews/:id/session`

```json
{ "token": "auth_tokens/...", "model": "models/gemini-3.1-flash-live-preview", "durationSeconds": 300, "nextSeq": 0 }
```

Errors: `401` missing or rejected Gemini key, `404` unknown interview, `409` already finished, `502` token minting failed.

### `POST /interviews/:id/messages`

```json
{ "messages": [{ "seq": 0, "role": "assistant", "text": "Hi Priya, ..." }] }
```

Response: `204`. Errors: `400`, `404`, `409` already finished.

### `POST /interviews/:id/complete`

```json
{
  "id": "uuid",
  "status": "Done",
  "score": 70,
  "evaluation": {
    "overallScore": 70,
    "summary": "...",
    "dimensions": {
      "relevance": { "score": 6, "comment": "..." },
      "clarity": { "score": 8, "comment": "..." },
      "depth": { "score": 7, "comment": "..." },
      "roleFit": { "score": 7, "comment": "..." }
    },
    "strengths": ["..."],
    "improvements": ["..."],
    "questions": [{ "question": "...", "feedback": "...", "score": 9 }]
  },
  "jobFit": { "score": 60, "summary": "...", "matchedSignals": ["..."], "missingSignals": ["..."] },
  "startedAt": "2026-09-29T07:30:00.000Z",
  "endedAt": "2026-09-29T07:35:00.000Z",
  "messages": [{ "seq": 0, "role": "assistant", "text": "..." }]
}
```

Errors: `401` missing or rejected Gemini key (only when the interview still needs scoring), `404`, `502` scoring failed (the interview stays `Done` and can be retried).

## Configuration

Backend (`apps/backend/.env`; see `.env.example`): `DATABASE_URL` (required), `GEMINI_API_KEY` (optional fallback; leave it empty so users bring their own key), `FRONTEND_URL` (comma-separated origins), `PORT`, `GITHUB_TOKEN`, `PROXY_URL`, `GEMINI_LIVE_MODEL`, `GEMINI_TEXT_MODEL`, and `GEMINI_TEXT_FALLBACK_MODEL`.

Frontend (`apps/frontend/.env`): `BUN_PUBLIC_BACKEND_URL` (default `http://localhost:3001`), inlined at build time. `config.ts` guards the read because an unset `BUN_PUBLIC_*` variable is left as a `process.env` expression, and `process` doesn't exist in browsers.

### Runtime Ports

- Backend API: `http://localhost:3001`
- Frontend dev server: `http://localhost:3000`

## Design Notes and Gaps

- **No authentication.** Anyone who knows an interview ID can save messages to it, complete it, and read its report.
- **The transcript comes from the browser.** It is speech recognition output and the client could alter it. That is acceptable for self-practice, not for real hiring.
- **Scoring deduplication is in memory.** With several API instances, two could score the same interview. The result is still correct, just a wasted call.
- **Reconnects start a fresh Live session.** After a refresh the interviewer greets again and the clock restarts. The transcript continues numbering, so nothing is overwritten.
- **The model does not always call `end_interview`.** The client also ends after the wrap-up turn once time is up, and on a 30-second backstop.
- **Browser support.** Capture uses a 16 kHz `AudioContext`, which Firefox can't connect to a microphone stream. Use Chrome or Edge.
- **Preview models.** Live models are previews and change. Every model name is configurable.
- `packages/*` is unused scaffolding.

## Security and Privacy Notes

- A user's Gemini key lives in their browser and is sent over the API connection with each request. The server uses it for that request and never stores or logs it. A server-side `GEMINI_API_KEY`, if set, never leaves the server, and any visitor's requests can use it, so leave it empty on a public deployment.
- Browsers receive single-use Live tokens whose session config (model, prompt, tools) is locked, so a token can't be repurposed.
- Prompts include the candidate's name, work history, skills, and projects, but not email, phone, or raw resume text. Candidate-supplied text is marked as data in every prompt.
- Resume data (including contacts for pasted resumes), GitHub metadata, transcripts, and evaluations are stored in PostgreSQL. Deleting an interview deletes its messages.
- Outbound call failures are logged as status and message only, never with request headers.
- CORS is restricted to the origins in `FRONTEND_URL`.
