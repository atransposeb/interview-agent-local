# Module 2 — Data Layer

_Files covered:_

- `apps/backend/prisma/schema.prisma`
- `apps/backend/prisma/db.ts`
- `apps/backend/prisma.config.ts`
- `apps/backend/prisma/migrations/20260713131418_init/migration.sql`
- `apps/backend/prisma/migrations/20260718120000_add_resume_data/migration.sql`
- `apps/backend/prisma/migrations/migration_lock.toml`
- `apps/backend/generated/prisma/` (generated, gitignored)
- `apps/backend/types.ts`
- `apps/backend/.env` (for `DATABASE_URL`)

_Where we are:_ Module 1 established the monorepo shell: Turborepo orchestrates, Bun runs TypeScript directly, and half the scaffolding is dead. Now we go inside the backend and look at what it persists and how. This module defines the domain vocabulary — Interview, Message, status — that every subsequent module references. It's also where the project's biggest gap between _declared_ structure and _actual_ behavior lives.

_The one-line thesis:_ The data layer declares a relational model with status transitions and conversation persistence, but in practice it's a write-once JSON store — only `create` and `findUnique` are ever called, conversations are never persisted, and status never advances past `"pre"`.

---

## 2.1 Prerequisites — the absolute basics

### ORM (Object-Relational Mapping)

An ORM maps database tables to objects in your programming language, so you write `prisma.interview.create({ data: {...} })` instead of `INSERT INTO "Interview" VALUES (...)`. The benefit is type safety (the compiler knows what columns exist) and portability (you can change databases without rewriting queries). The cost is abstraction leakage: complex queries are harder to express, and you can accidentally generate inefficient SQL.

### Prisma specifically

**Prisma** is a TypeScript-first ORM. Unlike ActiveRecord or Sequelize, Prisma generates a typed client from a schema file (`schema.prisma`). The workflow:

1. You write `schema.prisma` — it declares models, fields, relations, and enums.
2. You run `prisma generate` — it reads the schema and produces TypeScript code in an output directory.
3. You run `prisma migrate dev` — it diffs the schema against the database and generates SQL migration files.
4. Your app imports `PrismaClient` from the generated directory and uses it to query.

The generated client is **not committed to Git** (gitignored at `apps/backend/.gitignore` line 36: `/generated/prisma`). This means anyone cloning the repo must run `prisma generate` before the backend compiles.

### Prisma driver adapters

Prisma traditionally uses its own binary "query engine" — a Rust process that sits between your Node.js app and the database. Starting with Prisma 5+, you can use **driver adapters** instead, which let Prisma delegate to a JavaScript database driver. This project uses `@prisma/adapter-pg`, which delegates to the `pg` npm package (the standard Node.js PostgreSQL client). The benefit: no Rust binary, better compatibility with Bun (which has had issues with Prisma's binary engine). The cost: slightly different performance characteristics and some features may not be available.

### JSONB

PostgreSQL's `JSONB` type stores JSON data in a binary format that supports indexing, querying, and containment operators. When Prisma declares a field as `Json`, it maps to `JSONB` in PostgreSQL. This is a schemaless-within-schema approach: the outer table structure is fixed, but the contents of the JSON columns are untyped at the database level.

### Zod

**Zod** is a TypeScript schema validation library. You declare a schema (like `z.object({ githubUrl: z.string() })`), then call `.safeParse(data)` to validate input. Unlike TypeScript types (which are erased at runtime), Zod schemas validate at runtime. Zod is used here for HTTP request validation — the boundary where untrusted data enters the system.

### UUID

A **UUID** (Universally Unique Identifier) is a 128-bit identifier, usually represented as 36 characters like `550e8400-e29b-41d4-a716-446655440000`. Prisma's `@default(uuid())` generates a v4 UUID (random) for every new row. The alternative is auto-incrementing integers (`@default(autoincrement())`). UUIDs are harder to guess (security benefit), don't leak creation order, and work across distributed systems. They cost 36 bytes per ID vs. 4-8 bytes for integers, and are slower to index.

---

## 2.2 The schema — `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model Interview {
  id             String            @id @default(uuid())
  githubMetadata Json
  resumeData     Json
  jdFeedback     Json?
  status         InterviewStatus
  score          Int               @default(0)
  conversations  Message[]
}

model Message {
  id            String        @id @default(uuid())
  message       String
  type          MessageType
  interviewId   String
  interview     Interview     @relation(fields: [interviewId], references: [id])
}

enum MessageType {
  User
  Assistant
}

enum InterviewStatus {
  pre
  InProgress
  Done
}
```

### Generator block

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}
```

- **`provider = "prisma-client"`** — uses Prisma's standard client generator (Prisma 7 renamed this from `"prisma-client-js"`).
- **`output = "../generated/prisma"`** — generates into `apps/backend/generated/prisma/` rather than the default `node_modules/.prisma/client`. This explicit output path means imports look like `from "./generated/prisma/client"` instead of `from "@prisma/client"`.

**Why the explicit output?** The default location inside `node_modules` is fragile — any `bun install` or `npm install` can wipe `node_modules`, deleting the generated client. An explicit output directory survives dependency installs. It's gitignored, so you still need to regenerate after cloning, but at least a casual `bun install` doesn't break your running server.

### Datasource block

```prisma
datasource db {
  provider = "postgresql"
}
```

Note what's **missing**: there's no `url` field here. In older Prisma versions, you'd write `url = env("DATABASE_URL")`. In Prisma 7 with the config file approach, the URL is provided via `prisma.config.ts` (covered in section 2.4). This is the newer pattern.

### The `Interview` model

```prisma
model Interview {
  id             String            @id @default(uuid())
  githubMetadata Json
  resumeData     Json
  jdFeedback     Json?
  status         InterviewStatus
  score          Int               @default(0)
  conversations  Message[]
}
```

Field by field:

| Field            | Type              | Nullable? | Default                 | What it stores                                                                                  |
| ---------------- | ----------------- | --------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| `id`             | `String`          | No        | `uuid()`                | Primary key, auto-generated UUID                                                                |
| `githubMetadata` | `Json` (JSONB)    | No        | none                    | Array of `{ name, description, fullName, starCount }` objects from GitHub API                   |
| `resumeData`     | `Json` (JSONB)    | No        | `'{}'` (from migration) | Parsed resume object: `{ name, email, phone, college, work, skills, experienceYears, rawText }` |
| `jdFeedback`     | `Json?` (JSONB)   | **Yes**   | null                    | Job match feedback: `{ score, summary, matchedSignals, missingSignals }`                        |
| `status`         | `InterviewStatus` | No        | none                    | Enum: `pre`, `InProgress`, `Done`                                                               |
| `score`          | `Int`             | No        | `0`                     | The JD match percentage score (0–100)                                                           |
| `conversations`  | `Message[]`       | —         | —                       | Relation: one interview has many messages                                                       |

**The JSON-heavy design.** Three of the six data fields are `Json`/`Json?`. This means the database cannot enforce the structure of the most important data (GitHub profile, resume, feedback). If the resume parser changes its output shape, old rows become structurally inconsistent with new rows, and there's no migration to fix them — the database doesn't know what's inside the JSON.

**The alternative was explicit columns:** `resume_name String?`, `resume_email String?`, `resume_skills String[]`, etc. This would give you column-level type safety, queryability (find all interviews where `resume_skills` contains `"react"`), and schema evolution through migrations. The tradeoff: more columns, more migration work when the shape changes, and the GitHub API response would need flattening.

**The condition under which the answer flips:** If you need to query _within_ the interview data — "find all candidates with React experience" or "show me interviews with a score above 80" — JSON columns force you into PostgreSQL's `@>` containment operators or `->>` path extraction, which are slower and harder to index. The current app only does `create` and `findUnique`, so queryability doesn't matter _yet_. It would matter the moment you add search, filtering, or analytics.

### `jdFeedback` is nullable but `resumeData` is not

Look at the nullability: `resumeData Json` (required) vs `jdFeedback Json?` (optional). But the code always creates both in the same request:

```typescript
const resumeData = parseResume(data.resumeText);
const jdFeedback = await generateJobMatchFeedback(resumeData, githubData);

const interview = await prisma.interview.create({
    data: {
        githubMetadata: githubData,
        resumeData: resumeData as unknown as Prisma.InputJsonValue,
        jdFeedback: jdFeedback as unknown as Prisma.InputJsonValue,
        status: "pre",
        score: jdFeedback.score,
    },
});
```

The `jdFeedback` is always present because `generateJobMatchFeedback` always returns an object (even when `jd.txt` is empty, it returns `{ score: 0, summary: "...", matchedSignals: [], missingSignals: [] }`). The nullable schema was likely designed for a future where feedback generation is optional or deferred, but that future hasn't arrived. The nullability is unused — every row will have `jdFeedback`.

### The `Message` model — declared but never used

```prisma
model Message {
  id            String        @id @default(uuid())
  message       String
  type          MessageType
  interviewId   String
  interview     Interview     @relation(fields: [interviewId], references: [id])
}
```

I verified by grep: `prisma.message` appears **zero times** in the entire codebase. The `Message` table exists in the database (created by the init migration), but no code ever writes to it or reads from it. Conversations happen in-memory in the React frontend via `useState<ChatMessage[]>([])` and over the Gemini WebSocket — they are never persisted.

**Concrete consequence:** Every interview conversation is lost the moment the browser tab closes or the WebSocket disconnects. There's no history, no replay, no audit trail. The `Message` model was clearly intended for persistence, but the implementation never got there.

### The `InterviewStatus` enum — a state machine that never advances

```prisma
enum InterviewStatus {
  pre
  InProgress
  Done
}
```

The intended lifecycle:

```
pre → InProgress → Done
```

The actual lifecycle:

```
pre  (and nothing else)
```

I verified: the string `"InProgress"` and `"Done"` appear **nowhere** in the backend TypeScript code outside the generated Prisma files. No API route transitions status. The `pre` status is set at creation time and never updated. This is the most visible gap between the schema's intent and the code's behavior.

### Inconsistent enum casing

The `InterviewStatus` enum mixes casing conventions:

```prisma
enum InterviewStatus {
  pre          ← lowercase
  InProgress   ← PascalCase
  Done         ← PascalCase
}
```

This looks like `pre` was added first (perhaps as a quick placeholder), and `InProgress`/`Done` were added later with proper naming, but `pre` was never normalized. It works — PostgreSQL enum values are case-sensitive strings — but it's cosmetically inconsistent.

---

## 2.3 The Prisma client — `prisma/db.ts`

```typescript
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
});

export const prisma = new PrismaClient({
    adapter,
});
```

### What each line does

1. **`PrismaPg` adapter** — creates a PostgreSQL connection using the `pg` npm package under the hood. The `connectionString` is read from `process.env.DATABASE_URL`. The `!` (non-null assertion) assumes the environment variable exists. If `DATABASE_URL` is missing, `PrismaPg` will receive `undefined` as the connection string, and the behavior depends on the `pg` driver — it may throw, or it may try to connect to `localhost:5432` with default credentials.
2. **`PrismaClient({ adapter })`** — creates the Prisma client using the driver adapter instead of the default binary query engine. This is Prisma 7's recommended approach for JavaScript/TypeScript-native database access.
3. **Module-level singleton** — `export const prisma` creates exactly one `PrismaClient` instance at import time. This is the standard pattern. The alternative (creating a new client per request) would open a new connection pool per request, which would exhaust database connections.

**What's missing: connection pooling configuration.** The `PrismaPg` adapter uses `pg.Pool` internally with default settings. The defaults are: `max: 10` connections, no idle timeout, no connection timeout. For a single-server setup with low traffic, this is fine. Under load, 10 connections can become a bottleneck.

**What's missing: graceful shutdown.** There's no `prisma.$disconnect()` call on process exit (`SIGTERM`, `SIGINT`). Prisma's adapter will clean up when the process exits, but explicit disconnection is a best practice for preventing connection leaks in serverless or container environments.

---

## 2.4 Prisma configuration — `prisma.config.ts`

```typescript
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

This is a Prisma 7 feature: instead of putting `url = env("DATABASE_URL")` in `schema.prisma`, you use a TypeScript config file. The key line is `import "dotenv/config"` at the top — this loads `.env` before Prisma reads the config, so `env("DATABASE_URL")` resolves correctly.

**Important distinction:** This file is used by the Prisma CLI (`prisma migrate`, `prisma generate`) — not by the runtime application. The application reads `DATABASE_URL` via `process.env` in `db.ts`. The `prisma.config.ts` file exists so the CLI tools know where to find the database when running migrations.

---

## 2.5 The migrations — what's actually in the database

### Migration 1: `20260713131418_init` (July 13, 2026)

```sql
-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('User', 'Assistant');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('pre', 'InProgress', 'Done');

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "githubMetadata" JSONB NOT NULL,
    "status" "InterviewStatus" NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "MessageType" NOT NULL,
    "interviewId" TEXT NOT NULL,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_interviewId_fkey"
  FOREIGN KEY ("interviewId") REFERENCES "Interview"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

Note what the initial schema **didn't have**: `resumeData` and `jdFeedback`. The first version only stored `githubMetadata`. This tells us the project started as a GitHub-profile-based interviewer and the resume/JD features were added 5 days later.

**`ON DELETE RESTRICT`** — if you try to delete an Interview that has Messages, PostgreSQL will refuse. This is Prisma's default referential action. Since Messages are never created, this constraint is never tested. If Messages were created and you later wanted to delete an Interview (e.g., to support a "delete my data" feature), you'd hit this constraint and need to either delete Messages first or change the action to `CASCADE`.

### Migration 2: `20260718120000_add_resume_data` (July 18, 2026)

```sql
ALTER TABLE "Interview" ADD COLUMN "resumeData" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Interview" ADD COLUMN "jdFeedback" JSONB;
```

Two columns added to `Interview`:

- `resumeData` — `NOT NULL` with a default of `'{}'` (empty JSON object). The default is necessary because existing rows (from before this migration) need a value. In production, any interviews created between July 13–18 would have `resumeData = '{}'`.
- `jdFeedback` — nullable, no default. Existing rows get `NULL`.

**The `DEFAULT '{}'` is a data integrity concern.** An empty JSON object `{}` does not match the `ResumeData` interface (`{ name, email, phone, college, work, skills, experienceYears, rawText }`). If any code reads an old row's `resumeData` and assumes it has the full structure, it would get `undefined` for every field. The runtime wouldn't crash (JavaScript handles missing properties gracefully), but the data would be silently wrong.

### Migration lock

```toml
provider = "postgresql"
```

This lock file ensures all migrations use the same database provider. If someone tried to switch from PostgreSQL to MySQL without resetting migrations, Prisma would refuse. It's version-controlled by design.

---

## 2.6 Request validation — `types.ts`

```typescript
import z from "zod";

export const PreInterviewRequestSchema = z.object({
    githubUrl: z.string(),
    resumeText: z.string().min(1),
});
```

This is the entire validation layer for the pre-interview endpoint. Two fields, two rules:

1. `githubUrl` must be a string. Not validated as a URL — `z.string().url()` would enforce URL format, but it's not used. Any string passes, including `""`.
2. `resumeText` must be a string of at least 1 character. The `.min(1)` prevents empty strings but allows a single space.

**What it costs:** The `githubUrl` field accepts any string, so the validation that it's actually a GitHub URL happens later — in `index.ts`, where the code strips a trailing `/` and calls `.split("/").pop()` to extract the username. If someone sends `githubUrl: "not a url"`, the code would try to call `https://api.github.com/users/not a url/repos` and get a 404 from GitHub, which is handled. So the system works, but the validation is in the wrong place — it's spread across Zod (existence), string manipulation (format), and the GitHub API (validity).

**The alternative:** `z.string().url().includes("github.com")` would reject malformed input at the validation layer with a clean 411 response, instead of letting it propagate to an API call that returns a 404 or 502.

### The `as unknown as Prisma.InputJsonValue` double-cast

In `index.ts`, the resume and feedback data are cast before insertion:

```typescript
resumeData: resumeData as unknown as Prisma.InputJsonValue,
jdFeedback: jdFeedback as unknown as Prisma.InputJsonValue,
```

This is a **double cast** (first to `unknown`, then to `Prisma.InputJsonValue`). It's needed because the `ResumeData` interface has typed fields (`name: string | null`, `skills: string[]`, etc.), and Prisma's `InputJsonValue` type is a recursive JSON type (`string | number | boolean | null | InputJsonValue[] | { [key: string]: InputJsonValue }`). TypeScript won't directly cast between them because they're structurally different (the interface has named properties, `InputJsonValue` has index signatures).

The `as unknown` intermediate step tells TypeScript "I know what I'm doing, forget the type." This is a code smell — it means the type system can't verify that the data going into the JSON column is valid. But it's the standard workaround for Prisma's JSON columns. There's no real alternative without rewriting the types to extend `InputJsonValue`.

---

## 2.7 The connection string — what's in `.env`

```
DATABASE_URL="postgresql://postgres:<password>@localhost:5432/interviewer"
```

Breaking this down:

- **Protocol:** `postgresql://`
- **User:** `postgres` (the default superuser — not a dedicated application user)
- **Password:** redacted here on purpose. Special characters must be URL-encoded (`@` becomes `%40`), a classic source of "authentication failed" errors.
- **Host:** `localhost:5432` (default PostgreSQL port)
- **Database:** `interviewer`

**Security concerns:**

1. `.env` is **not** committed. `apps/backend/.gitignore` lists it, and `git log --all -- apps/backend/.env` returns nothing, so the credentials have never been in Git history. The real leak risk is copying `.env` values into docs, notes, or screenshots — which is why the password is redacted above. `apps/backend/.env.example` documents the variable names without values.
2. The `postgres` superuser has full database privileges. Best practice is a dedicated application user with only the permissions it needs.
3. Rotate the password if it was ever shared outside this machine.

---

## 2.8 How the data layer is actually used — only two operations

Across the entire codebase, the Prisma client is used exactly twice:

### Operation 1: `prisma.interview.create()` — in `POST /api/v1/pre-interview`

```typescript
const interview = await prisma.interview.create({
    data: {
        githubMetadata: githubData,
        resumeData: resumeData as unknown as Prisma.InputJsonValue,
        jdFeedback: jdFeedback as unknown as Prisma.InputJsonValue,
        status: "pre",
        score: jdFeedback.score,
    },
});
```

Creates one row. Returns the full row including the generated UUID `id`.

### Operation 2: `prisma.interview.findUnique()` — in `GET /api/v1/interviews/:id/context`

```typescript
const interview = await prisma.interview.findUnique({
    where: { id: req.params.id },
    select: {
        id: true,
        githubMetadata: true,
        resumeData: true,
        jdFeedback: true,
    },
});
```

Reads one row by UUID. Uses `select` to exclude `status`, `score`, and `conversations` from the response. Returns `null` if not found.

**That's it.** No updates, no deletes, no list queries, no pagination, no filtering, no joins. The database is a write-once, read-by-ID store. You could replace it with a key-value store (Redis, a JSON file) and lose nothing.

---

## 2.9 Honest gaps to own before an interviewer finds them

1. **The `Message` model is dead code.** A table exists in the database with a foreign key back to `Interview`, but nothing writes to it. Every conversation is lost when the browser closes. Consequence: no interview history, no post-interview review, no analytics. An interviewer will ask "where do you store the conversation?" and the answer is "I don't."
2. **The `InterviewStatus` state machine is unimplemented.** Three states are declared, only one is used. There's no transition logic, no endpoint to mark an interview as started or completed. Consequence: the `status` column is always `"pre"` — it conveys zero information. The `score` column is always the JD keyword match score, never an interview performance score (which would require the `Done` transition).
3. **No timestamps.** Neither model has `createdAt` or `updatedAt` fields. You cannot answer "when was this interview created?" without checking PostgreSQL's internal `xmin` transaction IDs, which is not practical. Consequence: no ability to expire old data, sort by recency, or build a timeline.
4. **No indexes beyond the primary key.** The `interviewId` column on `Message` has no index (Prisma doesn't auto-index FK columns in PostgreSQL). If Messages were ever populated, joining on `interviewId` would require a sequential scan. For a small table this is fine; at scale it's a problem. But since `Message` is never used, this is academic.
5. **The database connects as the `postgres` superuser.** `.env` itself is gitignored and has never been committed (verified with `git log --all -- apps/backend/.env`), but the app uses a superuser account, so any bug that allows arbitrary SQL would have full database privileges. Consequence: a dedicated least-privilege user is needed before deploying.
6. **`resumeData` default of `'{}'` is structurally inconsistent.** Old rows (pre-migration-2) have `resumeData = '{}'`, which doesn't match the `ResumeData` interface. Any code that reads `resumeData.name` on those rows gets `undefined`, not `null`. This is a silent data integrity gap.
7. **The `githubUrl` is validated as "any string."** Zod checks it's a string but not a URL, not a GitHub URL, and not even non-empty (unlike `resumeText` which has `.min(1)`). An empty `githubUrl` would pass validation, fail at the `.split("/").pop()` step (returning `""`), and then call the GitHub API with an empty username.
8. **No connection pool configuration or graceful shutdown.** The Prisma client uses default `pg` pool settings and never calls `$disconnect()`. In a long-running server this is generally fine, but in any serverless or container deployment, connections could leak.

---

## The shape to carry into Module 3

```
┌─────────────────────────────────────────────────────┐
│  PostgreSQL (localhost:5432/interviewer)             │
│                                                     │
│  ┌─────────────┐    ┌─────────────┐                │
│  │  Interview   │    │  Message    │                │
│  │─────────────│    │─────────────│                │
│  │ id       PK │←──┐│ id       PK │                │
│  │ githubMeta  │    ││ message     │                │
│  │ resumeData  │    ││ type        │                │
│  │ jdFeedback? │    ││ interviewId │────→ FK        │
│  │ status      │    │└─────────────┘  NEVER USED   │
│  │ score       │    │                               │
│  └─────────────┘    │                               │
│  USED: create,      │                               │
│  findUnique          │                               │
└─────────────────────────────────────────────────────┘

       ▲                            ▲
       │ process.env.DATABASE_URL   │ never imported
       │                            │
  ┌────┴────────┐            ┌──────┴───────┐
  │ prisma/db.ts │            │ Message model │
  │ PrismaPg     │            │ (dead code)   │
  │ adapter      │            └──────────────┘
  └─────────────┘

  ┌─────────────┐
  │  types.ts   │   Zod schema: { githubUrl: string, resumeText: string.min(1) }
  └─────────────┘   ← input boundary for POST /api/v1/pre-interview
```

Module 3 covers the environment loading, the `.env` secrets, and the HTTP proxy — how the server gets its configuration and reaches external APIs.

---

## Drill — answer from memory, files closed

1. **Why did you use JSON columns instead of normalized relational columns for the resume and GitHub data?**
2. **Your schema has `Message` and `InterviewStatus` with three states. Walk me through the interview lifecycle.**
3. **What breaks in production if someone deletes the `.env` file on the deployed server?**
4. **Why didn't you just use SQLite instead of PostgreSQL for a project with two queries?**
5. **An interviewer asks: "How do you ensure data consistency between what the resume parser outputs and what the database stores?" What's your answer?**

---

# Appendix A — Model answers to the drill

### 1. "Why JSON columns?"

"Pragmatism. The GitHub API response and the resume parser output both have nested, variable structures — a repo might or might not have a description, the parser might extract zero or eight colleges. Normalizing that into separate tables (a `RepoMetadata` table with FK to Interview, a `Skill` junction table) would have tripled the schema complexity for data that's only ever read as a blob to inject into the Gemini system prompt. I read it back as a whole object, never query within it. If I needed to search — 'find all candidates who know React' — I'd migrate the skills into a `String[]` column with a GIN index, or normalize into a join table. But for write-once, read-as-blob, JSON is the right call."

**Why this answer lands:** It names the concrete tradeoff (queryability vs. schema simplicity), gives the specific trigger for changing the answer (search/filter), and doesn't pretend JSON columns are always good. It avoids the generic "JSON is flexible" non-answer.

### 2. "Walk me through the interview lifecycle."

"Honestly, the lifecycle is unfinished. The schema declares three states — `pre`, `InProgress`, and `Done` — but the code only ever writes `pre`. The `Message` model was designed to store the conversation, but right now conversations happen over a real-time WebSocket with Gemini and live only in the browser's React state. When the user closes the tab, the conversation is gone. The status never transitions because there's no endpoint to mark an interview as started or complete. If I were to finish this, I'd add a `PATCH /api/v1/interviews/:id/status` endpoint, transition to `InProgress` when the Gemini WebSocket connects, and transition to `Done` when it disconnects, while writing each transcription chunk to the `Message` table via a separate backend WebSocket relay."

**Why this answer lands:** It's honest about what's missing instead of trying to describe the schema as if it's fully wired up. An interviewer who has read the code will know the lifecycle is incomplete — claiming otherwise would be a credibility hit. The sentence about _how_ you'd fix it shows you've thought about it, not just left it broken.

### 3. "What breaks if `.env` is deleted on the server?"

"The backend starts but immediately fails on the first database or Gemini API call. The `PrismaPg` adapter receives `undefined` as the connection string because `process.env.DATABASE_URL` is undefined. Depending on the `pg` driver's behavior, it either throws at construction time or tries to connect to `localhost:5432` with no credentials. Either way, every route that touches the database returns a 500. The Gemini session endpoint would also fail because `process.env.GEMINI_API_KEY` would be undefined, and the Google API would reject the request. The Express error handler would catch these and return `{ message: 'Unexpected server error' }` without any detail — so debugging would require checking server logs, where `console.error(error)` would print the actual exception."

**Why this answer lands:** It traces the failure path through specific code — `PrismaPg`, the error handler, `console.error` — rather than vaguely saying "it would break." It shows you know the error handling topology.

### 4. "Why not SQLite?"

"For a project with two queries, SQLite would have been a perfectly valid choice. It would eliminate the PostgreSQL dependency entirely — no Docker, no database process, no connection string. The Prisma schema change would be one line: `provider = 'sqlite'`. What I'd lose is JSONB — SQLite has JSON functions but they're less powerful and less indexed. I'd also lose the option of connecting multiple processes to the same database, which matters if I ever run the backend as multiple instances. But for a single-instance interview tool, SQLite would be simpler and I should have at least considered it. The answer flips when you need concurrent writers, multi-instance deployments, or advanced JSON querying."

**Why this answer lands:** It acknowledges the over-engineering without being self-flagellating. It names what you'd lose concretely (JSONB quality, concurrent access) and what you'd gain (no external dependency). The "I should have at least considered it" is honest without saying the choice was wrong.

### 5. "How do you ensure data consistency between parser output and database?"

"Right now, I don't — and that's a gap. The resume parser returns a `ResumeData` TypeScript interface with fields like `name: string | null`, `skills: string[]`. But the database column is `Json` (JSONB), which is untyped at the database level. The TypeScript type is erased at runtime, so the database stores whatever JavaScript object it receives. If I changed the parser to return a different shape — say, renaming `skills` to `technologies` — old rows would have the old shape and new rows the new shape, and nothing would catch it. The `as unknown as Prisma.InputJsonValue` double-cast in the insertion code literally tells TypeScript to stop checking. To fix this, I'd either normalize the critical fields into typed columns, or add a runtime validation step (Zod schema for `ResumeData`) on read to detect shape mismatches."

**Why this answer lands:** It exposes a real weakness (the double-cast, the lack of runtime validation on read) and proposes two concrete fixes. It signals awareness that TypeScript types alone don't protect data at rest.

---

# Module 2 Summary — the one page to revise

**What this module is:** The Prisma data layer that defines the domain model and persists interview data to PostgreSQL. It declares a richer schema than the code uses — conversations and status transitions are modeled but not implemented, making the database a write-once JSON store accessed by UUID.

**Five claims to make cold:**

1. The database has two tables (`Interview`, `Message`), but only `Interview` is used — `Message` is dead code.
2. Only two Prisma operations exist in the entire codebase: `create` and `findUnique` on `Interview`.
3. The `InterviewStatus` enum has three values but only `"pre"` is ever written — the state machine is unimplemented.
4. Three of six `Interview` fields are JSON columns — no database-level type enforcement for the most important data.
5. No timestamps, no indexes beyond PKs, no graceful shutdown — the data layer is minimal.

**Decisions table:**

| Chose                                      | Over                                    | Because                                                            | Cost                                                                      |
| ------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| JSON columns for resume/github data        | Normalized relational columns           | Data is read as a blob for the Gemini prompt, never queried within | No database-level type enforcement, no indexed search within fields       |
| UUID primary keys                          | Auto-incrementing integers              | Non-guessable, no ordering leak, distributed-friendly              | 36 bytes per ID, slower indexing                                          |
| Prisma `@prisma/adapter-pg` driver adapter | Prisma's default binary engine          | Better Bun compatibility, no Rust binary                           | Slightly different feature support                                        |
| `prisma.config.ts` for datasource URL      | Inline `url` in `schema.prisma`         | Prisma 7 recommended pattern, allows dotenv preloading             | Extra file, newer pattern with less community documentation               |
| Zod for request validation                 | Manual `if` checks / Express middleware | Type-safe, composable, clear error messages                        | Extra dependency (though small), validation is too lenient (no URL check) |

**Tradeoffs and gaps to volunteer:**

- "Conversations aren't persisted — that's the biggest functional gap."
- "The status machine is declared but not wired up — I'd add a status transition endpoint."
- "I used JSON columns knowing I can't query within them — the trade is acceptable because data is only read by ID."

**Numbers and names to have ready:**

- Database: PostgreSQL on localhost:5432, database name `interviewer`
- Tables: 2 (`Interview`, `Message`)
- Prisma operations: 2 (`create`, `findUnique`)
- Migrations: 2 (init on July 13, resume data on July 18, 2026)
- Interview fields: 6 (`id`, `githubMetadata`, `resumeData`, `jdFeedback`, `status`, `score`)
- InterviewStatus values: 3 declared (`pre`, `InProgress`, `Done`), 1 used (`pre`)
- JSON columns: 3 (`githubMetadata`, `resumeData`, `jdFeedback`)
- `PrismaPg` adapter — uses the `pg` npm package, not Prisma's binary engine

**Sentences worth memorizing:**

- "The database is a write-once JSON store — I create a row, I read it back by UUID, and that's the entire data access pattern."
- "The Message model and status transitions are declared in the schema but unimplemented in code — conversations live only in browser memory."
- "I used JSON columns because the data is only read as a blob for the Gemini system prompt — if I needed search or filtering, I'd normalize into typed columns."
