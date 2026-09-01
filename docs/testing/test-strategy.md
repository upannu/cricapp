# QA Test Strategy — CricHQ / PACE HQ (Refreshed for Current Codebase)

This strategy is rebuilt against the **fresh** reverse-engineering pass at [`docs/reverse-engineered/`](../reverse-engineered/) (270 requirements, post-120-commit-merge), superseding the prior strategy document, which was built against the pre-merge, 194-requirement analysis. It converts the fresh analysis into an executable QA program: what to test, how, in what order, with what data, and when to stop.

---

## 0. What changed since the last strategy, and why this had to be rebuilt

The prior strategy assumed a 194-requirement, 3-role-gating-plan-tier, single-currency application. That's no longer accurate: the app now has 270 requirements, a Plan-Catalog-driven (admin-configurable) feature-gating model, multi-currency support, a coach-subscription product, a referral/commission program, an AI report-review gate, and three new scheduled jobs. It also just underwent a real security hardening (RBAC data moved from `user_metadata` to `app_metadata`) that invalidated most of the existing test suite's fixtures without invalidating the features those tests were checking. None of the old strategy's specific test-data assumptions, priority calls, or risk register entries can be trusted without re-deriving them — so this document was rewritten, not patched. See [`docs/reverse-engineered/reverse-engineering-delta.md`](../reverse-engineered/reverse-engineering-delta.md) for the full itemized change list this strategy is built against.

---

## 1. Scope

**In scope:** every route/page/component/lib module documented in the fresh `docs/reverse-engineered/` pass — 270 requirements across Auth, Player, Marketplace, Academy/Admin, Portal/Content, and Payments Core. Explicitly including everything new this merge: coach subscriptions, referrals, multi-currency, report review, the 3 new crons, Email Templates, and the 4 new public pages.

## 2. Out of scope

Same structural exclusions as before: Postgres RLS policy *content* (still unversioned in this repo, still treated as an unverified trust boundary — see §11), Vercel/CI infrastructure configuration itself, `web/public/mediapipe/` internals, the still-unbuilt quote-based B2B model, load/capacity testing at scale, and — always — production data, production Stripe, production Supabase, or production Anthropic accounts.

## 3. Application Components

| Component | Domain doc | Requirement count | New this merge |
|---|---|---|---|
| Auth, RBAC, account lifecycle | `auth.md` | 55 | `/register`, `/api/complete-signup`, auto-approval rule, `app_metadata` migration |
| Players, sessions, video/pose, reports, performance | `player.md` | 67 | Report-review workflow, independent-coach roster, multi-currency |
| Marketplace, bookings, packs, Stripe commerce | `marketplace.md` | 41 | Coach Pro subscriptions, referral program, cash-payment ledger |
| Academy management, B2B billing, platform admin | `academy_admin.md` | 25 | Email Templates, multi-currency plan pricing (replacing the removed pricing page) |
| Player/parent portal, Academy content, messaging | `portal_content.md` | 25 | 4 public pages, global Footer, Contact form |
| Stripe webhook, cron, invoicing, AI chat | `payments_core.md` | 57 | 3 new crons, coach-subscription webhook branches, currency-aware invoicing |

## 4. Test Levels

Unchanged in shape from the prior strategy — Unit / Component / API (route-handler) / E2E / Exploratory, with the same rationale (async Server Components force page-level testing to E2E; everything else gets the cheapest level that can prove it). What's different: the **API level's mock fixtures need updating first** (§0) before any of the currently-failing 118 tests can be trusted as a regression signal again — this is the single highest-leverage action available before doing anything else in this plan.

## 5. Test Types

Unchanged taxonomy: Functional, Validation, Business Rule, API, Data, Security/Authorization, Error-Handling, Integration, Boundary, Negative, State-Transition, Regression, Exploratory — now additionally exercised against: multi-currency price resolution, Plan-Catalog-driven gating, the report-review state machine, and cron-triggered automatic financial actions (a genuinely new risk category — see §21).

## 6. Test Environments

Unchanged (dev Supabase project, Stripe test mode, Vercel Preview, GitHub Actions CI) with one new consideration: **the dev Supabase project's schema must actually have the new columns/tables this merge introduced** (`players.currency`, `academies.country`/`currency`, `reports.review_status`, `plans.prices_by_currency`/`sessions_per_month_limit`/`chat_messages_per_day_limit`/`ai_reports_enabled`/`marketplace_enabled`, and the unconfirmed `booking_reminder_log` table — see `payments_core.md` `PAY-GAP-013`) before any test in this plan can run against it. This is an entry-criterion, not an assumption — verify before starting (§19).

## 7. Test Data Requirements

Full catalog in [`test-data.md`](./test-data.md), rebuilt for currency/referral/cron/report-review test data needs that didn't exist in the prior catalog.

## 8. User Roles

Unchanged five roles, now scoped via `app_metadata`. One new access pattern: player/parent can now reach their own `/players/[id]/subscription` page directly (previously fully redirected for academy players) — worth its own explicit test given it's a narrow, deliberate carve-out in an otherwise strict confinement rule.

## 9. Browser/Device Coverage

Unchanged from the prior strategy (still zero cross-browser coverage, still the same recommendation to add a WebKit project for the video pipeline).

## 10. API Testing Strategy

Same in-process route-handler pattern as before. **New, urgent addition**: before any other API testing proceeds meaningfully, `web/tests/mocks/caller.ts`'s shared `rawUser()` fixture helper needs its `user_metadata` construction changed to `app_metadata` (or updated to build both, if any code path still legitimately reads the old field) — see `gaps.md`'s root-cause section. This document does not perform that fix (test files are out of scope for this phase), but flags it as the #1 recommended next action for whoever picks this plan up.

## 11. Database Validation Strategy

Unchanged two-part strategy (state-after-action verification, RLS probing) — now with new state-after-action targets specific to this merge: does `pack-auto-consume` actually only ever draw down a credit when it should (§21), does the referral-commission cron's stored amount match a manually currency-converted expectation, does `reports.review_status` actually gate player/parent visibility server-side or only in the UI query.

## 12. Security Testing Strategy

Unchanged strategy shape (authorization-matrix testing, IDOR sweeps, unapproved-account bypass, RLS probing), now re-scoped to the current attack surface: every new route (`referrals/*`, `bookings/mark-*`, `packs/*`, `players/update-currency`, `reports/review`, `email-templates/update`) needs the same authorization-matrix treatment as the pre-existing routes did. The unapproved-account-bypass class of bug (`AUTH-GAP-001`) was re-flagged, not confirmed fixed, by this pass — treat it as still live until proven otherwise.

## 13. Integration Testing Strategy

Unchanged three-tier approach (Stripe real/test-mode, Anthropic mocked+smoke, Gmail/ClickSend/Maps mocked-only) — now with Stripe's surface meaningfully larger (coach subscriptions, referral payouts are manual/off-Stripe so not a Stripe integration test target, but the coach checkout/portal routes are).

## 14. Negative Testing Strategy

Unchanged dimension set, now newly applied to: currency selection (an unsupported currency code, a currency mismatch between academy and player), the report-review state machine (attempting to view a report stuck in `under_review`), and the new cron jobs (what happens if `pack-auto-consume` runs twice in one day, or `booking-reminders` fires for a booking that gets cancelled between the reminder window opening and the cron actually running).

## 15. Boundary Testing Strategy

All prior named thresholds still apply (§15 of the old strategy, unchanged since those features didn't change) **plus** new ones this merge: the report-review state transitions themselves are a 3-state boundary set worth testing at every edge (not_reviewed→under_review, under_review→completed, and the "can a player see it" check evaluated at each state); the booking/session-reminder crons' "0–3 hours before" window boundaries; the independent-coach roster cap (at exactly the cap, one over).

## 16. Exploratory Testing Strategy

Same 12-charter structure as before (`exploratory-tests.md`), with charter content refreshed for the new attack/exploration surface — particularly Charter 8 (Security, now including the referral/currency and auto-debit-cron surfaces) and Charter 9 (Data Integrity, now the natural home for personally verifying the two new Tier-1 defects).

## 17. Regression Strategy

**Materially different from before.** The existing automated suite (386 tests as of the last strategy) currently has 118 Vitest failures stemming from the stale test-mock issue (§0/§10) — meaning the regression gate is not currently green, and "the CI-gated suite is the regression suite" (the prior strategy's core claim) needs that fixture fix landed before it's true again. Until then, this plan's regression strategy is: fix the shared mock helper first (out of this phase's scope to perform, but the explicit first recommendation), re-establish a green baseline, then treat that baseline as the regression gate going forward, same as before.

## 18. Automation Strategy

Unchanged conventions (new route → API test, new page → E2E only, new component → RTL test, new `.from("table")` → update `schema-notes.md`). New convention this merge should adopt but doesn't yet, per the gaps found: **new scheduled/cron routes need a test file in the same PR that adds them** — the three new crons and the referral-commission cron all shipped without one; this is a policy gap worth closing going forward, not just a backlog item.

## 19. Entry Criteria

Unchanged in shape, with one new item: **the dev Supabase schema must have the new columns/tables this merge requires** (§6) before E2E or any DB-touching test is meaningful. Verify via `schema-notes.md`/live introspection before starting, don't assume.

## 20. Exit Criteria

Unchanged shape (all P0 pass, no untracked new P0 `NOT_EXECUTED`, every new defect logged not silently worked around) — now explicitly requiring an accept/fix decision on the **8 Tier-1 gaps** (2 new, 6 carried-forward-unresolved) before a release, not the prior 6.

## 21. Risks

- **NEW, HIGH: automatic financial actions with no human confirmation.** `pack-auto-consume` debits a real customer entitlement on a schedule, unattended. This is a new *class* of risk this codebase didn't have before (everything previously either required a human click or a Stripe-side event) — testing strategy for this class needs to include "what happens when the automation is wrong," not just "does the automation run."
- **NEW, HIGH: multi-currency correctness**, demonstrated already-failing in the referral cron. Any code that aggregates money across records needs an explicit currency-consistency test, not just a happy-path currency-display test.
- **CARRIED FORWARD:** everything in the prior strategy's risk register that wasn't specifically fixed by this merge — RLS as an unverified trust boundary, no real email/SMS delivery ever verified, no load/capacity testing, the two root-level planning docs actively misleading anyone who reads them as current.
- **NEW, MEDIUM: three brand-new subsystems with zero test coverage** (crons, Email Templates, referrals) are shipping features, not just documentation gaps — each is a live, reachable, unguarded surface in production-adjacent code right now.
- **PROCESS RISK:** this fresh QA pass itself has thinner test-case density than the prior one in places (`docs/reverse-engineered/README.md §4`) — compensated for in this document set's `test-cases.md`, but worth remembering that "documented" and "exhaustively tested" are not the same claim.
