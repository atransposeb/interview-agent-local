# Architecture

This repository is a Bun-powered Turborepo monorepo for an AI interview practice app called `fitfortherole`. The application collects a candidate's GitHub profile URL and resume text, creates a pre-interview profile from that data, stores it in PostgreSQL, and then starts a browser-based live voice interview with Gemini Live using that stored context.

## Tech Stack

### Monorepo and Runtime

- **Package manager/runtime:** Bun `1.3.14`
- **Monorepo orchestration:** Turborepo
- **Language:** TypeScript
- **Workspace layout:** `apps/*` and `packages/*`
- **Root scripts:**
  - `bun run dev`: runs Turbo `dev` tasks
  - `bun run build`: runs Turbo `build` tasks
  - `bun run lint`: runs Turbo `lint` tasks
  - `bun run check-types`: runs Turbo type checks

### Frontend

- **Framework:** React 19
- **Routing:** React Router
- **Bundling/dev server:** Bun `serve` with HMR
- **Styling:** Tailwind CSS 4, `tw-animate-css`, CSS theme tokens
- **UI primitives:** Radix UI primitives, class-variance-authority, local shadcn-style components
- **Notifications:** Sonner
- **HTTP client:** Axios and browser `fetch`
- **Audio/WebSocket:** Browser Web APIs: `WebSocket`, `AudioContext`, `AudioWorklet`, `MediaDevices`

### Backend

- **Runtime:** Bun
- **HTTP server:** Express 5
- **Validation:** Zod
- **Database ORM:** Prisma 7
- **Database:** PostgreSQL
- **External APIs:**
  - GitHub REST API for repository metadata
  - Gemini auth token API for ephemeral Live API tokens
  - Gemini Live WebSocket API is called directly from the frontend
- **Proxy support:** `https-proxy-agent` via `PROXY_URL`

### Shared Packages

- `packages/ui`: small reusable React component package generated from the Turborepo starter. It is not currently used by the frontend app, which has its own local UI components.
- `packages/eslint-config`: shared ESLint configs.
- `packages/typescript-config`: shared TypeScript config package.

## Repository Structure

```text
.
|-- apps
|   |-- backend
|   |   |-- agents
|   |   |-- lib
|   |   |-- prisma
|   |   |-- scrapers
|   |   |-- index.ts
|   |   |-- proxy.ts
|   |   |-- sideband.ts
|   |   `-- types.ts
|   `-- frontend
|       |-- src
|       |   |-- components
|       |   |-- lib
|       |   |-- App.tsx
|       |   |-- config.ts
|       |   |-- frontend.tsx
|       |   |-- index.html
|       |   `-- index.ts
|       |-- styles
|       `-- build.ts
|-- packages
|   |-- eslint-config
|   |-- typescript-config
|   `-- ui
|-- package.json
|-- turbo.json
`-- bun.lock
```

## High-Level Design

### Primary User Flow

1. The user opens the frontend at `/`.
2. `Form` collects:
   - GitHub profile URL
   - pasted resume text
3. The frontend sends `POST /api/v1/pre-interview` to the backend.
4. The backend validates the request with Zod.
5. The backend extracts the GitHub username from the URL.
6. The backend fetches public repository metadata from the GitHub API.
7. The backend parses the resume text into structured resume data.
8. The backend compares resume/GitHub signals with `apps/backend/jd.txt`.
9. The backend creates an `Interview` row in PostgreSQL.
10. The frontend navigates to `/interview/:interviewId`.
11. The interview screen fetches:
    - a Gemini ephemeral token from `GET /api/v1/gemini/session`
    - stored interview context from `GET /api/v1/interviews/:id/context`
12. The frontend opens a Gemini Live WebSocket directly from the browser.
13. Browser microphone audio is streamed to Gemini as 16 kHz PCM.
14. Gemini audio is played back through an `AudioWorklet`.
15. Input and output transcriptions are displayed as chat bubbles.

### System Context

```text
User Browser
  |
  | HTTP
  v
Frontend React App
  |
  | POST /api/v1/pre-interview
  v
Backend Express API
  |          |
  |          | GitHub REST API
  |          v
  |      GitHub
  |
  | Prisma
  v
PostgreSQL

Frontend React App
  |
  | GET /api/v1/gemini/session
  v
Backend Express API
  |
  | Gemini token API
  v
Google Generative Language API

Frontend React App
  |
  | Gemini Live WebSocket with ephemeral token
  v
Gemini Live API
```

### Main Architectural Boundaries

- **Frontend app:** owns user interaction, routing, microphone capture, Gemini Live WebSocket lifecycle, audio playback, and transcript rendering.
- **Backend API:** owns request validation, GitHub scraping, resume parsing, JD-fit scoring, database persistence, CORS, and server-side Gemini token creation.
- **Database:** stores interview records, structured pre-interview context, match feedback, and the schema for future conversation persistence.
- **External AI service:** Gemini handles real-time interview question generation, voice output, and transcription streams.

## Low-Level Design

## Frontend LLD

### Entry Points

- `apps/frontend/src/index.ts`
  - Starts Bun's frontend server.
  - Serves `index.html` for all unmatched routes so React Router can handle client-side routing.
  - Contains starter `/api/hello` sample routes that are separate from the actual backend API.

- `apps/frontend/src/index.html`
  - Loads fonts and mounts the React app through `frontend.tsx`.

- `apps/frontend/src/frontend.tsx`
  - Creates the React root.
  - Renders `App` inside `StrictMode`.
  - Preserves the root across Bun hot reloads using `import.meta.hot.data`.

### Routing

`apps/frontend/src/App.tsx` defines three routes:

- `/`: renders `Form`
- `/interview/:interviewId`: renders `Interview`
- `/result`: renders `Result`

### Form Screen

`apps/frontend/src/components/Form.tsx`

Responsibilities:

- Stores `githubUrl`, `resumeText`, and `loading` in React state.
- Performs minimal client-side validation.
- Calls `POST ${BACKEND_URL}/api/v1/pre-interview`.
- Navigates to `/interview/:interviewId` after successful pre-interview setup.
- Uses Sonner to show validation and failure messages.

Important dependency:

- `apps/frontend/src/config.ts` hardcodes `BACKEND_URL` as `http://localhost:3001`.

### Interview Screen

`apps/frontend/src/components/Interview.tsx`

Responsibilities:

- Reads `interviewId` from the route.
- Fetches Gemini token and interview context in parallel.
- Builds a private Gemini system instruction from:
  - parsed resume data
  - GitHub metadata
  - JD feedback
- Creates and owns a `GeminiLiveAPI` instance.
- Creates and owns an `AudioPlayer` instance.
- Starts/stops microphone streaming through `AudioStreamer`.
- Maintains connection status, microphone state, and chat transcript state.
- Appends streamed transcript chunks into the latest message bubble until a turn completes.

Lifecycle:

- On mount:
  - fetch token and context
  - initialize Gemini client
  - initialize audio player
  - connect WebSocket
- On Gemini setup complete:
  - mark connected
  - seed the first interview prompt
- On unmount or disconnect:
  - stop microphone stream
  - destroy audio player
  - close WebSocket

### Gemini Live Client

`apps/frontend/src/lib/geminiLive.ts`

Responsibilities:

- Wraps the Gemini Live WebSocket protocol.
- Sends setup configuration with:
  - model URI
  - response modalities
  - speech voice config
  - system instruction
  - realtime input config
  - optional input/output transcription config
  - optional history config
- Sends:
  - initial text via `clientContent`
  - later text via `realtimeInput`
  - audio chunks via `realtimeInput.audio`
- Parses server messages into normalized frontend events:
  - `SETUP_COMPLETE`
  - `AUDIO`
  - `TEXT`
  - `INPUT_TRANSCRIPTION`
  - `OUTPUT_TRANSCRIPTION`
  - `INTERRUPTED`
  - `TURN_COMPLETE`

Current configured model in `Interview.tsx`:

- `gemini-3.1-flash-live-preview`

### Audio Utilities

`apps/frontend/src/lib/audioUtils.ts`

`AudioStreamer`:

- Requests microphone access with echo cancellation, noise suppression, and auto gain control.
- Creates a 16 kHz `AudioContext`.
- Uses an inline `AudioWorkletProcessor` to buffer microphone samples.
- Converts Float32 audio to PCM16.
- Encodes PCM16 chunks as base64.
- Sends chunks to Gemini through `GeminiLiveAPI.sendAudioMessage`.

`AudioPlayer`:

- Creates a 24 kHz playback `AudioContext`.
- Uses an inline `AudioWorkletProcessor` to queue PCM audio.
- Decodes Gemini base64 PCM16 audio into Float32 samples.
- Plays audio through the browser audio destination.
- Supports interruption by clearing the queued audio.

### Styling and UI

- `apps/frontend/styles/globals.css` defines Tailwind imports, theme tokens, fonts, color palette, and base body styles.
- `apps/frontend/src/components/ui/*` contains local shadcn-style UI primitives.
- `apps/frontend/src/lib/utils.ts` provides the local `cn` helper used by UI components.

## Backend LLD

### Server Entry Point

`apps/backend/index.ts`

Responsibilities:

- Creates the Express app.
- Enables JSON request parsing with a `1mb` limit.
- Adds manual CORS headers.
- Defines API routes.
- Defines centralized error handling.
- Listens on port `3001`.

### API Endpoints

#### `POST /api/v1/pre-interview`

Input schema from `apps/backend/types.ts`:

```ts
{
  githubUrl: string;
  resumeText: string;
}
```

Processing:

1. Validates request body with `PreInterviewRequestSchema`.
2. Normalizes a trailing slash off the GitHub URL.
3. Extracts the final path segment as the GitHub username.
4. Calls `scrapeGithub(username)`.
5. Calls `parseResume(resumeText)`.
6. Calls `generateJobMatchFeedback(resumeData, githubData)`.
7. Stores an `Interview` row with:
   - GitHub metadata
   - parsed resume data
   - JD feedback
   - status `pre`
   - score from JD feedback
8. Returns the interview ID and computed context.

Error behavior:

- Invalid request body returns `411`.
- Invalid GitHub URL returns `400`.
- GitHub 404 returns `404`.
- Other GitHub/API transport errors return `502`.
- Malformed JSON returns `400`.
- Unhandled errors return `500`.

#### `GET /api/v1/gemini/session`

Processing:

1. Calls `createEphemeralToken()`.
2. Returns `{ token }`.

The token is used by the frontend to connect directly to the Gemini Live WebSocket API.

#### `GET /api/v1/interviews/:id/context`

Processing:

1. Looks up an interview by ID.
2. Selects:
   - `id`
   - `githubMetadata`
   - `resumeData`
   - `jdFeedback`
3. Returns `404` if not found.
4. Returns the stored context if found.

### Request Validation

`apps/backend/types.ts`

- Uses Zod to validate `githubUrl` and `resumeText`.
- `resumeText` must be non-empty.
- `githubUrl` is typed as string but is not currently validated as a URL.

### GitHub Scraper

`apps/backend/scrapers/github.ts`

Responsibilities:

- Calls `https://api.github.com/users/:username/repos`.
- Uses GitHub JSON API headers and an app-specific user agent.
- Applies optional proxy support through `httpsAgent`.
- Maps the GitHub response to a smaller repo metadata structure:
  - `description`
  - `name`
  - `fullName`
  - `starCount`

### Resume Parser

`apps/backend/lib/resumeParser.ts`

Responsibilities:

- Normalizes text line endings and repeated spaces.
- Extracts:
  - candidate name
  - email
  - phone
  - education-related lines
  - work-related lines
  - known skill keywords
  - approximate years of experience
  - raw normalized text

The parser is deterministic and regex/keyword based. It does not call an LLM.

### JD Feedback Agent

`apps/backend/agents/jdFeedbackAgent.ts`

Responsibilities:

- Reads `apps/backend/jd.txt`.
- Extracts up to 40 significant keywords from the job description.
- Builds candidate signal text from resume skills, work, education, and GitHub repo names/descriptions.
- Computes a keyword-overlap score.
- Returns:
  - `score`
  - `summary`
  - `matchedSignals`
  - `missingSignals`

Despite the `Agent` name, the current implementation is deterministic keyword matching and does not call an LLM.

### Gemini Token Sideband

`apps/backend/sideband.ts`

Responsibilities:

- Calls `https://generativelanguage.googleapis.com/v1alpha/auth_tokens`.
- Uses `GEMINI_API_KEY` from environment variables.
- Creates a single-use token.
- Sets token expiration to 30 minutes.
- Sets new session expiration to 60 seconds.
- Applies optional proxy support through `httpsAgent`.

### Proxy Configuration

`apps/backend/proxy.ts`

- If `PROXY_URL` exists, exports an `HttpsProxyAgent`.
- If not, exports `undefined`.
- GitHub and Gemini token calls both pass this agent and disable Axios proxy auto-detection with `proxy: false`.

## Database Design

### Prisma Schema

`apps/backend/prisma/schema.prisma`

#### `Interview`

Fields:

- `id`: UUID primary key
- `githubMetadata`: JSON
- `resumeData`: JSON
- `jdFeedback`: nullable JSON
- `status`: `InterviewStatus`
- `score`: integer, default `0`
- `conversations`: relation to `Message[]`

#### `Message`

Fields:

- `id`: UUID primary key
- `message`: text
- `type`: `MessageType`
- `interviewId`: foreign key to `Interview`
- `interview`: Prisma relation

#### Enums

`MessageType`:

- `User`
- `Assistant`

`InterviewStatus`:

- `pre`
- `InProgress`
- `Done`

### Current Persistence Behavior

Currently persisted:

- Interview GitHub metadata
- Parsed resume data
- JD feedback
- Initial status
- Initial score

Schema-supported but not currently persisted by API routes:

- Live conversation messages
- Interview status transitions from `pre` to `InProgress` or `Done`
- Final interview result/evaluation beyond initial JD-fit score

## Data Flow Details

### Pre-Interview Data Flow

```text
Form.tsx
  -> POST /api/v1/pre-interview
    -> PreInterviewRequestSchema
    -> scrapeGithub()
      -> GitHub API
    -> parseResume()
    -> generateJobMatchFeedback()
      -> jd.txt
    -> prisma.interview.create()
      -> PostgreSQL
  <- interviewId + githubData + resumeData + jdFeedback
  -> navigate("/interview/:interviewId")
```

### Live Interview Data Flow

```text
Interview.tsx
  -> GET /api/v1/gemini/session
    -> createEphemeralToken()
      -> Gemini auth token API

Interview.tsx
  -> GET /api/v1/interviews/:id/context
    -> prisma.interview.findUnique()

Interview.tsx
  -> buildSystemInstruction(context)
  -> GeminiLiveAPI.connect()
    -> Gemini Live WebSocket

AudioStreamer
  -> microphone
  -> AudioWorklet
  -> Float32 samples
  -> PCM16
  -> base64
  -> Gemini realtimeInput.audio

Gemini Live API
  -> base64 PCM audio
  -> AudioPlayer
  -> AudioWorklet queue
  -> speakers

Gemini Live API
  -> input/output transcription events
  -> React transcript state
  -> chat bubbles
```

## API Contracts

### `POST /api/v1/pre-interview`

Request:

```json
{
  "githubUrl": "https://github.com/example-user",
  "resumeText": "Plain text resume content"
}
```

Success response:

```json
{
  "interviewId": "uuid",
  "githubData": [],
  "resumeData": {},
  "jdFeedback": {
    "score": 0,
    "summary": "",
    "matchedSignals": [],
    "missingSignals": []
  }
}
```

Main error responses:

- `411`: invalid request body
- `400`: GitHub username could not be extracted
- `404`: GitHub user not found
- `502`: GitHub API or network/proxy failure
- `500`: unexpected backend failure

### `GET /api/v1/gemini/session`

Returns a single-use Gemini Live ephemeral token:

```json
{
  "token": "ephemeral-token-name"
}
```

### `GET /api/v1/interviews/:id/context`

Returns stored pre-interview context:

```json
{
  "id": "uuid",
  "githubMetadata": {},
  "resumeData": {},
  "jdFeedback": {}
}
```

Returns `404` if the interview ID is not found.

## Configuration

### Required Environment Variables

Backend:

- `DATABASE_URL`: PostgreSQL connection string for Prisma.
- `GEMINI_API_KEY`: Google Generative Language API key used to mint ephemeral Gemini Live tokens.

Optional backend variables:

- `FRONTEND_URL`: allowed CORS origin. Defaults to `http://localhost:3000`.
- `PROXY_URL`: HTTPS proxy URL for GitHub and Gemini token calls.

Frontend:

- `BACKEND_URL` is currently a source constant in `apps/frontend/src/config.ts`, not an environment variable.

## Runtime Ports

- Backend Express API: `http://localhost:3001`
- Frontend Bun server: Bun chooses and logs `server.url`; the backend CORS default expects `http://localhost:3000` unless `FRONTEND_URL` is set.

## Design Notes and Gaps

- The repo is still partially based on a Turborepo starter. The root README and shared `packages/ui` package do not fully describe the actual app.
- The frontend talks directly to Gemini Live using a server-minted ephemeral token. This keeps the long-lived API key on the backend while avoiding proxying the live audio stream through Express.
- The backend stores pre-interview context but does not yet store the live interview transcript.
- `Message` and `InterviewStatus` indicate an intended future lifecycle, but no route currently writes messages or updates interview status.
- The `Result` page is a placeholder and is not connected to persisted interview results.
- Resume parsing and JD-fit feedback are deterministic heuristics. They are fast and simple, but less robust than structured document parsing or LLM-based extraction.
- `githubUrl` is only checked as a string and parsed by final path segment. It should be hardened if arbitrary GitHub URL formats are expected.

## Security and Privacy Notes

- Resume text-derived data, GitHub metadata, and JD feedback are stored in PostgreSQL.
- The live Gemini system instruction includes private candidate context from the stored interview record.
- The backend keeps `GEMINI_API_KEY` server-side and only returns short-lived ephemeral tokens to the browser.
- There is no authentication or ownership check yet. Any client that knows an interview ID can call the context endpoint.
- CORS is manually restricted to `FRONTEND_URL` or the default local frontend origin.
