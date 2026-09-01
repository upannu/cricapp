# System Architecture / Component Overview (Fresh Analysis)

Reverse-engineered from the **current** codebase at `c:\Development\Cricket\CricApp`, on branch `test/batch-0-harness` after merging 120 commits from `origin/master` (merge commit `3d8fdf2`, 133 files changed, 8,290 insertions). This replaces the prior architecture document, which described the codebase as of 2026-08-20 — before that merge landed. See [`reverse-engineering-delta.md`](./reverse-engineering-delta.md) for a full before/after comparison, and [`reverse-engineering-summary.md`](./reverse-engineering-summary.md) for the executive summary of this pass.

**Methodology:** six parallel fresh analyst passes (one per domain), each instructed to read only current source code as ground truth — the prior analysis and existing tests were treated as weak historical evidence only, never trusted. Two of the six agents were interrupted once by a session rate limit before writing anything and were successfully relaunched from scratch; the other four (and the relaunched two) completed cleanly. No application code or existing test file was modified to produce this document set.

---

## 1. The single most important change: `user_metadata` → `app_metadata`

Every domain agent independently confirmed the same finding: **RBAC identity fields (`role`, `approved`, `academy_id`, `coach_id`, `player_id`, `linkedIdentities`) have been relocated from Supabase `user_metadata` to `app_metadata`.** `user_metadata` is now used only for the display-only `name` field.

This is a genuine security hardening. `user_metadata` is writable by a signed-in client via `supabase.auth.updateUser()`; `app_metadata` is server-only, settable exclusively via the Supabase Admin API with the service-role key. Before this merge, a client-side call could, in principle, attempt to overwrite its own role/approval/scoping fields — that avenue is now closed.

**This single change explains nearly all of the test-suite breakage discovered earlier in this session.** `web/tests/mocks/caller.ts`'s `rawUser()` helper — the shared fixture builder used across dozens of API route tests — still constructs fake users via `user_metadata`. Against current route code, every one of those role checks now resolves to `undefined` and returns 403 where a test expects 200/400/404/502. This was independently confirmed by direct source-and-test reads in five of the six domains (Auth, Academy/Admin, Marketplace, Portal/Content, Payments Core) — it is not five separate bugs, it is one root cause with five symptoms. **The fix is a one-line-per-call-site change to `tests/mocks/caller.ts`, not 42 separate test rewrites** — see `gaps.md`'s cross-domain synthesis.

---

## 2. What else changed (system-wide)

| Area | What's new |
|---|---|
| **Multi-currency** | `web/lib/currency.ts` — a `Currency` type and `resolvePlanPrice`/`formatMoney`/`isSupportedCurrency` helpers. `Player`, `Coach`, and `Academy` all gained a `currency` field; an academy's currency derives from its `country` (new required field) at creation. India (`inr`) is supported for individual purchases but excluded from academy `COUNTRY_OPTIONS` since Stripe Connect Express doesn't support India as a connected-account country. |
| **Plan-Catalog-driven feature gating** | `web/lib/plan-features.ts` (+108 lines) — every gating function (`canUseMarketplace`, `canGenerateAiReports`, `sessionsLimitForPlan`, `chatMessagesLimitForPlan`, plus three new coach-side equivalents) now takes a **second argument, `plans: Plan[]`**, and resolves limits from the admin-editable Plan Catalog (`marketplaceEnabled`, `aiReportsEnabled`, `sessionsPerMonthLimit`, `chatMessagesPerDayLimit` on each `plans` row) instead of a hardcoded 3-tier rank. Falls back to old hardcoded defaults only if no matching `plans` row is passed. |
| **Coach Pro subscriptions** | A coach can now subscribe to their own Coach Pro plan directly (`create-coach-checkout-session`, `create-coach-portal-session`, `CoachSubscriptionPage`) — distinct from a player's Player Pro or an academy's org billing. Gates independent-coach marketplace visibility and roster caps. |
| **Referral/commission program** | Entirely new: platform-admin-recorded referrals (one-off bonus or ongoing % of revenue), a monthly cron (`cron/referral-commissions`) that computes ongoing commissions, manual payout reconciliation. **Confirmed bug:** the cron sums multi-currency revenue with no conversion and displays it as flat AUD (`gaps.md` Tier 1). |
| **Report review workflow** | `ReportReview.tsx` + `/api/reports/review` — a generated report now sits in `not_reviewed → under_review → completed` state; player/parent visibility and auto-email are gated on `completed`. Auto-email-on-generation was **removed** entirely. Shipped with **zero test coverage**. |
| **Three new cron jobs** | `booking-reminders`, `pack-auto-consume`, `session-reminders` — all new, all sharing `web/lib/cron-time.ts` (Sydney-timezone helper), all using the same `CRON_SECRET` bearer pattern as the original `pack-reminders` cron. `pack-auto-consume` **automatically debits a session-pack credit with no human in the loop** if nobody marks attendance for an agreed recurring-session day. All three shipped with **zero test coverage**. |
| **Platform pricing page removed** | `/admin/pricing` and `PlatformPricingClient.tsx` are gone. `PlatformSettings` (the type) is gone from `lib/types.ts`. The old `platform-settings/update` route was **renamed** (not just deleted, confirmed via git history) to `email-templates/update` — but its actual purpose narrowed entirely to editing 4 role-scoped welcome-email templates; it carries zero platform-pricing logic. Player Pro / Coach Pro pricing now lives in the Plan Catalog's new `pricesByCurrency` field. |
| **Email templates subsystem** | `EmailTemplatesAdminClient.tsx`, `lib/email-templates.ts`, an HTML-shell rendering system now used by the Contact form, article-publish notifications, and welcome emails. |
| **Public self-registration (`/register`)** | A public, code-gated lead-capture form that writes directly to `players` with **no Supabase Auth account created**. A separate `/signup` with the same email is how that person later gets an actual login, via `/api/complete-signup`. |
| **New signup auto-approval rule** | `player`/`parent` self-signups now auto-approve immediately (no admin review) if their submitted email resolves to an existing `players` row — a genuinely new business rule. `academy_admin`/`coach` self-signups are unchanged (still queued for platform-admin approval). |
| **Public marketing/legal pages** | `/about`, `/contact`, `/privacy`, `/terms` — new, outside `(dashboard)`, no auth required, reachable even by a signed-in user (unlike `/login`/`/signup`). A new global `Footer` now renders on every authenticated dashboard page too. `/api/contact` is a public, unauthenticated mail-sending endpoint with **no spam/rate-limit protection** and **zero test coverage**. |
| **Cash-payment reconciliation ledger** | New routes (`bookings/mark-paid`, `bookings/record-fee-due`, `bookings/mark-fee-collected`, `packs/record-fee-due`, `packs/mark-fee-collected`, `bookings/notify-created`) let staff manually reconcile the platform's fee cut when a booking/pack is paid outside Stripe (cash/bank transfer). |
| **Invoice model** | `NormalizedInvoice.amountAud` → `amount`, now genuinely currency-aware (`currency: string`, rendered via `formatMoney`). |

---

## 3. Actors / Roles

Unchanged: five roles (`platform_admin`, `academy_admin`, `coach`, `player`, `parent`), defined in `web/lib/types.ts` (`UserRole`). What changed is **where** their scoping data lives (`app_metadata`, not `user_metadata` — §1) and two behavioral details: player/parent self-signup now auto-approves (§2), and player/parent can now reach one specific page outside `/portal` — their own `/players/[id]/subscription` page (previously redirected away entirely for academy players).

---

## 4. Authorization architecture (updated)

The three-layer model from the prior analysis still holds structurally, with one layer's data source changed:

1. **Edge middleware** (`web/middleware.ts`) — still session-presence-only, still no role/approval check. Gained two new allowlists: `isPublicPage` (`/login`, `/signup`, `/forgot-password`, `/reset-password` — bounces a signed-in visitor away) and a new, distinct `isAlwaysPublicPage` (`/about`, `/contact`, `/terms`, `/privacy`, `/register` — reachable regardless of session state, never bounces anyone). `/api/contact`, `/api/public-register-player`, and `/api/complete-signup` joined the auth-exempt API allowlist.
2. **Client-side `AuthGuard.tsx`** — same job (approval gate, player/parent confinement to `/portal`), now with one carve-out: a player/parent's own subscription page.
3. **Per-route/per-page server-side checks** — same duplicated-logic risk as before (`callerCanAccessPlayer()` vs. `canAccessPlayerServer()`), now both confirmed reading from `app_metadata`. The AUTH-GAP-001-style "approved not checked, only role" risk from the prior analysis was **not independently re-verified as fixed or still-present** by this pass — flagged `REQUIRES VALIDATION` in `auth.md`, not asserted either way.

---

## 5. Data model — confirmed changes

No migrations exist in this repo (schema still lives entirely in the hosted Supabase project). Confirmed new/changed columns this pass (via typecheck errors and direct route reads, not guessed): `players.currency`, `coaches.currency`, `academies.country`, `academies.currency`, `reports.review_status` (+ reviewer/timestamp fields), `plans.prices_by_currency`, `plans.sessions_per_month_limit`, `plans.chat_messages_per_day_limit`, `plans.ai_reports_enabled`, `plans.marketplace_enabled`, `plans.locked`. A `booking_reminder_log` table is referenced by the new `booking-reminders` cron but is **not documented anywhere in this repo's `schema-notes.md` or `seed.ts`** — its existence in the live database is unconfirmed from source alone (flagged in `payments_core.md`).

---

## 6. Component map by domain (requirement counts, this pass)

| Domain doc | ID prefix | Requirement count | Key new subsystems this pass |
|---|---|---|---|
| [`domains/auth.md`](./domains/auth.md) | `AUTH-` | 55 | `app_metadata` migration, `/register` public self-registration, `/api/complete-signup`, auto-approval for player/parent |
| [`domains/player.md`](./domains/player.md) | `PLAYER-` | 67 | Report-review workflow, independent-coach self-service roster, multi-currency, 3 new player-record routes |
| [`domains/marketplace.md`](./domains/marketplace.md) | `MKT-` | 41 | Coach Pro subscriptions, referral/commission program, cash-payment reconciliation ledger |
| [`domains/academy_admin.md`](./domains/academy_admin.md) | `ADMIN-` | 25 | Platform pricing page removed → Plan Catalog multi-currency pricing, Email Templates admin |
| [`domains/portal_content.md`](./domains/portal_content.md) | `PORTAL-` | 25 | 4 new public marketing/legal pages, global Footer, public Contact form |
| [`domains/payments_core.md`](./domains/payments_core.md) | `PAY-` | 57 | 3 new cron jobs (incl. auto-debit), Coach Pro webhook branches, currency-aware invoicing |

**Total: 270 requirements** (up from 194 in the prior analysis — see `reverse-engineering-delta.md` for the full accounting of what's new/changed/removed).

---

## 7. A genuinely new, real defect found this pass

`web/app/api/cron/referral-commissions/route.ts` sums raw booking/pack revenue across academies with different currencies (AUD/GBP/USD/NZD, per the new `Academy.currency` field) **with no currency conversion**, then both stores and displays the result as a flat AUD amount (`ReferralsClient.tsx` hardcodes `formatMoney(amount, "aud")`). The moment any referred academy, coach, or player operates in a non-AUD currency with an active ongoing-commission referral, this produces a silently wrong commission figure — a real money-correctness bug, not a hypothetical. See `gaps.md` Tier 1 and `marketplace.md` MKT-GAP-20.

---

## 8. How to use the rest of this documentation set

Same structure as before: [`requirements.md`](./requirements.md) for the full 270-requirement list, [`business-rules.md`](./business-rules.md) for consolidated decision logic, [`workflows.md`](./workflows.md) for end-to-end traces, [`test-cases.md`](./test-cases.md) and [`traceability.md`](./traceability.md) for coverage, [`gaps.md`](./gaps.md) for the ranked defect/ambiguity list (start there if pressed for time), and [`reverse-engineering-delta.md`](./reverse-engineering-delta.md) specifically for "what changed since last time."
