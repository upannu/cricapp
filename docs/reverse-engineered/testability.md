# Testability Review

> **STALE — written against the prior (pre-merge, 194-requirement) reverse-engineering pass.** Not yet refreshed against the current codebase after the 120-commit merge. The *approach* described below (test levels, mocking strategy, browser-coverage gaps, what's structurally hard to automate) is still directionally accurate, but specific requirement IDs, gap IDs, and counts referenced here predate the `app_metadata` migration, multi-currency, referrals, coach subscriptions, and the rest of what's documented in [`reverse-engineering-delta.md`](./reverse-engineering-delta.md). Treat this file as background reading, not as current fact, until it's explicitly refreshed.

A practical companion to [`test-cases.md`](./test-cases.md): not "what test cases exist" but "what testing approach does each kind of behavior in this codebase actually require, and what's genuinely hard or impossible to test right now." Grounded in the real test infrastructure built this session (Vitest unit/API/jsdom + Playwright E2E with a 5-role fixture system + MSW) and the findings in [`gaps.md`](./gaps.md).

---

## 1. Testable through UI (Playwright E2E)

Everything reachable by a browser and covered by the 5-role fixture system (`tests/e2e/roles/{platform_admin,academy_admin,coach,player,parent}/`):
- Auth flows: login, signup, password reset, middleware redirect matrix
- Coach-facing CRUD: players, sessions (incl. the full video-upload wizard), reports, action plans, attendance, S&C log, bookings, session packs, coach directory
- Admin console: approvals queue, KPIs, plan catalog, pricing, academy content admin
- Portal: player/parent home, Academy curriculum/articles, coach-chat widget, find-a-coach
- Consent confirmation flow

**Not testable this way, by construction:** `page.tsx` files are async Server Components — Vitest/RTL cannot render them at all. Anything at the page level is E2E-only; this is a Next.js architecture constraint, not a coverage gap.

---

## 2. Testable through API (Vitest, in-process route handlers)

All 41 `app/api/**/route.ts` routes, using the established `import { POST } from "@/app/api/.../route"` plus hand-built `Request` object pattern. This is where validation, authorization branching, and business-rule logic get their real coverage (400/401/403/404/500 paths, Stripe event-type dispatch, cron threshold logic).

This layer is also the right place to **prove a gap exists**, not just to test features that work. For example, an API-level test asserting that a Free-plan player's direct `POST` to create a marketplace booking currently succeeds would concretely demonstrate `MKT-GAP-07` (the client-side-only paywall documented in `gaps.md`) rather than leaving it as a code-reading inference — and would become a regression test the moment it's fixed.

---

## 3. Testable directly against the DB

Currently used only for seed/reset (`tests/seed/client.ts`, service-role key) — not for assertions. Real, currently-unexploited opportunities:

- **Confirming FK/trigger constraints actually behave as claimed.** Discovered directly this session: `academies.head_coach_id` and `coaches.academy_id` form a real bidirectional FK relationship that can deadlock a naive delete order — found only by running `reset.ts` against the live DB and watching it fail, not by reading application code.
- **Detecting the orphaned-row gaps directly**, e.g. leftover `session-videos` Storage objects after a partial 3-video upload failure (`PLAYER-GAP-10` in `domains/player.md`), or orphaned `video_annotations`/`voice_notes` rows after a session delete (`PLAYER-GAP-11`).
- **Probing actual Postgres RLS behavior** — the single biggest unknown across the entire reverse-engineering pass. Nearly every domain document says some version of "protected by a client-side check plus assumed RLS, content `UNKNOWN` from this repo" (see `ADMIN-GAP-002/003`, `MKT-GAP-07`). The only way to actually answer that is a direct-DB test: hit a table with the **anon key**, as an unauthorized role, and confirm the read/write is actually rejected — rather than continuing to infer enforcement from application code that never touches RLS directly.

---

## 4. Requires external integrations

| Integration | Current treatment |
|---|---|
| Stripe (Checkout / Portal / Connect / Webhook / Invoices) | Real test-mode API, deliberately not mocked |
| Anthropic Claude | Mocked in unit/API tests; real-call loose-assertion E2E smoke tests (coach-chat, generate-action-plan) |
| Supabase Auth / DB / Storage | Real dev project in E2E; mocked at module level in API tests |
| Gmail (`nodemailer`) | Mocked only — **never exercised against a real inbox**, in E2E or otherwise (verified: no "disposable inbox" wiring exists anywhere in the repo, despite that being floated as a plan early this session) |
| ClickSend SMS | MSW-mocked only — same gap as Gmail |
| Google Maps Geocoding | MSW-mocked only |
| MediaPipe pose (client-side WASM) | Real, in-browser, tested against a synthetic no-person fixture (rejection path only) |
| ffmpeg.wasm transcode | Real, exercised implicitly by the video-pipeline E2E test |

---

## 5. Requires different user roles

The 5-role Playwright fixture (serial-login `setup` project → per-role `storageState`) covers the common "own roster only" case well. What it does **not** cover:

- **Multi-linked-identity role switching** (`POST /api/switch-role`, the NavBar role switcher) — zero test files exist for this mechanism at all, despite it being security-relevant (see the Auth domain's coverage gaps in `traceability.md`). No seed fixture even has more than one linked identity to exercise it with.
- Guardian consent (a `parent` account confirming for a specific minor `player`) — the pairing exists in the seed data in principle, but the age-boundary logic (`Senior` vs. not) isn't stress-tested at the boundary.
- Cross-academy/cross-coach **negative** tests (coach A cannot touch coach B's player) exist for the happy "own roster" path but are not exhaustive across every route that should reject cross-tenant access.

---

## 6. Requires special configuration

`CRON_SECRET` (bearer auth for the daily job), `STRIPE_WEBHOOK_SECRET` (signature verification), `SUPABASE_SERVICE_ROLE_KEY`, provider API keys (Anthropic / Gmail / ClickSend / Google Maps), and — critically — **Stripe test-mode keys pointed at a dev Supabase project, never production**, a hard rule for this whole test-infrastructure effort.

Plan-tier gating (`Free` / `Player Pro` / `Coach Pro`, see `lib/plan-features.ts`) also means several specs are really configuration tests in disguise: the single seeded player's plan tier is load-bearing for multiple unrelated specs simultaneously (`find-coach.spec.ts` needs `Free`; the video-pipeline spec needed an assessment credit *without* changing that same player's plan tier). This cross-spec fragility is itself a testability constraint worth tracking, not just an implementation detail.

---

## 7. Requires special test data

Already built: an idempotent `e2e-`-prefixed seed/reset system with 5 role fixtures plus one academy/coach/player/flagged-report. Gaps are in the *data*, not the mechanism:

- No fixture academy with `payout_model: split_by_coach` **and** a Connect-onboarded coach — both marketplace payout branches (`head_coach` vs. `split_by_coach`, see `domains/marketplace.md` BR-5) cannot currently both be exercised, and Connect onboarding itself is confirmed broken against the live Stripe account (`MKT-GAP-04`), so a real onboarded test coach cannot even be created manually right now.
- No near-expiry / expired session-pack credit fixture (`isPackCreditExpired` boundary).
- No article-read-count boundary fixture (exactly 4 vs. exactly 5 Foundation reads — the Mechanics-stage unlock boundary in `domains/portal_content.md`).
- No multi-linked-identity account (see §5).
- A real human bowling-delivery video — **structurally unavailable**, not merely missing. This is the actual reason the pose-detection happy path has no automated coverage (`PLAYER-GAP-02`), a deliberate, already-made decision this session rather than an oversight.

---

## 8. Requires mocking

Established, working pattern: `@anthropic-ai/sdk`, `nodemailer`, and Supabase (`@supabase/ssr` / `@supabase/supabase-js`) mocked at module level for API-layer tests via a shared chainable fake (`tests/mocks/supabase.ts`); ClickSend / Google Maps via MSW, scoped per-test-file (global MSW was found to hang the real Stripe SDK's HTTP calls — a documented incompatibility discovered this session, not a style choice). Stripe and E2E-scoped Supabase are the deliberate exceptions, never mocked.

**One underused option worth calling out:** `computeBiomechanics()` (`lib/biomechanics.ts`) takes a plain pose-frame-sequence array as input — it could be **unit-tested with a fabricated frame array**, entirely independent of MediaPipe or a real video file, to get real coverage of the biomechanics math itself. That is materially different from (and achievable, unlike) what was explicitly scoped out this session — the full video → MediaPipe → biomechanics pipeline on a real human — and would close part of `PLAYER-GAP-02` without needing the unobtainable video fixture.

---

## 9. Requires multiple browsers/devices

Currently **zero** cross-browser coverage — `playwright.config.ts` runs every project on `devices["Desktop Chrome"]` only; no Firefox, WebKit, or mobile-emulation project exists (verified directly in the config). This matters more than usual here because:

- `lib/video-quality.ts`'s FPS measurement depends on `requestVideoFrameCallback`, historically inconsistent across browsers. The code degrades gracefully (`fps: null`, treated as "unknown," never a hard failure) — but that fallback path has never actually been exercised in CI on a browser where it would trigger.
- ffmpeg.wasm and MediaPipe WASM performance/compatibility across browser engines is unverified.
- No responsive/mobile-viewport testing exists at all, despite this being a video-capture-heavy product plausibly used on phones in the field.

---

## 10. Cannot currently be tested easily

- **The real pose-detection happy path.** No fixture exists or can be fabricated; the only realistic path forward is periodic manual verification with a real clip, as already documented in `PLAYER-GAP-02`.
- **Postgres RLS policy content.** Not versioned anywhere in this repo; can only be probed indirectly (§3), never reviewed as code.
- **Webhook redelivery / idempotency.** Technically testable — POST the same signed Stripe event twice — but nobody has written that test yet, and it is the single highest-value missing test in the app given the confirmed double-credit bug (`PAY-GAP-002`).
- **Stripe Connect coach onboarding, end to end.** Cannot currently be tested *or even manually verified* — the real Stripe account itself rejects Express account creation (`MKT-GAP-04`).
- **Race conditions.** The non-atomic session-pack draw-down (`sessions_used`, fetch-then-write, `MKT-GAP-09`) would need genuinely concurrent requests to reproduce; Vitest's in-process model and Playwright's serial-per-test model don't naturally produce that without deliberate harness work (e.g. `Promise.all` of two direct route calls racing against the same pack).
- **Real email/SMS delivery.** Mocked everywhere; nothing in this repo has ever sent a real message to a real inbox or phone, despite that being floated as a goal early this session.
- **The daily cron's actual production trigger.** The route's own logic is testable; whether GitHub Actions' `schedule:` reliably fires in production is not something this test suite can verify at all.
- **Push notifications, the tip archive, PDF certificates.** Nothing to test — these don't exist in code (`PORTAL-GAP-003`, `PORTAL-GAP-004`).

---

## Where to act first

If prioritizing by "closes a real, already-confirmed gap" rather than by category, the highest-leverage next tests are: (1) a webhook-redelivery idempotency test, (2) an `computeBiomechanics()` unit test against a fabricated frame array, (3) a direct-DB/anon-key probe of RLS on at least the marketplace-booking and admin-KPI tables, and (4) a minimal `switch-role` API test suite. All four are achievable with the existing test infrastructure — none require new tooling, only new test files.
