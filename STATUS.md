# YARUB ONE — Implementation Status

Honest per-capability state. `IMPLEMENTED` means the code path is complete and
tested. `NEEDS_CREDENTIAL` means everything but the API key exists — adapter,
routing, executor, UI, error handling — and adding the key activates it with no
code change. Nothing here is simulated.

| # | Capability | State | What is missing |
|---|---|---|---|
| 1 | AI Chat (streaming) | NEEDS_CREDENTIAL | `TEXT_PRIMARY_*` |
| 2 | Reasoning / text generation | NEEDS_CREDENTIAL | `TEXT_PRIMARY_*` |
| 3-5 | Arabic / Urdu / English | IMPLEMENTED | — (detection, prompts, UI, RTL all local) |
| 6 | Translation | NEEDS_CREDENTIAL | `TEXT_PRIMARY_*` |
| 7-8 | Image generation / editing | NEEDS_CREDENTIAL | `IMAGE_*` |
| 9 | Visual & design creation | NEEDS_CREDENTIAL | `IMAGE_*` |
| 10-12 | Video workflows, T2V, I2V | NEEDS_CREDENTIAL | `VIDEO_*` |
| 13-14 | TTS / STT | NEEDS_CREDENTIAL | `SPEECH_*` |
| 15-19 | Education, homework, lessons, worksheets, quizzes | NEEDS_CREDENTIAL | `TEXT_PRIMARY_*` (education prompting is implemented) |
| 20-22 | Website generation, design, HTML/CSS/JS | NEEDS_CREDENTIAL | `TEXT_PRIMARY_*` (assembly + sandbox implemented) |
| 23-24 | Game generation, playable preview | NEEDS_CREDENTIAL | `TEXT_PRIMARY_*` (preview origin implemented) |
| 25-26 | Code generation / debugging | NEEDS_CREDENTIAL | `TEXT_PRIMARY_*` |
| 27-28 | Documents, PDF rendering | IMPLEMENTED | — (local Playwright render, no external service) |
| 29 | Project management | IMPLEMENTED | — |
| 30 | Conversation history | IMPLEMENTED | — (threaded view, persistence, rolling summarisation) |
| 31 | Assets | IMPLEMENTED | — |
| 32 | Artifact versions | IMPLEMENTED | — |
| 33 | Export / download | IMPLEMENTED | — (zip export route + UI links) |
| 34 | Usage tracking | IMPLEMENTED | — |
| 35 | Provider health / status | IMPLEMENTED | — |
| 36 | Secure API management | IMPLEMENTED | — (AES-256-GCM at rest, masked hints, audit trail) |

## Genuinely blocked

Nothing is blocked by design. Every `NEEDS_CREDENTIAL` row is a configuration
value, not missing work. The owner supplies endpoints and keys; the registry
picks them up at boot.

## Plans and quotas

Limits are **data, not code**. The values below are the seed defaults written by
`pnpm db:seed`; the owner edits them in the admin area and enforcement reads the
Plan table on the next request.

| | Free | Premium monthly | Premium yearly |
|---|---|---|---|
| Images | 2 | 200 | 3000 |
| Videos | 2 | 30 | 400 |
| Max video seconds | 10 | 60 | 60 |
| Websites | 1 | 25 | 300 |
| Games | 1 | 25 | 300 |
| Documents | 5 | 200 | 2400 |
| Price | 0 | unset | unset |

Premium prices ship **unset**. The UI shows "price not set yet" rather than
inventing a figure the owner has not chosen.

Chat, reasoning, translation and education are **not metered** — a free user
keeps full study access. Only creation draws down an allowance.

### Where enforcement lives

- `packages/billing/src/entitlements.ts` — pure decision logic, 23 tests
- `apps/web/src/lib/entitlements.ts` — resolves plan, subscription and usage
  from the database and calls the engine
- `/api/jobs` — pre-flight check before a job is queued
- Image and video executors — second check before any provider call
- Video duration is clamped server-side and stamped onto the stored plan, so
  the worker never reads a duration the client supplied

Usage is counted from durable records (`UsageLog` and completed jobs), never
from a client counter. Image editing meters against the image quota so it
cannot be used as a free path around it.

## Roles and administration

`USER` and `ADMIN`, stored on the user row. No identity is hard-coded anywhere;
the first admin is promoted by the operator:

```bash
pnpm db:seed owner@example.com
```

The admin area edits plan prices, quotas and video ceilings, grants plans
manually, and lists users and subscription status.

## Verification

| Check | Command | Result |
|---|---|---|
| Typecheck | `pnpm typecheck` | clean |
| Architecture boundary | `pnpm check:boundaries` | passing |
| Unit + integration | `pnpm test` | 133 passing |
| Production build | `pnpm build` | **compile + full type check pass**; halts at page-data collection — `prisma generate` cannot run in this environment |
| End-to-end | `pnpm test:e2e` | **not run** — 44 specs collect; needs a live stack and a text provider |
| Android build | `./gradlew assembleDebug` | **not run** — no Android SDK in this environment |

### The build blocker, precisely

`binaries.prisma.sh` is outside this container's network allowlist (403
Forbidden), so the Prisma query engine cannot be downloaded and the client
cannot be generated. `--no-engine` fails the same way. Next therefore cannot
instantiate `PrismaClient` during page-data collection.

Everything before that step passes, including full TypeScript checking of all
billing, subscription, admin and entitlement code. On a machine with normal
outbound access:

```bash
pnpm install
pnpm --filter @yarub/db exec prisma generate
pnpm --filter @yarub/web build
```

## Payment integration

**Architecture complete. NEEDS_CREDENTIAL for activation.**

`packages/billing/src/payments.ts` defines a provider-agnostic contract:
checkout session creation, HMAC-signed webhook verification, normalised billing
events, and cancellation. `HmacPaymentProvider` implements the scheme shared by
common hosted checkout providers; a vendor with a different scheme gets its own
adapter and nothing above it changes.

The webhook endpoint activates paid subscriptions, which makes it the most
attractive target in the application. It therefore:

- reads the **raw body** before parsing, because verifying a re-serialised
  object verifies the wrong bytes
- verifies HMAC-SHA256 over `timestamp.body` in constant time
- rejects payloads outside a 300-second window, so a captured "subscription
  activated" event cannot be replayed — and refreshing the timestamp
  invalidates the signature, which is the point of signing both together
- returns terse errors, so a forgery attempt cannot be tuned against them
- writes append-only `BillingEvent` history **before** the state change

Checkout reads the price from the Plan table, never from the request: a client
that could name its own price could buy Premium for nothing. An unpriced plan is
refused rather than checked out at zero.

Supplying `PAYMENT_API_KEY`, `PAYMENT_WEBHOOK_SECRET` and
`PAYMENT_CHECKOUT_URL` activates the whole flow with no code change.

## Providers

All six categories now have adapters behind the abstraction: text, image, video,
speech, code (via the text contract) and **embedding**. Embeddings back project
memory and semantic recall; multilingual quality matters most there, since a
model weak in Arabic degrades recall silently.

## Android

A **native** client, not an HTML wrapper:

- `data/YarubApi.kt` — real HTTP client against the same backend routes, same
  session cookie, same AI Core. Handles streaming chat, projects, entitlements
  and capabilities. The server still decides answer vs. clarify vs. project, so
  the two clients never diverge.
- `data/SessionStore.kt` — session cookie in `EncryptedSharedPreferences`;
  plain preferences are readable on a rooted or backed-up device. The password
  is never persisted.
- `ui/ChatViewModel.kt` — streaming state, quota-exceeded surfaced as an
  upgrade path rather than an error.
- WebView is retained for exactly one purpose: previewing generated websites
  and games, which are HTML by nature.
- Release signing reads a keystore from `local.properties` (gitignored). When
  absent the release build **fails** rather than emitting an unsigned artifact.

**No APK or AAB was built.** No Android SDK is present in this environment
(`ANDROID_HOME` unset, no `sdkmanager`). Java 21 is available; the SDK is not.

## Verification

| Check | Command | Result |
|---|---|---|
| Typecheck | `pnpm typecheck` | clean |
| Architecture boundary | `pnpm check:boundaries` | passing |
| Unit + integration | `pnpm test` | **149 passing** |
| Dead-nav audit | — | 11 nav sections, 0 missing pages, 0 missing labels |
| TODO/FIXME scan | — | none in source |
| Production build | `pnpm build` | compile + **full type check pass**; halts at page-data collection |
| End-to-end | `pnpm test:e2e` | not run — needs a live stack and a text provider |
| Android build | `./gradlew assembleDebug` | not run — no Android SDK present |

### The build blocker, unchanged and precise

`binaries.prisma.sh` returns 403 from this container, so the Prisma query engine
cannot be downloaded and the client cannot be generated (`--no-engine` fails
identically). Next cannot instantiate `PrismaClient` during page-data
collection. Everything before that passes, including full type checking of the
payment, checkout, webhook, entitlement, admin and regenerate code.

On a machine with normal outbound access:

```bash
pnpm install
pnpm --filter @yarub/db exec prisma generate
pnpm --filter @yarub/web build
```
