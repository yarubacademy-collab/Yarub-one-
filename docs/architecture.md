# YARUB ONE — Technical Architecture & Phase 1 Plan

**Document version:** 1.0
**Status:** Pre-implementation blueprint (Section 21 deliverable)
**Scope:** Architecture → Folder structure → Technologies → APIs/Services → Phase 1 plan

> یہ دستاویز Section 21 کے پانچ نکات کا جواب ہے۔ Coding شروع کرنے سے پہلے اسے review اور approve کریں۔ Section 12 (Open Decisions) میں وہ سوالات ہیں جن کے جواب Phase 1 کے کوڈ کو متاثر کریں گے۔

---

## 1. Architectural Principles

یہ اصول پورے product پر لاگو ہوں گے۔ ہر design decision ان کے خلاف check کیا جائے گا۔

| # | Principle | Meaning in practice |
|---|---|---|
| P1 | **Product-first, model-second** | User کبھی model کا نام نہ دیکھے۔ UI میں "GPT", "Claude", "Flux" جیسے الفاظ نہیں آئیں گے — صرف "YARUB ONE" اور capability names. |
| P2 | **Provider-agnostic core** | AI Core کبھی کسی vendor SDK کو براہِ راست call نہیں کرے گا۔ صرف internal interfaces کے ذریعے۔ |
| P3 | **No fake functionality** | Unconfigured capability = explicit `NOT_CONFIGURED` state, نہ کہ mock success. یہ type system میں enforce ہوگا۔ |
| P4 | **Everything is a Project** | ہر artifact کسی project سے منسلک ہے۔ Orphan outputs نہیں ہوں گے۔ |
| P5 | **Secrets never cross the wire** | API keys صرف server runtime میں۔ کوئی key browser bundle، env-public variable یا client response میں نہیں۔ |
| P6 | **Jobs, not requests** | ہر generation کام ایک persisted Job ہے — resumable, cancellable, auditable. Long HTTP requests نہیں۔ |
| P7 | **RTL is first-class** | Arabic/Urdu کے لیے layout mirroring، fonts اور typography design کے وقت سے شامل، بعد میں patch نہیں۔ |
| P8 | **Generated code runs sandboxed** | Website/Game builder کا output کبھی main origin پر execute نہ ہو۔ |

---

## 2. System Architecture (Layered View)

```
┌──────────────────────────────────────────────────────────────────┐
│  LAYER 1 — PRESENTATION (apps/web)                               │
│  Next.js App Router · React · Tailwind · RTL engine · i18n       │
│  Chat │ Create │ Image │ Video │ Education │ Web │ Game │ Visual │
│  Documents │ Projects │ Settings                                 │
└───────────────────────────┬──────────────────────────────────────┘
                            │ typed RPC / REST (session cookie)
┌───────────────────────────▼──────────────────────────────────────┐
│  LAYER 2 — API / BFF (apps/web/api)                              │
│  Auth guard · Zod validation · Rate limit · Ownership checks      │
│  Job submission · Job status stream (SSE) · Artifact serving      │
└───────────────────────────┬──────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│  LAYER 3 — YARUB ONE AI CORE (packages/ai-core)                  │
│                                                                   │
│   Intent Resolver → Complexity Classifier → Planner              │
│         ↓                                                         │
│   Task Graph (DAG)  →  Capability Router  →  Orchestrator        │
│         ↓                                          ↓              │
│   Context/Memory Manager              Step Executors             │
│         ↓                                          ↓              │
│   Assembler  →  Artifact                  Guardrails/Validators   │
└───────────────────────────┬──────────────────────────────────────┘
                            │ capability interfaces only
┌───────────────────────────▼──────────────────────────────────────┐
│  LAYER 4 — PROVIDER ABSTRACTION (packages/providers)             │
│  TextProvider │ ImageProvider │ VideoProvider │ SpeechProvider    │
│  CodeProvider │ EmbeddingProvider                                 │
│  Registry · Capability matrix · Health checks · Cost/latency meta │
└───────────────────────────┬──────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│  LAYER 5 — DOMAIN SERVICES                                       │
│  Project · Conversation · Document · Asset · Preview Sandbox      │
│  Usage/Quota · Notification                                       │
└───────────────────────────┬──────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│  LAYER 6 — INFRASTRUCTURE                                        │
│  PostgreSQL · Redis (queue+cache) · S3-compatible storage        │
│  Worker runtime (apps/worker) · Logger · Metrics · Audit log      │
└──────────────────────────────────────────────────────────────────┘
```

**Key rule:** ہر layer صرف اپنے نیچے والی layer کو جانتی ہے۔ Layer 1 کبھی Layer 4 کو نہیں دیکھتی۔

---

## 3. YARUB ONE AI CORE — Internal Design

یہ product کا دماغ ہے۔ Spec Section 3 کے آٹھ سوالات کا mapping:

| Spec question | Core component |
|---|---|
| User کیا چاہتا ہے؟ | Intent Resolver |
| کس category سے ہے؟ | Intent Resolver → `domain` |
| Simple یا complex؟ | Complexity Classifier |
| کن capabilities کی ضرورت؟ | Planner → `requiredCapabilities[]` |
| کن steps میں تقسیم؟ | Planner → Task Graph |
| کون سا model؟ | Capability Router |
| Outputs کیسے combine ہوں؟ | Assembler |
| Final result کس شکل میں؟ | Artifact Renderer |

### 3.1 Pipeline

```
User input (text / voice / file)
   │
   ▼
[1] Intent Resolver
    → { domain, language, intent, entities, confidence }
    domains: chat | image | video | education | website | game | visual | document
   │
   ▼
[2] Complexity Classifier
    → SIMPLE  (single step, stream directly to chat)
    → PROJECT (multi-step, create Project + Job)
   │
   ▼
[3] Planner  (LLM-driven, returns strict JSON, schema-validated)
    → Plan {
        title, language, steps[], edges[],
        requiredCapabilities[], estimatedCost, outputArtifactType
      }
   │
   ▼
[4] Capability Router
    each step.capability → provider instance
    policy: availability > language support > quality tier > cost > latency
    if none available → step.status = NOT_CONFIGURED  (P3, never faked)
   │
   ▼
[5] Orchestrator (runs in worker)
    topological execution · parallel where independent
    per-step: retry(3, exp backoff) · timeout · checkpoint to DB
    emits progress events → SSE → UI
   │
   ▼
[6] Assembler
    merges step outputs into final Artifact
    (e.g. text chapters + images + layout → PDF book)
   │
   ▼
[7] Artifact stored → Project → shown in UI with Edit / Regenerate / Export
```

### 3.2 Plan schema (contract, not illustration)

```ts
type Capability =
  | 'text.generate' | 'text.reason' | 'text.translate'
  | 'image.generate' | 'image.edit'
  | 'video.textToVideo' | 'video.imageToVideo'
  | 'speech.tts' | 'speech.stt'
  | 'code.generate'
  | 'document.render';

interface PlanStep {
  id: string;
  title: Record<'ar'|'ur'|'en', string>;  // user-facing, localized
  capability: Capability;
  input: { promptTemplate: string; dependsOnOutputs: string[] };
  output: { kind: 'text'|'json'|'image'|'video'|'file'; schema?: string };
  optional: boolean;
}

interface Plan {
  id: string;
  projectId: string;
  language: 'ar' | 'ur' | 'en';
  steps: PlanStep[];
  edges: Array<{ from: string; to: string }>;
  outputArtifactType: 'document' | 'website' | 'game' | 'image-set' | 'video' | 'message';
}
```

### 3.3 Reliability rules

- Planner کا output ہمیشہ Zod schema سے validate ہوگا؛ invalid → ایک بار repair prompt → پھر fail with clear error.
- ہر step کا result DB میں checkpoint ہوگا، تاکہ 7-step book generation کا step 6 fail ہونے پر steps 1–5 دوبارہ نہ چلیں۔
- Cancel = job flag، executor ہر step boundary پر check کرے گا۔

---

## 4. Provider Abstraction Layer

Spec Section 15 کا نفاذ۔ کسی ایک vendor پر hard-code نہیں۔

```ts
interface TextProvider {
  readonly id: string;              // 'provider-a-large'
  readonly capabilities: Capability[];
  readonly languages: LanguageCode[];
  readonly tier: 'fast' | 'balanced' | 'quality';
  health(): Promise<'ok' | 'degraded' | 'not_configured'>;
  generate(req: TextRequest): Promise<TextResponse>;
  stream(req: TextRequest): AsyncIterable<TextChunk>;
}
```

اسی pattern پر: `ImageProvider`, `VideoProvider`, `SpeechProvider`, `CodeProvider`, `EmbeddingProvider`.

**Registry behaviour**
- Startup پر ہر provider کا `health()` چلے گا۔ صرف `ok` providers routing میں شامل ہوں گے۔
- Admin/Settings screen میں ہر capability کے سامنے status: `Configured` / `Not configured` / `Degraded`.
- کسی capability کا کوئی provider نہ ہو → متعلقہ UI section disabled + واضح پیغام: *"یہ صلاحیت ابھی configure نہیں ہوئی۔"* (P3)

**Adding a new model later** = ایک نئی file `packages/providers/src/<vendor>/`, plus registry entry. Core میں کوئی تبدیلی نہیں۔

---

## 5. Recommended Technology Stack

> یہ recommendation ہے — Section 12 میں confirm کریں تو Phase 1 اسی پر بنے گا۔

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript** (end-to-end) | ایک زبان، shared types between UI/API/core, strong refactor safety |
| Frontend | **Next.js 15 (App Router) + React 19** | SSR, route handlers as BFF, streaming UI, mature RTL/i18n ecosystem |
| Styling | **Tailwind CSS** (logical properties) + CSS variables theme | `ps-4/pe-4` سے RTL خودکار mirror ہوتا ہے |
| UI primitives | **Radix UI** + custom YARUB design system | Accessible, unstyled → branding کسی existing product جیسی نہ لگے (P1) |
| i18n | **next-intl** | Message catalogs + `dir` switching per locale |
| Backend | Next.js **Route Handlers** (BFF) + separate **Node worker** | Simple deploy; heavy jobs UI process سے الگ |
| Job queue | **BullMQ on Redis** | Retries, priorities, cancellation, progress events |
| ORM / DB | **Prisma + PostgreSQL** | Relational integrity for Project→Job→Artifact→Version |
| Cache/rate-limit | **Redis** | Sliding-window rate limits, session cache |
| Object storage | **S3-compatible** (Cloudflare R2 / MinIO locally) | Images, videos, PDFs, project exports |
| Auth | **Auth.js (NextAuth)** — email+password & OAuth, JWT session | Self-hosted, no vendor lock |
| Validation | **Zod** | ایک schema، API + LLM output دونوں کے لیے |
| PDF/Docs | **Playwright (HTML→PDF)** + custom RTL templates | Arabic/Urdu typography کے لیے سب سے قابلِ اعتماد |
| Preview sandbox | `iframe` + `sandbox` + separate preview origin + CSP | Generated code isolation (P8) |
| Testing | Vitest (unit) · Playwright (e2e) | Phase-wise test gates |
| Monorepo | **pnpm workspaces + Turborepo** | Shared packages, fast CI |
| Logging | **Pino** + request/job correlation IDs | Debuggable multi-step jobs |

**Fonts (RTL-critical):** IBM Plex Sans Arabic یا Noto Kufi Arabic (Arabic UI), Noto Nastaliq Urdu (Urdu display), Inter (Latin). یہ typography branding کا بڑا حصہ ہے (Section 16).

---

## 6. Folder / File Structure

```
yarub-one/
├── apps/
│   ├── web/                          # Next.js — UI + BFF
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── [locale]/
│   │   │   │   │   ├── (auth)/          login, register, reset
│   │   │   │   │   ├── (app)/
│   │   │   │   │   │   ├── chat/
│   │   │   │   │   │   ├── create/      unified "بتائیں کیا بنانا ہے" entry
│   │   │   │   │   │   ├── image/
│   │   │   │   │   │   ├── video/
│   │   │   │   │   │   ├── education/
│   │   │   │   │   │   ├── website/
│   │   │   │   │   │   ├── game/
│   │   │   │   │   │   ├── visual/
│   │   │   │   │   │   ├── documents/
│   │   │   │   │   │   ├── projects/[projectId]/
│   │   │   │   │   │   └── settings/
│   │   │   │   │   └── layout.tsx       # dir=rtl|ltr, font switching
│   │   │   │   └── api/
│   │   │   │       ├── auth/[...nextauth]/
│   │   │   │       ├── chat/stream/
│   │   │   │       ├── jobs/            POST create · GET status · POST cancel
│   │   │   │       ├── jobs/[id]/events/  SSE progress
│   │   │   │       ├── projects/
│   │   │   │       ├── artifacts/[id]/
│   │   │   │       └── uploads/
│   │   │   ├── components/
│   │   │   │   ├── chat/                composer, message list, streaming
│   │   │   │   ├── project/             sidebar, version history, asset grid
│   │   │   │   ├── job/                 plan viewer, step progress, cancel
│   │   │   │   ├── preview/             sandboxed iframe host
│   │   │   │   └── brand/               logo, shell, navigation
│   │   │   ├── hooks/
│   │   │   ├── lib/                     api client, session, formatters
│   │   │   └── styles/
│   │   ├── messages/                    ar.json · ur.json · en.json
│   │   └── public/
│   │
│   └── worker/                       # Job orchestration runtime
│       └── src/
│           ├── index.ts                 BullMQ consumers
│           ├── processors/
│           │   ├── plan.processor.ts
│           │   ├── step.processor.ts
│           │   └── assemble.processor.ts
│           └── schedules/               cleanup, retention
│
├── packages/
│   ├── ai-core/                      # THE BRAIN — no vendor imports allowed
│   │   └── src/
│   │       ├── intent/                  resolver, taxonomy, language detect
│   │       ├── planner/                 planner, plan.schema.ts, repair
│   │       ├── router/                  capability router, policy
│   │       ├── orchestrator/            dag, executor, checkpoint, cancel
│   │       ├── assembler/               document, website, game, image-set
│   │       ├── memory/                  conversation + project context
│   │       ├── guardrails/              input validation, output validation
│   │       └── prompts/                 ar/ ur/ en/  versioned templates
│   │
│   ├── providers/                    # ONLY place vendor SDKs appear
│   │   └── src/
│   │       ├── contracts/               TextProvider, ImageProvider, ...
│   │       ├── registry.ts
│   │       ├── text/  image/  video/  speech/  code/
│   │       └── health.ts
│   │
│   ├── db/
│   │   ├── prisma/schema.prisma
│   │   └── src/                         repositories, migrations helper
│   │
│   ├── storage/                       S3 adapter, signed URLs, MIME guard
│   ├── documents/                     PDF/DOCX renderers, RTL templates
│   ├── sandbox/                       generated-code packaging + CSP policy
│   ├── shared/                        types, errors, result<T>, constants
│   ├── ui/                            design system components + tokens
│   └── config/                        env schema (Zod), feature flags
│
├── infra/
│   ├── docker-compose.dev.yml         postgres · redis · minio
│   ├── Dockerfile.web
│   └── Dockerfile.worker
│
├── docs/
│   ├── architecture.md
│   ├── ai-core.md
│   ├── providers.md
│   ├── security.md
│   └── phases/
│
├── turbo.json
├── pnpm-workspace.yaml
└── .env.example                      # keys کے نام صرف، values کبھی نہیں
```

**Enforced boundary (lint rule):** `packages/ai-core` میں کسی vendor SDK کا import CI میں fail کرے گا۔ یہی P2 کی عملی ضمانت ہے۔

---

## 7. Data Model (core tables)

```
User(id, email, passwordHash, locale, createdAt)
  └── Project(id, userId, title, domain, language, status, createdAt)
        ├── Conversation(id, projectId, title)
        │     └── Message(id, conversationId, role, content, tokens, createdAt)
        ├── Job(id, projectId, type, status, planJson, progress, error, createdAt)
        │     └── JobStep(id, jobId, capability, status, inputRef, outputRef,
        │                 providerId, attempts, startedAt, finishedAt)
        ├── Artifact(id, projectId, type, title, currentVersionId)
        │     └── ArtifactVersion(id, artifactId, version, storageKey, meta, createdAt)
        └── Asset(id, projectId, kind, storageKey, mime, bytes, width, height)

ProviderConfig(id, capability, providerId, enabled, tier, updatedAt)
UsageLog(id, userId, jobId, capability, providerId, units, costEstimate, at)
AuditLog(id, userId, action, target, ip, at)
```

Job/JobStep tables ہی Section 13 کے "Smart Workflow" کو resumable اور inspectable بناتی ہیں۔

---

## 8. Required External APIs / Services

| Capability | What is needed | Phase | Notes |
|---|---|---|---|
| Text/reasoning | 1 LLM API (primary) + 1 fallback | **1** | Arabic/Urdu quality سب سے اہم selection criterion |
| Image generation | 1 image API | 2 | Arabic text-in-image عموماً کمزور ہوتا ہے → text overlay layer ہماری طرف سے |
| Image editing | inpaint/edit-capable endpoint | 2 | ایک ہی vendor ہو تو بہتر |
| Document render | Playwright (self-hosted) | 2 | کوئی external API نہیں |
| Code generation | LLM (code tier) | 3 | Website/Game builder |
| Preview hosting | separate origin/subdomain | 3 | `preview.<domain>` — security requirement |
| Video generation | video API (modular slot) | 4 | Async + webhook, cost-heavy |
| TTS / STT | speech API | 4 | Education mode کے لیے قیمتی |
| Auth email | transactional email service | 1 | verification + reset |
| Storage | S3-compatible bucket | 1 | R2 سستا; MinIO local dev |
| Database | managed PostgreSQL | 1 | |
| Redis | managed Redis | 1 | queue + rate limit |
| Error tracking | Sentry (optional) | 5 | |

> **Cost note:** Video (Phase 4) باقی سب سے کہیں مہنگا ہے۔ Phase 1 سے ہی `UsageLog` اور per-user quota موجود ہوں گے تاکہ بعد میں retrofit نہ کرنا پڑے۔

---

## 9. Security Architecture (Section 17)

| Control | Implementation |
|---|---|
| Key isolation | Keys صرف server env; `packages/config` Zod schema سے validate; `NEXT_PUBLIC_*` میں کوئی secret نہیں؛ CI میں secret-scan |
| AuthN | Auth.js, argon2id password hashing, httpOnly+SameSite cookies, email verification |
| AuthZ | ہر repository call میں `userId` ownership check — route level پر نہیں، data level پر |
| Input validation | Zod on every route handler; max prompt length; language/charset checks |
| File validation | Magic-byte sniffing (not extension), size caps, MIME allow-list, EXIF strip |
| Generated code | `iframe sandbox="allow-scripts"` on **separate origin**, strict CSP, no parent access, no network by default |
| Rate limiting | Redis sliding window: per-user, per-IP, per-capability; expensive capabilities کے لیے سخت |
| Prompt injection | Uploaded/fetched content کو ہمیشہ data-role میں رکھیں؛ system prompt ناقابلِ override؛ tool calls allow-list سے |
| Secrets at rest | Provider configs encrypted column; rotation supported |
| Audit | AuditLog on auth events, project delete, export, provider config change |
| Errors | User کو safe message; stack traces صرف server logs میں correlation ID کے ساتھ |

---

## 10. Branding & UX Foundations (Sections 12 & 16)

- **Single shell:** ایک persistent left rail (RTL میں right rail) + context panel۔ ہر section الگ website محسوس نہ ہو۔
- **Unified entry point:** `/create` — user صرف اپنی ضرورت لکھے۔ Intent Resolver خود section منتخب کرے؛ manual sections صرف shortcut ہوں۔
- **Plan transparency, not technical noise:** Job چلتے وقت user کو localized step titles نظر آئیں ("مواد تیار کیا جا رہا ہے…") — model names, token counts, API errors نہیں۔
- **Design tokens:** custom color scale, spacing, radius, motion — کسی موجودہ AI product کی نقل نہیں (Section 16)۔
- **RTL:** `dir` root پر locale سے; logical CSS properties only; icons mirror; numerals locale-aware.

---

## 11. PHASE 1 — Foundation (Implementation Plan)

**Goal:** ایک deployable, tested foundation جس پر Phases 2–5 صرف add کریں، rewrite نہ کریں۔

**Definition of done:** ایک user register کر سکے، ایک project بنائے، Arabic/Urdu/English میں chat کرے، اور ایک multi-step plan چلتا ہوا دیکھے جس کے steps checkpoint، cancel اور resume ہوں — سب کچھ real providers کے ساتھ، کوئی mock نہیں۔

### Milestone 1.1 — Repo & Infrastructure
- pnpm + Turborepo monorepo, TypeScript strict mode
- `docker-compose.dev.yml`: Postgres, Redis, MinIO
- `packages/config` env schema; `.env.example`
- CI: typecheck, lint, unit tests, vendor-import boundary rule
- **Exit:** `pnpm dev` سے پورا stack ایک command پر چلے

### Milestone 1.2 — Design System & Shell
- Design tokens, fonts (Arabic/Urdu/Latin), light+dark
- `packages/ui`: Button, Input, Dialog, Tabs, Toast, Skeleton, EmptyState, **NotConfiguredState**
- App shell + navigation for all 11 sections (غیر مکمل sections `NotConfiguredState` دکھائیں — fake UI نہیں)
- i18n: ar/ur/en catalogs, locale switch, RTL verified
- **Exit:** تینوں زبانوں میں shell drift کے بغیر render ہو

### Milestone 1.3 — Auth & Data
- Prisma schema (Section 7), migrations, seed
- Auth.js: register, verify, login, reset, session
- Ownership-checked repositories
- **Exit:** e2e test: register → login → session → logout

### Milestone 1.4 — Provider Layer (text only)
- Contracts + registry + health checks
- ایک primary TextProvider + ایک fallback
- Settings screen: capability status matrix
- **Exit:** Key ہٹانے پر UI صاف `Not configured` دکھائے، crash یا fake output نہ ہو

### Milestone 1.5 — AI Core v1
- Intent Resolver (8 domains, 3 languages)
- Complexity Classifier
- Planner + `Plan` Zod schema + repair loop
- Capability Router with policy
- Orchestrator: DAG, retry, timeout, checkpoint, cancel
- **Exit:** Unit tests — golden plans for 12 representative requests (Arabic book, website, game, quiz…) — plus resume-after-failure test

### Milestone 1.6 — Chat + Projects
- Streaming chat (SSE), conversation history, context window management
- Project CRUD, project sidebar, asset/artifact shells
- Job submission + live step progress UI
- **Exit:** ایک complex Arabic request سے project بنے، plan نظر آئے، text steps مکمل ہوں، اور non-text steps واضح طور پر `Not configured` (Phase 2 میں enable ہوں گے)

### Milestone 1.7 — Hardening & Test Gate
- Rate limiting, error boundaries, structured logging
- Playwright e2e: auth, chat, project, job lifecycle
- Docs: architecture.md, ai-core.md, providers.md, security.md
- **Exit:** Phase 1 test suite green → Phase 2 شروع

**Suggested sequencing:** 1.1 → 1.2 ‖ 1.3 → 1.4 → 1.5 → 1.6 → 1.7 (1.2 اور 1.3 متوازی ہو سکتے ہیں)

---

## 12. Open Decisions (آپ کے جواب درکار ہیں)

یہ Phase 1 کے کوڈ کو براہِ راست متاثر کرتے ہیں:

1. **Stack confirmation** — TypeScript/Next.js/Postgres تجویز منظور ہے، یا آپ Python (FastAPI) backend چاہتے ہیں؟
2. **Deployment target** — Managed cloud (Vercel + Neon + Upstash + R2) یا اپنا VPS/Docker؟ یہ worker اور video (Phase 4) کی design کو بدلتا ہے۔
3. **Users** — صرف آپ/چھوٹی ٹیم، یا public multi-user signup? اگر public ہے تو Phase 1 میں quotas اور billing hooks شامل کرنا ہوں گے۔
4. **Provider budget** — کون سے AI accounts پہلے سے موجود ہیں؟ Phase 1 کے لیے کم از کم ایک text provider درکار ہے۔
5. **Primary UI language** — Default locale Arabic, Urdu یا English؟ (باقی دونوں بہرحال support ہوں گی۔)

**جواب ملتے ہی Milestone 1.1 اور 1.2 کا کوڈ لکھنا شروع کر دوں گا۔**
