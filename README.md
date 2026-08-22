# YARUB ONE

Standalone multilingual AI creation platform — Arabic, Urdu, English.

**Current state:** Phase 1 · Milestone 1.1 (foundation scaffold).
See `docs/` and the architecture blueprint for the full roadmap.

---

## Quick start

```bash
pnpm install
cp .env.example .env          # fill in DATABASE_URL, AUTH_SECRET, S3, and at least one text provider
pnpm infra:up                 # postgres + redis + minio
pnpm db:migrate
pnpm dev
```

`AUTH_SECRET` تیار کرنے کے لیے: `openssl rand -base64 48`

The app boots without any AI provider key. Capabilities without credentials
report `not_configured` and their UI sections are disabled with a clear message.
That is deliberate — see below.

---

## What is already implemented

| Package | Purpose |
|---|---|
| `packages/config` | Zod-validated environment. Fails fast on misconfiguration; guards against secrets reaching the browser bundle. |
| `packages/shared` | Locale/RTL helpers, `Result` + `AppError`, the capability vocabulary, the eight domains. |
| `packages/providers` | Provider contracts (text/image/video/speech), health-gated registry, an OpenAI-compatible text adapter, registry bootstrap. |
| `packages/ai-core` | Intent schema, Plan schema with cycle detection and topological execution ordering. |
| `packages/db` | Prisma schema for User → Project → Job → JobStep → Artifact, plus ownership-checked access. |
| `scripts/check-boundaries.mjs` | CI guard: fails the build if the AI Core imports a vendor SDK. |
| `infra/` | Local Postgres, Redis, MinIO. |

## Running it

```bash
pnpm install
cp .env.example .env
pnpm infra:up          # postgres + redis + minio
pnpm db:migrate
pnpm dev               # web on :3000
pnpm worker:dev        # job orchestration
pnpm preview:dev       # sandbox origin on :3001
pnpm test              # 63 tests
```

Generate `AUTH_SECRET` with `openssl rand -base64 48`.

The app boots with zero AI credentials. Capabilities without a provider report
`not_configured`, their sections show that state, and nothing is simulated.
See `STATUS.md` for the per-capability picture.

## Structure

| Package | Purpose |
|---|---|
| `packages/config` | Zod-validated env; fails fast; blocks secret-shaped `NEXT_PUBLIC_*` vars |
| `packages/shared` | Locales/RTL, `Result`/`AppError`, capability and domain vocabularies |
| `packages/providers` | Contracts + registry + text/image/video/speech adapters |
| `packages/ai-core` | Intent → Planner → Router → Orchestrator → Memory → Guardrails → Assembler |
| `packages/db` | Prisma schema, ownership-checked access |
| `packages/storage` | S3 client, signed URLs, magic-byte upload validation |
| `packages/sandbox` | Bundle packaging, CSP, path and markup hardening |
| `packages/documents` | RTL-aware HTML→PDF rendering |
| `apps/web` | Next.js UI + API routes |
| `apps/worker` | BullMQ consumer, step executors, quotas |
| `apps/preview` | Isolated origin serving generated code |

## Provider configuration

Two layers, database over environment:

- **Environment** (`.env`) is the deployment baseline — good for
  infrastructure-as-code and for a working default.
- **Settings** (`ProviderConfig` rows, written via `POST /api/providers`)
  overrides it at runtime, so a provider can be added without a redeploy.

Credentials set through Settings are encrypted with AES-256-GCM before they
touch the database. `CREDENTIAL_SECRET` derives that key and is deliberately
separate from `AUTH_SECRET`, so session rotation and credential rotation are
independent operations. A stored key that fails to decrypt raises an error
rather than silently falling back to the environment value — an operator who
rotated the secret needs to know, not to be quietly served a stale key.

Only masked hints (`sk-••••6789`) ever reach a browser.

Generate both secrets with `openssl rand -base64 48`.
