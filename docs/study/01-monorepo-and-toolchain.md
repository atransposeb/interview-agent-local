# Module 1 — Monorepo & Toolchain

*Files covered:*
- `package.json` (root)
- `turbo.json`
- `.gitignore` (root)
- `.npmrc`
- `apps/backend/package.json`
- `apps/backend/tsconfig.json`
- `apps/frontend/package.json`
- `apps/frontend/tsconfig.json`
- `apps/frontend/build.ts`
- `apps/frontend/bunfig.toml`
- `apps/frontend/bun-env.d.ts`
- `packages/eslint-config/*` (4 files)
- `packages/typescript-config/*` (4 files)
- `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/eslint.config.mjs`

*Where we are:* This is the first module. Nothing comes before it. Every other module in this project — every route handler, every React component, every database call — runs inside the container this module defines: the monorepo layout, the package manager, the TypeScript compiler settings, and the build pipeline. If you can't explain why these tools were chosen and what they cost, everything downstream sounds like accidental complexity.

*The one-line thesis:* The project uses a Turborepo monorepo with Bun as the runtime and package manager, but the scaffolding was generated from a Next.js-oriented template and only partially adapted — roughly half of the shared infrastructure (configs, packages) is dead code that was never wired into the actual apps.

---

## 1.1 Prerequisites — the absolute basics

### Monorepo

A **monorepo** is a single Git repository that contains multiple packages or applications. The alternative is a **polyrepo**, where each app or library gets its own repository. A monorepo buys you atomic commits across frontend and backend, shared tooling configuration, and a single `git clone` to get everything. It costs you a more complex build system (you need something to figure out what to build when a file changes) and a lockfile that covers every package's dependencies.

### Workspaces

Workspaces are the package manager's way of knowing "these subdirectories are each a separate package, but they share a single `node_modules` tree." In this project, the root `package.json` declares:

```json
"workspaces": [
  "apps/*",
  "packages/*"
]
```

This means any directory under `apps/` or `packages/` with its own `package.json` is treated as a separate package. Dependencies are hoisted to the root `node_modules` where possible, and cross-references between packages resolve via symlinks.

### Bun

**Bun** is an all-in-one JavaScript/TypeScript runtime and toolkit. It replaces Node.js (runtime), npm/yarn/pnpm (package manager), webpack/esbuild/vite (bundler), and jest/vitest (test runner — though no tests exist here). It executes TypeScript directly without a compile step. The key thing for this project: Bun's `serve()` API is the frontend's dev server, and `bun --watch index.ts` is the backend's dev command. Neither app uses `tsc` to compile — TypeScript is consumed directly by Bun's runtime.

### Turborepo

**Turborepo** is a build system for monorepos. It doesn't build anything itself — it orchestrates *when* to run each package's scripts, in what order, and whether to cache the result. It reads `turbo.json` to learn task definitions, then reads each package's `package.json` to find matching `scripts`. When you run `turbo run dev`, it finds every workspace that has a `"dev"` script and runs them (potentially in parallel), respecting any `dependsOn` ordering.

### TypeScript `strict` mode

TypeScript has a `"strict": true` flag that enables a collection of stricter type-checking options: `strictNullChecks` (null and undefined are distinct types), `strictFunctionTypes` (function parameter types checked contravariantly), `noImplicitAny` (variables must have types, not silent `any`), and several others. Both apps enable this. Beyond `strict`, both also enable `noUncheckedIndexedAccess`, which means `array[i]` returns `T | undefined` rather than `T` — forcing you to handle the possibility that an index doesn't exist. This is a meaningful strictness choice; most projects leave it off because it's annoying.

### ESLint flat config

ESLint 9+ uses a "flat config" format: instead of `.eslintrc.json` with `extends`, you export a plain array of config objects from `eslint.config.mjs`. The shared configs in `packages/eslint-config` use this format.

---

## 1.2 The root `package.json` — what it declares vs. what's real

```json
{
  "name": "interviewer",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "format": "prettier --write \"**/*.{ts,tsx,md}\"",
    "check-types": "turbo run check-types"
  },
  "devDependencies": {
    "prettier": "^3.7.4",
    "turbo": "^2.10.4",
    "typescript": "5.9.2"
  },
  "engines": { "node": ">=18" },
  "devEngines": {
    "packageManager": { "name": "bun", "version": "1.3.14" }
  },
  "workspaces": ["apps/*", "packages/*"],
  "dependencies": {
    "cors": "^2.8.6"
  }
}
```

What this does:

- **`"private": true`** — prevents accidental `npm publish` of the root package. Standard for monorepos.
- **`"workspaces"`** — declares `apps/*` and `packages/*` as workspace members.
- **`"devEngines"`** — an advisory field saying "use Bun 1.3.14." Not enforced by anything — Bun doesn't read this field. It's documentation.
- **`"engines": { "node": ">=18" }`** — says Node 18+, but the project runs on Bun, not Node. This is vestigial from the `create-turbo` template.

**Phantom dependency: `cors`.** The root `package.json` declares `"cors": "^2.8.6"` as a production dependency. I verified by grep: `cors` is **never imported** in any source file. The backend implements CORS manually with `res.header("Access-Control-Allow-*")` calls in `index.ts`. The `cors` package was installed and never used.

**Why it matters in an interview:** Phantom dependencies signal that the dependency audit wasn't done. An interviewer who runs `npm ls` or checks `package.json` will see `cors` and expect to find `app.use(cors())` somewhere. When they don't, it looks careless. The honest answer is: "I started with the cors middleware, then switched to manual headers for more control over the OPTIONS handling, and forgot to remove the package."

---

## 1.3 Turborepo configuration — `turbo.json`

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": [".next/**", "!.next/cache/**", "!.next/dev/**"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "check-types": {
      "dependsOn": ["^check-types"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

### What each field does

- **`"ui": "tui"`** — uses Turborepo's terminal UI (the interactive mode that shows per-task output panels). Cosmetic choice.

- **`"build".dependsOn: ["^build"]`** — the `^` prefix means "run `build` in my dependencies before running `build` in me." If the frontend depended on `packages/ui`, it would build `packages/ui` first. In practice, neither app declares a dependency on `packages/ui`, so this ordering is inert.

- **`"build".inputs`** — `$TURBO_DEFAULT$` means "all tracked files." Adding `.env*` means environment file changes also bust the build cache. This is good practice — a different API key shouldn't serve a stale build.

- **`"build".outputs: [".next/**", ...]`** — these are Next.js output directories. **This project does not use Next.js.** The frontend uses Bun's native `serve()` and outputs to `dist/`. This output configuration is wrong for this project — Turbo will cache the wrong files. The build task for the frontend runs `bun run build.ts` which writes to `dist/`, but `dist/` is not listed in outputs.

- **`"dev".cache: false`** — dev servers should never be cached (they're stateful, long-running processes). Correct.

- **`"dev".persistent: true`** — tells Turbo that `dev` tasks don't exit on their own (they're servers). Without this, Turbo would think the task crashed.

### What's missing

The backend `package.json` has no `build`, `lint`, or `check-types` script. When Turbo runs `turbo run build`, it finds nothing to do for the backend workspace and silently skips it. This is fine at runtime (Bun runs TypeScript directly), but it means `turbo run check-types` doesn't type-check the backend. If you want to catch backend type errors in CI, you'd need to add `"check-types": "tsc --noEmit"` to the backend's `package.json`.

---

## 1.4 The two runtimes — why Express on Bun?

The backend's dev command is:

```json
"dev": "bun --watch index.ts"
```

This runs `index.ts` directly on the Bun runtime with file-watching for auto-restart. The file imports Express:

```typescript
import express from "express";
const app = express();
```

**Why use Express when Bun has its own HTTP server?** Bun ships with `Bun.serve()`, which is faster than Express (Bun's own benchmarks claim 4–5× throughput). Express adds overhead: middleware chains, request/response wrapping, the body-parser ecosystem.

The likely reason is familiarity and ecosystem maturity. Express has 20 years of documentation, Stack Overflow answers, and middleware. For a project with three routes and no performance-sensitive workload, the Express overhead is negligible. The cost is the extra dependency and slightly slower startup.

**The alternative:** Use `Bun.serve()` with `Bun.FileSystemRouter` or manual routing. The answer flips when: (a) you need high request throughput (>1000 rps), (b) you want to minimize dependencies, or (c) you're already using Bun-native patterns elsewhere (which the frontend does — see `src/index.ts`).

The frontend dev server, by contrast, *does* use Bun's native `serve()`:

```typescript
import { serve } from "bun";
const server = serve({
  routes: { "/*": index },
  development: process.env.NODE_ENV !== "production" && { hmr: true, console: true },
});
```

So within the same monorepo, one app uses Bun-native serving and the other uses Express-on-Bun. This asymmetry looks arbitrary — there's no technical reason the backend couldn't also use `Bun.serve()`.

---

## 1.5 TypeScript configuration — strict but standalone

### Backend `tsconfig.json`

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": true,
    "types": ["bun"],

    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,

    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,

    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noPropertyAccessFromIndexSignature": false
  }
}
```

Key decisions:

- **`"module": "Preserve"`** — tells TypeScript not to transform import/export statements. Bun handles module resolution at runtime. This is the correct choice for Bun (as opposed to `"NodeNext"` for Node.js).

- **`"types": ["bun"]`** — loads Bun's type definitions globally. This is why `process.env` and `Bun.*` APIs type-check without explicit imports.

- **`"noEmit": true`** — TypeScript is used purely for type checking, not compilation. Bun executes `.ts` files directly.

- **`"noUncheckedIndexedAccess": true`** — the strictest indexed-access check. When you do `array[0]`, the type is `T | undefined`, not `T`. This is a genuinely useful strictness setting that most projects skip because it generates a lot of `!` assertions. It catches real bugs (accessing beyond array bounds) at the cost of verbosity.

- **`"noUnusedLocals": false`** — intentionally disabled. With this on, the unused `@google/genai` import would have been caught (if it had been imported). But since it's only in `package.json` and never imported, even enabling this wouldn't have caught the phantom dependency.

- **`"jsx": "react-jsx"`** — set even though this is the backend. The backend doesn't contain any JSX. This is harmless but unnecessary — a copy from the frontend config.

### Frontend `tsconfig.json`

Nearly identical to the backend, with three differences:

1. **`"lib": ["ESNext", "DOM"]`** — adds DOM type definitions (the backend has only `"ESNext"`, so `document`, `window`, `AudioContext` etc. would not type-check there).
2. **`"types": ["bun", "react"]`** — adds React's global types (JSX namespace).
3. **`"paths": { "@/*": ["./src/*"] }`** — sets up the `@/` import alias used throughout the frontend (`@/components/ui/button`, `@/lib/utils`, etc.).

### The shared configs nobody uses

`packages/typescript-config` contains three config files:

| File | What it configures |
|---|---|
| `base.json` | ES2022 target, NodeNext module resolution, strict mode |
| `nextjs.json` | Extends base, adds Next.js plugin, ESNext module, jsx preserve |
| `react-library.json` | Extends base, adds jsx react-jsx |

**None of these are referenced by either app.** The only consumer is `packages/ui/tsconfig.json`, which extends `react-library.json`. Since `packages/ui` is itself unused (verified: zero imports of `@repo/ui` in the frontend), these shared TypeScript configs are dead infrastructure.

Both apps have standalone `tsconfig.json` files that duplicate much of `base.json`'s content but with Bun-specific settings (`"module": "Preserve"` vs. `"module": "NodeNext"`, `"types": ["bun"]`). This duplication is the correct choice given that the shared config targets Node.js and the apps target Bun — extending the shared config and then overriding half of it would be worse.

---

## 1.6 The frontend build pipeline — `build.ts` and `bunfig.toml`

### Production build: `build.ts`

```typescript
import tailwind from "bun-plugin-tailwind";
import { rm } from "node:fs/promises";
import path from "node:path";

const outdir = path.join(process.cwd(), "dist");
await rm(outdir, { recursive: true, force: true });

const entrypoints = [...new Bun.Glob("src/**/*.html").scanSync()];

const result = await Bun.build({
  entrypoints,
  outdir,
  plugins: [tailwind],
  minify: true,
  target: "browser",
  sourcemap: "linked",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
```

What it does:

1. Deletes `dist/` to ensure a clean build.
2. Finds all `.html` files in `src/` as entry points (there's exactly one: `src/index.html`).
3. Uses `Bun.build()` — Bun's native bundler API (wraps esbuild internally).
4. The `tailwind` plugin processes CSS through Tailwind at build time.
5. `target: "browser"` — bundles for browsers, not Node/Bun. This is important: it means `import { serve } from "bun"` in `src/index.ts` is **not** bundled into the client-side output. The HTML entry point pulls in `frontend.tsx`, which is the React app.
6. `sourcemap: "linked"` — generates separate `.map` files alongside the bundles.
7. `define` — replaces `process.env.NODE_ENV` with `"production"` at compile time (for React's production mode, which strips dev-only warnings).

**Turbo doesn't know about this output.** The `turbo.json` build task lists `.next/**` as outputs, not `dist/**`. If you ran `turbo run build` twice, Turbo's cache would not correctly restore the `dist/` directory, because it doesn't know `dist/` is an output. This is a real bug: Turbo would report a cache hit but the build artifacts would be missing.

### Dev server: `bunfig.toml`

```toml
[serve.static]
plugins = ["bun-plugin-tailwind"]
env = "BUN_PUBLIC_*"
```

This configures Bun's `serve()` static file serving:
- **`plugins`** — loads the Tailwind plugin for on-the-fly CSS processing during development.
- **`env`** — exposes environment variables matching `BUN_PUBLIC_*` to the client bundle. No such variables are currently defined.

---

## 1.7 ESLint configuration — three presets, one consumer

`packages/eslint-config` exports three presets:

| Export | Purpose | Consumed by |
|---|---|---|
| `./base` | TS + Prettier + Turbo env-var lint | `react-internal.js`, `next.js` |
| `./next-js` | Next.js + React hooks rules | **nothing** |
| `./react-internal` | React library rules | `packages/ui/eslint.config.mjs` |

The `next.js` config imports `@next/eslint-plugin-next` — a Next.js-specific ESLint plugin. **This project doesn't use Next.js.** The config exists because `create-turbo` generated it.

`packages/ui` is the only workspace with an `eslint.config.mjs`:

```javascript
import { config } from "@repo/eslint-config/react-internal";
```

Neither `apps/frontend` nor `apps/backend` has any ESLint configuration file. When you run `turbo run lint`, neither app has a `"lint"` script in its `package.json`, so Turbo skips them. The only workspace that would get linted is `packages/ui` — the dead package. **In practice, linting is not configured for any living code in this project.**

---

## 1.8 The dependency inventory

### Root dependencies

| Package | Declared as | Actually used? |
|---|---|---|
| `prettier` | devDependency | Used by `npm run format` — works |
| `turbo` | devDependency | Used by all root scripts — works |
| `typescript` | devDependency (pinned 5.9.2) | Used by type-checking — works |
| `cors` | **production dependency** | **Never imported. Dead.** |

### Backend dependencies

| Package | Used? | How? |
|---|---|---|
| `express` | ✅ | HTTP server in `index.ts` |
| `axios` | ✅ | GitHub API calls, Gemini token minting |
| `zod` | ✅ | Request validation in `types.ts` |
| `@prisma/client` | ✅ | Database queries |
| `@prisma/adapter-pg` | ✅ | PostgreSQL driver adapter |
| `pg` | ✅ | Underlying PostgreSQL client for the adapter |
| `dotenv` | ✅ | Loaded via `prisma.config.ts` (`import "dotenv/config"`) |
| `https-proxy-agent` | ✅ | Corporate proxy support in `proxy.ts` |
| `@google/genai` | **❌ Never imported** | Phantom dependency |

### Frontend dependencies

| Package | Used? | How? |
|---|---|---|
| `react`, `react-dom` | ✅ | Core UI framework |
| `react-router-dom` | ✅ | Client-side routing in `App.tsx` |
| `react-router` | ✅ | Peer/transitive of react-router-dom |
| `axios` | ✅ | Pre-interview API call in `Form.tsx` |
| `sonner` | ✅ | Toast notifications |
| `bun-plugin-tailwind` | ✅ | CSS processing |
| `tailwind-merge` | ✅ | Via `cn()` utility |
| `clsx` | ✅ | Via `cn()` utility |
| `class-variance-authority` | ✅ | Button variants |
| `@radix-ui/react-slot` | ✅ | Button's `asChild` prop |
| `@radix-ui/react-select` | ⚠️ Installed, component exists, **never used by any page** |
| `@radix-ui/react-label` | ⚠️ Installed, component exists, **never used by any page** |
| `lucide-react` | ⚠️ Only used inside `select.tsx` (chevron icons), which is itself unused |
| `tw-animate-css` | ⚠️ Imported in `globals.css`, provides animation classes — used only by `select.tsx` transitions |

---

## 1.9 Honest gaps to own before an interviewer finds them

1. **`cors` is a phantom production dependency.** It's in the root `package.json` under `dependencies` (not even `devDependencies`), adding to the install footprint of every workspace. No code imports it. Consequence: looks like an oversight in dependency hygiene; a reviewer would question what other dead packages might exist.

2. **`@google/genai` is a phantom backend dependency.** Declared in `apps/backend/package.json` but never imported. The entire Gemini integration uses raw HTTP (axios for token minting) and raw WebSocket (hand-rolled client in the frontend). Consequence: same as above, plus it suggests the code was written iteratively — the SDK was tried, abandoned for the hand-rolled approach, and never cleaned up.

3. **The Turbo build outputs are wrong.** `turbo.json` caches `.next/**` but the frontend outputs to `dist/`. A `turbo run build` with caching enabled would silently produce a broken cache. Consequence: cache-hit builds would have no output files.

4. **The shared `packages/typescript-config` and `packages/eslint-config` are unused by any app.** Their only consumer is `packages/ui`, which is itself dead. This is ~130 lines of configuration that adds noise to the repo. Consequence: an interviewer might ask "walk me through your shared config" and find it leads to dead code.

5. **Neither app has a `lint` script.** `turbo run lint` does nothing for the actual application code. The root `package.json` advertises `"lint": "turbo run lint"`, which successfully runs zero linters on the two apps that matter.

6. **The backend has no `build` or `check-types` script.** This means `turbo run check-types` skips the backend. Type errors in the backend would not be caught by any monorepo-level command. Consequence: a typo in a Prisma query or Express handler would only surface at runtime.

7. **The frontend `package.json` name is `"bun-react-template"`.** It was never renamed from the template default. Cosmetic, but it signals the project was set up from a template and not fully customized.

8. **`"engines": { "node": ">=18" }` is misleading.** The project runs on Bun. This field is a leftover from `create-turbo` and would confuse anyone trying to set up the project on Node.js.

---

## The shape to carry into Module 2

```
interviewer/                         (root workspace, Turbo orchestrator)
├── apps/
│   ├── backend/                     (Express 5 on Bun, no build step)
│   │   ├── index.ts                 ← entry point, 3 routes
│   │   ├── package.json             ← its own deps (prisma, express, axios, zod...)
│   │   └── tsconfig.json            ← standalone, strict, Bun types
│   │
│   └── frontend/                    (React 19, Bun serve(), Tailwind v4)
│       ├── src/index.ts             ← Bun dev server entry
│       ├── src/index.html           ← HTML shell
│       ├── src/frontend.tsx         ← React root
│       ├── build.ts                 ← production bundler script
│       ├── bunfig.toml              ← dev server Tailwind plugin
│       ├── package.json             ← its own deps (react, router, shadcn tooling...)
│       └── tsconfig.json            ← standalone, strict, DOM + Bun types
│
├── packages/                        (shared workspace packages)
│   ├── eslint-config/               ← 3 presets, used only by packages/ui
│   ├── typescript-config/           ← 3 configs, used only by packages/ui
│   └── ui/                          ← 3 components, NEVER IMPORTED by any app
│
├── turbo.json                       ← task orchestration (build outputs wrong)
├── package.json                     ← workspaces, scripts, phantom `cors` dep
└── bun.lock                         ← lockfile, 134 KB
```

Module 2 covers the data layer: Prisma schema, PostgreSQL connection, migrations, and the domain model.

---

## Drill — answer from memory, files closed

1. **What's the build story? How does TypeScript get from `.ts` files to running code?**

2. **Why didn't you just use Node.js instead of Bun?**

3. **Your `turbo.json` caches `.next` outputs, but you don't use Next.js. What breaks in production?**

4. **Walk me through the dependency graph of your monorepo. How do the packages relate to the apps?**

5. **An interviewer notices `cors` in your root `package.json`. They ask: "What's your CORS strategy?" What do you say?**

---

# Appendix A — Model answers to the drill

### 1. "What's the build story?"

"There is no compile step in dev. Both apps run TypeScript directly on the Bun runtime — `bun --watch index.ts` for the backend, `bun --hot src/index.ts` for the frontend. Bun JIT-compiles TypeScript, so there's no `tsc` build. TypeScript is used purely for type-checking via `tsc --noEmit`. For production, the frontend has a `build.ts` script that uses Bun's native bundler API — it scans for HTML entrypoints, runs Tailwind through a plugin, minifies, generates source maps, and outputs to `dist/`. The backend has no production build — it's still `bun index.ts`, just without the file watcher."

**Why this answer lands:** It shows you understand the distinction between type-checking and execution, and that Bun's value proposition is removing the compile step. It avoids the mistake of saying "we compile TypeScript to JavaScript" when that literally doesn't happen here.

### 2. "Why didn't you just use Node.js?"

"Bun gave me three things: direct TypeScript execution without a build step, a built-in dev server with HMR for the frontend, and a fast package manager. For a project this size, the main benefit is developer experience — instant startup, no `tsc` watch process. The tradeoff is ecosystem maturity: Bun's compatibility with Node.js APIs is good but not complete, and some npm packages assume Node.js internals. If I needed to deploy to a platform that only supports Node.js, or if I hit a Bun compatibility bug with a critical dependency, I'd switch. Express 5 works fine on Bun, and so does Prisma with the `pg` adapter."

**Why this answer lands:** It names concrete benefits (no build step, built-in HMR, fast installs), acknowledges a concrete risk (compatibility), and gives the condition under which the answer flips (platform constraints, Bun bugs). It doesn't oversell Bun.

### 3. "Your `turbo.json` caches `.next` outputs, but you don't use Next.js. What breaks?"

"That's a bug I should fix. The `outputs` field tells Turbo what to save when caching a successful build. It's set to `.next/**` because the config was scaffolded from `create-turbo`'s Next.js template. My frontend actually outputs to `dist/`. So if Turbo caches a build and you run `turbo run build` again, it'll report a cache hit but `dist/` won't be there — the cached output was looking for `.next` artifacts that were never created. In dev it doesn't matter because `dev` has `cache: false`, but in CI it would produce silent failures. The fix is changing `outputs` to `[\"dist/**\"]`."

**Why this answer lands:** It demonstrates you understand Turbo's caching model (inputs → hash → cached outputs), admits the bug directly, explains the impact (CI failures, not dev failures), and gives the fix. Finding a bug in your own tooling config is impressive, not embarrassing.

### 4. "Walk me through the dependency graph."

"It's simpler than the file structure suggests. There are two apps — frontend and backend — and they don't depend on each other. The root `turbo.json` orchestrates parallel dev, and the root `bun.lock` gives them a shared dependency tree. There are three packages under `packages/` — eslint-config, typescript-config, and ui — but honestly, none of them are consumed by either app. They're `create-turbo` scaffolding that I didn't remove. The only consumer is `packages/ui`, which itself is unused. In practice, this is a two-app monorepo with no shared code between the apps — the monorepo gives me a single `turbo run dev` to start both servers, and that's the real value."

**Why this answer lands:** It's honest about the unused scaffolding instead of pretending the shared packages add value. It reframes the monorepo's value as "single command to start everything" rather than overclaiming shared code benefits that don't exist.

### 5. "What's your CORS strategy?"

"The `cors` package in the root `package.json` is dead — I don't import it. CORS is handled manually in the Express middleware: I set `Access-Control-Allow-Origin` to the frontend URL from the environment variable `FRONTEND_URL`, defaulting to `http://localhost:3000`. The middleware responds to `OPTIONS` preflight requests with a `204 No Content`. I allow `GET`, `POST`, and `OPTIONS` methods, and only the `Content-Type` header. The manual approach was simpler for three routes than configuring the `cors` middleware's options object, but I should have removed the unused `cors` package. I'd clean that up."

**Why this answer lands:** It admits the dead dependency immediately rather than being caught off-guard. It shows you know what CORS actually does (preflights, allowed origins) rather than just `app.use(cors())`. And volunteering the cleanup shows you maintain your code.

---

# Module 1 Summary — the one page to revise

**What this module is:** The monorepo structure, toolchain, and build pipeline that everything else runs inside. Turborepo orchestrates, Bun executes TypeScript directly without compilation, and about half the scaffolding is dead weight from a `create-turbo` template that was never fully adapted.

**Five claims to make cold:**
1. Bun runs TypeScript directly — there is no `tsc` compile step in dev or production for the backend.
2. Turbo's `build.outputs` are misconfigured for this project (lists `.next`, app outputs to `dist`).
3. The shared `packages/` (ui, eslint-config, typescript-config) are consumed only by each other, never by the apps.
4. `cors` and `@google/genai` are phantom dependencies — declared but never imported.
5. Neither app has a `lint` or `check-types` script, so `turbo run lint` and `turbo run check-types` are no-ops for app code.

**Decisions table:**

| Chose | Over | Because | Cost |
|---|---|---|---|
| Bun as runtime | Node.js | Direct TS execution, built-in bundler + dev server, fast installs | Less mature ecosystem, potential compatibility gaps with Node-specific packages |
| Express 5 on Bun | Bun.serve() for backend | Familiarity, ecosystem, middleware pattern | Unnecessary abstraction layer, performance overhead, asymmetry with frontend |
| Standalone tsconfigs | Extending shared configs | Shared configs target Node.js (NodeNext resolution), apps need Bun (Preserve) | Config duplication across two files |
| Manual CORS headers | `cors` middleware | Simpler for 3 routes, explicit control | More verbose, easy to forget a header, `cors` package left behind |
| Turborepo | No orchestrator / nx | Simple config, fast, just works for parallel dev | Template scaffolding carried over unused configs and wrong outputs |

**Tradeoffs and gaps to volunteer:**
- "The Turbo build cache is misconfigured — I'd fix the outputs array before deploying a CI pipeline."
- "The shared packages are scaffolding I should have removed. They add directory noise without value."
- "I chose Bun knowing it's less battle-tested than Node.js. For a personal project, the DX tradeoff was worth it."

**Numbers and names to have ready:**
- Bun version: 1.3.14
- TypeScript version: 5.9.2 (pinned, not ranged)
- Turbo version: ^2.10.4
- Express version: 5.2.1
- Backend port: 3001
- Frontend port: 3000 (default Bun serve)
- `noUncheckedIndexedAccess: true` — notable strictness flag
- 3 workspace packages, 0 consumed by apps
- 2 phantom dependencies: `cors` (root), `@google/genai` (backend)

**Sentences worth memorizing:**
- "Bun executes TypeScript directly — there is no compile step, not even for production on the backend."
- "The monorepo's real value is a single `turbo run dev` that starts both servers; the shared packages turned out to be template scaffolding I didn't need."
- "The `turbo.json` still has Next.js cache outputs because I scaffolded from `create-turbo` and didn't update the build config — that's a bug I'd fix."
