# Marketplace Domain — Bookings, Session Packs, Coach Discovery, Coach Subscriptions, Referrals & B2C Stripe Commerce

Reverse-engineered from the live codebase at `c:\Development\Cricket\CricApp\CricApp` immediately after a 120-commit merge from `origin/master` (2026-09-01) that closed a real privilege-escalation hole (RBAC data — `role`, `approved`, `academy_id`, `coach_id`, `player_id`, `linkedIdentities` — moved from client-writable Supabase `user_metadata` to server-only `app_metadata`) and landed two brand-new subsystems in this domain: **coach-side subscriptions** and a **referral/commission program**. This document describes what is **actually implemented in the current code**, not what an older analysis said and not what the (now substantially stale) existing test suite asserts. Every claim is sourced to a file; ambiguous/unconfirmable items are marked `REQUIRES VALIDATION`.

**Important test-suite caveat (verified in this pass, not assumed):** `web/tests/mocks/caller.ts:rawUser()` — the single shared helper nearly every route test in this domain uses to fabricate a signed-in caller — still builds `{ id, user_metadata: metadata }`. Every route this domain touches now reads `user.app_metadata?.role` / `.coach_id` / `.player_id` (confirmed by direct source read of all Stripe/booking/pack routes below). This means **every existing test built on `rawUser()` resolves `role` as `undefined`**, so authorization branches take the wrong path and assertions fail with the wrong status code — a test-harness bug, not evidence the routes themselves are broken. Existing test files are cited here only as weak historical context, per the citation rule, and their pass/fail state is never asserted.

---

## 1. Domain Overview

This domain covers the **B2C coach marketplace and commerce layer**: how an individual player (or their parent) discovers a coach, books and pays for a session, buys a bulk session pack, subscribes to Player Pro / Library / Assessment credits; how an **independent coach** now subscribes to their own Coach Pro plan; how coaches get paid out via Stripe Connect; how **referrers** (people who bring new academies/coaches/players onto the platform) earn one-off or ongoing commissions; and how staff manually reconcile the platform's own fee cut when a booking/pack is paid outside Stripe. It explicitly excludes the Stripe **webhook** implementation itself (`web/app/api/stripe/webhook/route.ts`), **academy/B2B org billing** (`create-academy-checkout-session`, `create-academy-portal-session`), and **invoice history retrieval** (`api/stripe/invoices*`) — other agents' domains — though all are referenced here at their handoff points.

**Core entities:** `Coach` (now carries `currency`, `subPlan`, and its own `stripeCustomerId`/`stripeSubscriptionId`/`subscriptionStatus`), `Booking`, `SessionPack`, `Academy` (now carries `currency`, derived from `country`), `Plan` (catalog rows — now carries `pricesByCurrency`, `sessionsPerMonthLimit`, `chatMessagesPerDayLimit`, `aiReportsEnabled`, `marketplaceEnabled`), `Referral` / `ReferralPayout` (new), `PackFeeDue` / `BookingFeeDue` (new).

**Core flows implemented:**
1. Player Pro subscription checkout, billing portal (`create-checkout-session`, `create-portal-session`)
2. Session-pack / one-off booking purchase, Stripe Connect destination-charge payout, now currency-aware (`create-pack-checkout-session`, `create-booking-checkout-session`)
3. One-time AI-assessment credit purchase, content-library subscription (`create-assessment-checkout-session`, `create-library-checkout-session`)
4. Coach Stripe Connect Express onboarding (now country-aware) and Express dashboard login-link (`connect/onboard`, `connect/login-link`)
5. **NEW — Coach's own Coach Pro subscription checkout + billing portal** (`create-coach-checkout-session`, `create-coach-portal-session`, `CoachSubscriptionPage`)
6. Coach directory management (`CoachesClient`, now with Coach-Pro-gated marketplace visibility for independent coaches) and player-facing coach discovery/booking-request (`FindCoachClient`, gated by the now-2-argument `canUseMarketplace`)
7. Booking lifecycle management and completion (`BookingsClient`, `api/bookings/complete`), now with a booking-created confirmation email/SMS (`bookings/notify-created`) and a cash/bank-transfer payment ledger (`bookings/mark-paid`, `bookings/record-fee-due`, `bookings/mark-fee-collected`)
8. Session-pack draw-down, credit-back, and fee-due tracking (`SessionPacksClient`), with the same new cash-payment platform-fee ledger (`packs/record-fee-due`, `packs/mark-fee-collected`)
9. **NEW — Referral/commission program**: platform-admin-recorded referrals (one-off bonus or ongoing % of revenue), a monthly cron job that computes ongoing commissions, and manual "mark paid" reconciliation (`referrals/create`, `referrals/end`, `referrals/mark-payout-paid`, `cron/referral-commissions`, `ReferralsClient`)

**Architecture notes (verified):**
- Stripe prices for every catalog product (Player Pro, Coach Pro — now split into a player-facing route that no longer offers it and a dedicated coach route that does — Library, Individual Assessment) are still read from the `plans` table at request time via `resolvePlanPrice()`, never pre-created Stripe `Price` objects.
- Session-pack / one-off-booking amounts are still computed from `academy.sessionTypeFees` / `academy.sessionFeeAud`, not a catalog.
- **NEW — Multi-currency support** (`web/lib/currency.ts`): `Coach`, `Player`, and `Academy` all now carry a `currency` field. An academy's currency is derived from its `country` at creation and is what session fees/pack fees/Stripe Connect transfers for that academy are denominated in. A player's/coach's own `currency` governs their individual (non-Connect) purchases — Player Pro, Coach Pro, Library, assessments — via `resolvePlanPrice()`, which prefers an admin-set `plan.pricesByCurrency[currency]` override and falls back to the AUD price in AUD. India (`inr`) is a supported currency for individual purchases but deliberately excluded from `COUNTRY_OPTIONS` because Stripe Connect Express doesn't support India as a connected-account country — an academy cannot be "in India."
- **NEW — Plan-Catalog-driven feature gating** (`web/lib/plan-features.ts`, +108 lines, substantially rewritten): every gating function (`canUseMarketplace`, `canGenerateAiReports`, `sessionsLimitForPlan`, `chatMessagesLimitForPlan`, and the three new coach-side equivalents) now takes a **second argument, `plans: Plan[]`** — the caller's already-fetched Plan Catalog list — and looks up the tier's admin-editable row (`marketplaceEnabled`, `aiReportsEnabled`, `sessionsPerMonthLimit`, `chatMessagesPerDayLimit`) by slug, falling back to a hardcoded default only if that row is missing. This is a genuine behavioral change from the prior fixed `PLAN_RANK` 3-tier-rank system: **marketplace access is now admin-configurable per plan row**, not a hardcoded rank comparison. See MKT-038.
- **NEW — RBAC migration**: every route in this domain now reads caller identity from `user.app_metadata` (via `getCaller()` in `web/lib/server-auth.ts`, or inline `createServerClient(...).auth.getUser()` + `user.app_metadata?.role/coach_id/player_id` in the Stripe routes) instead of the old client-writable `user_metadata`. Confirmed by direct source read of every route below. See MKT-039.

---

## 2. Implemented Requirements

### MKT-001 — Player Pro subscription checkout
- **Category:** Functional / API / Integration
- **Description:** Creates a Stripe Checkout session (`mode: "subscription"`) for a player. Price is read from the `plans` table (`player-pro` or `coach-pro` slug) and resolved through `resolvePlanPrice()` against the player's own `currency`.
- **Component:** `web/app/api/stripe/create-checkout-session/route.ts`
- **Inputs:** `{ playerId, plan }`. `plan` validated via `isPaidPlan()` against `["Player Pro", "Coach Pro"]` (unchanged set — see MKT-040 below for why this is now a latent inconsistency).
- **Authorization:** Caller identified via `user.app_metadata` (CHANGED from `user_metadata`). 401 if not signed in. If caller role is `player`/`parent`, 403 unless `app_metadata.player_id === playerId`. Non-player/parent roles pass through unchecked (same asymmetry as before — MKT-GAP-02 still applies).
- **Business rules:** Creates a Stripe Customer on first purchase, persists `stripe_customer_id`. `metadata`/`subscription_data.metadata`/`client_reference_id` carry `{ player_id, plan }`. Checkout line item currency/amount now comes from `resolvePlanPrice(planRow.price_aud, planRow.prices_by_currency, player.currency)` rather than a flat AUD amount (CHANGED).
- **Error handling:** 500 if `plans` row missing; 404 if player not found; 502 on Stripe API failure.
- **Status:** IMPLEMENTED

### MKT-002 — Stripe Billing Portal session creation
- **Category:** Functional / API / Integration
- **Component:** `web/app/api/stripe/create-portal-session/route.ts`
- **Change from prior analysis:** Authorization now reads `app_metadata` (CHANGED); business logic otherwise identical — still requires an existing `stripe_customer_id` (400 if absent), still does **not** wrap `stripe.billingPortal.sessions.create(...)` in try/catch (confirmed by direct source read this pass — the same unguarded-call shape as MKT-008's confirmed defect).
- **Status:** IMPLEMENTED (PARTIALLY — same unverified Stripe-failure-path gap as before, MKT-GAP-06)

### MKT-003 — Session-pack purchase checkout (Stripe Connect destination charge)
- **Category:** Functional / API / Business Rule / Integration / Security-Authorization
- **Component:** `web/app/api/stripe/create-pack-checkout-session/route.ts`
- **Change from prior analysis:** Checkout `currency` is now the **academy's own `currency`** (`isSupportedCurrency(academy.currency) ? academy.currency : DEFAULT_CURRENCY`), not hardcoded AUD (CHANGED — code comment: "Same currency as the academy's Connect payout account — a transfer requires the charge and destination currencies to match"). Authorization now via `app_metadata` (CHANGED). Payout-destination resolution (head-coach vs. split-by-coach with silent fallback) and 10%-default platform fee are otherwise unchanged from the prior analysis.
- **Status:** IMPLEMENTED

### MKT-004 — One-off booking payment checkout (Stripe Connect destination charge)
- **Category:** Functional / API / Business Rule / Integration / Security-Authorization
- **Component:** `web/app/api/stripe/create-booking-checkout-session/route.ts`
- **Change from prior analysis:** Same academy-currency change as MKT-003, same `app_metadata` migration. Payout-destination logic (split pays the booked coach directly and hard-fails if not onboarded; head_coach pays the academy head coach) is unchanged.
- **Status:** IMPLEMENTED

### MKT-005 — One-time AI-assessment credit checkout
- **Category:** Functional / API / Integration
- **Component:** `web/app/api/stripe/create-assessment-checkout-session/route.ts`
- **Change from prior analysis:** Price now resolved via `resolvePlanPrice(plan.price_aud, plan.prices_by_currency, player.currency)` instead of flat AUD (CHANGED). `app_metadata` migration.
- **Status:** IMPLEMENTED

### MKT-006 — Content-library subscription checkout
- **Category:** Functional / API / Integration
- **Component:** `web/app/api/stripe/create-library-checkout-session/route.ts`
- **Change from prior analysis:** Same `resolvePlanPrice`/currency change, same `app_metadata` migration.
- **Status:** IMPLEMENTED

### MKT-007 — Stripe Connect Express onboarding (coach payouts)
- **Category:** Functional / API / Integration / Security-Authorization
- **Component:** `web/app/api/stripe/connect/onboard/route.ts`
- **Change from prior analysis:** `stripe.accounts.create()` now passes an explicit **`country`** — resolved from the coach's academy's `country` (defaulting to `"AU"` for an unaffiliated coach) — because "the connected account's payout currency is tied to its country and can't be changed later" (code comment). This is a genuinely new parameter versus the prior analysis's read of this route (CHANGED). Authorization logic (`app_metadata`-based; coach restricted to own id; `platform_admin`/`academy_admin` allowed) is otherwise the same shape.
- **Previously-confirmed defect status:** The prior analysis cited `connect/onboard.test.ts` asserting a hard 502 for any new coach because this Stripe test account rejected Express account creation entirely. **Not independently re-verified this pass** (test assertions are unreliable evidence right now per the `rawUser()`/`app_metadata` mismatch documented above, and this pass did not execute live Stripe calls). Whether the new `country` parameter changes that outcome is **REQUIRES VALIDATION**.
- **Status:** PARTIALLY_IMPLEMENTED (code path complete and correctly authorized; live Stripe-account capability REQUIRES VALIDATION)

### MKT-008 — Stripe Connect Express dashboard login-link
- **Category:** Functional / API / Integration / Security-Authorization
- **Component:** `web/app/api/stripe/connect/login-link/route.ts`
- **Confirmed by direct source read this pass:** `stripe.accounts.createLoginLink(coach.stripe_connect_account_id)` (line 49) is still called with **no try/catch**, unlike every sibling Stripe route in this file and domain — a Stripe-side rejection still becomes an unhandled exception/raw 500 rather than the app's structured `{ error }` JSON. `app_metadata` migration applied to the authorization check.
- **Status:** PARTIALLY_IMPLEMENTED (functional happy path; confirmed-by-source-read unhandled-exception defect persists, MKT-GAP-03)

### MKT-009 — Marketplace visibility gate (Free-plan paywall)
- **Category:** Business Rule / Functional / Security-Authorization
- **Description:** `Find a Coach` is gated behind `canUseMarketplace(player.subscription.plan, plans)`.
- **Component:** `web/lib/plan-features.ts:canUseMarketplace`, enforced in `web/components/FindCoachClient.tsx`.
- **CHANGED — no longer a fixed rank comparison:** `canUseMarketplace(tier, plans)` now does `findPlayerTierPlan(tier, plans)?.marketplaceEnabled ?? tier !== "Free"` — it looks up the tier's Plan Catalog row (`slug: free/player-pro/coach-pro`) and reads its admin-editable `marketplaceEnabled` boolean, falling back to "true for any non-Free tier" only if that row is missing. This means a platform admin can now, e.g., turn marketplace access off for Player Pro or on for Free entirely from `/admin/plans`, with no code change — a materially different (and more powerful) gating mechanism than the old hardcoded `PLAN_RANK[plan] >= 1`.
- **Security note (unchanged):** Still a **client-side, render-only gate** — confirmed this pass that `upsertBooking()` (`web/lib/db.ts`) is still a bare, unguarded `sb.from("bookings").upsert(b)` with no server-side plan-tier check. MKT-GAP-07 (server-side marketplace-bypass risk) persists unchanged.
- **Status:** IMPLEMENTED (client-side); server-side enforcement UNKNOWN

### MKT-010 — Coach discovery / search / filtering (Find a Coach)
- **Category:** Functional / Business Rule
- **Component:** `web/components/FindCoachClient.tsx`
- **Confirmed unchanged this pass** (full file re-read): same-academy-only filter for an academy-assigned player (`coach.academyId === myAcademy.id`), same free-text/age-group/geocoded-radius filtering, same distance sort. The prior analysis's MKT-GAP-08 (paywall copy promises "coaches beyond your own academy assignment" but the filter does the opposite for the common case) still applies verbatim — confirmed present in the current copy (line 95) and filter (line 104).
- **Status:** IMPLEMENTED (with the same cross-academy-visibility discrepancy)

### MKT-011 — Marketplace booking request (player → coach)
- **Category:** Functional / Business Rule
- **Component:** `FindCoachClient.tsx:RequestBookingModal`
- **Confirmed unchanged this pass:** `durationMins` hardcoded 60, fee via `getSessionFee(coach, academies, type, plans)`, `status: "Pending"` always, `source: "marketplace"` stamped. Fee display now currency-aware (`formatMoney(fee, academy?.currency ?? DEFAULT_CURRENCY)`, CHANGED cosmetically).
- **New gap this pass:** Unlike a staff-created booking (`BookingsClient.tsx:handleSave`, MKT-012/MKT-032), a marketplace booking request created here **never calls `/api/bookings/notify-created`** — the coach receives no automatic email/SMS confirmation that a new marketplace request landed on their schedule; they only find out by visiting Bookings. See MKT-GAP-23.
- **Status:** IMPLEMENTED

### MKT-012 — Booking creation (staff-side)
- **Category:** Functional / Validation
- **Component:** `web/components/BookingsClient.tsx:handleSave`
- **Confirmed unchanged this pass** for the core rules: fee auto-fill/override, waived-fee academies force `$0` and disable the input, pack-drawn bookings force `paymentStatus: "Paid"`, coach dropdown restricted to `Active` coaches and pre-filled/disabled for a `coach` caller.
- **NEW behavior:** On a brand-new booking (not an edit), `handleSave` now also fires a best-effort, fire-and-forget `POST /api/bookings/notify-created` (see MKT-032) — a failed send never blocks or rolls back the booking save.
- **Status:** IMPLEMENTED

### MKT-013 — Booking status lifecycle
- **Category:** Business Rule / State Machine
- **Confirmed unchanged this pass.** States, quick-action transitions, and the "only `api/bookings/complete` has server-side enforcement" observation all still hold.
- **Status:** IMPLEMENTED

### MKT-014 — Booking completion (session logging + XP + pack draw-down)
- **Category:** Functional / API / Business Rule / Security-Authorization
- **Component:** `web/app/api/bookings/complete/route.ts`
- **Confirmed byte-for-byte unchanged this pass** against the prior analysis: same validation order, same `xp += 50` / `sessions_count += 1` / `sub_sessions_used` pack-skip rule, same non-atomic fetch-then-write pack draw-down (MKT-GAP-09 persists), same `callerCanAccessPlayer()`-based authorization (now reading `app_metadata` inside `getCaller()`, CHANGED transitively).
- **Status:** IMPLEMENTED

### MKT-015 — "Credit to Pack" on a cancelled booking (BookingsClient) — confirmed-unfixed defect
- **Category:** Functional / Business Rule — **CONFIRMED DEFECT, STILL PRESENT**
- **Component:** `web/components/BookingsClient.tsx`, `BookingCard`, line ~942 (confirmed by direct source read this pass).
- **Description:** The "Credit to Pack" button still calls `updatePackPaymentStatus(activePack.id, activePack.paymentStatus)` — a no-op write of the pack's own current, unchanged payment status — and never increments `sessionCredits`, while still showing a "✓ Session credited" success state. The correct implementation continues to exist only on the Session Packs page (`SessionPacksClient.tsx:handleCredit`, confirmed this pass at line 417-425, which correctly does `sessionCredits: pk.sessionCredits + 1` via `upsertSessionPack`).
- **Status:** NOT_IMPLEMENTED — this merge did not touch or fix this defect. HIGH risk, unchanged from prior analysis (MKT-GAP-10).

### MKT-016 — Session-pack purchase & pack lifecycle (staff-created)
- **Category:** Functional / Validation / Business Rule
- **Component:** `web/components/SessionPacksClient.tsx:handleSave` (and the bulk-CSV import path, `handlePackCsvImport`)
- **Confirmed unchanged this pass:** required `playerId`/`academyId`, `feePerSession > 0` unless waived, `agreedDays.length > 0`, waived-fee packs immediately `paymentStatus: "Paid"`, `canAddPack = user?.role !== "coach"`.
- **Status:** IMPLEMENTED

### MKT-017 — Session-pack draw-down accounting
- **Category:** Business Rule / Data
- **Component:** `web/lib/utils.ts` — `getSessionFee`, `packPaceWeeks`, `packCreditExpiryDate`, `isPackCreditExpired`
- **Confirmed unchanged this pass** (full file re-read, function bodies identical to prior analysis).
- **Status:** IMPLEMENTED

### MKT-018 — Pack payment status tracking & "Fees Due" tab
- **Category:** Functional / Business Rule
- **Component:** `SessionPacksClient.tsx`, `pageTab === "Fees Due"`
- **Confirmed unchanged this pass** for the core tab logic. `MarkPaidButton`/`handleMarkPaid` now additionally triggers the new fee-due ledger flow — see MKT-035.
- **Minor new observation:** `handleMarkPaid` calls `markPackPaid(packId, paidDate)` **without `await`** (line 135) — unlike `BookingsClient.tsx`'s equivalent `handleMarkPaid`, which does `await markBookingPaid(...)`. The local state update (`setPacks(...)`) proceeds immediately regardless, so the UI is optimistic either way; a failed `markPackPaid` write would surface no error to the user. Minor inconsistency, not independently confirmed as user-visible.
- **Status:** IMPLEMENTED

### MKT-019 — Coach directory / roster management
- **Category:** Functional / Validation / Business Rule
- **Component:** `web/components/CoachesClient.tsx`
- **Confirmed unchanged this pass:** coach deletion guard (sole-head-coach block, reassignment modal), `marketplaceVisible`/`available`/`status` independence, fire-and-forget geocoding, email-uniqueness validation, `academyId` required on the staff "New/Edit Coach" form.
- **NEW business rule (this merge):** For an independent coach (`!editingCoach?.academyId`) editing their **own** profile (`user?.role === "coach" && user.coachId === editingId`), the `marketplaceVisible` checkbox is now **locked off** (`marketplaceLocked`) unless `editingCoach.subPlan === "Coach Pro"` — an inline note reads "Requires Coach Pro. [Upgrade](/coach/subscription) to become discoverable and get booked by players." Staff (who can also reach this form for any coach) are **not** subject to this lock — only a coach editing their own record. See MKT-026.
- **NEW UI section:** A "Your plan" panel (visible only to `user.role === "coach"` viewing their own, academy-less coach card) shows `Free`/`✓ Coach Pro` and a "Manage plan"/"Upgrade" link to `/coach/subscription`.
- **Status:** IMPLEMENTED

### MKT-020 — Fee/platform-fee calculation helpers
- **Category:** Business Rule / Data
- **Component:** `web/lib/utils.ts` — `getSessionFee`, `getPlatformFeePercent`
- **Confirmed unchanged this pass**, including the same client/server duplication caveat (MKT-GAP-11) — the checkout routes and the new fee-tracking routes (`record-fee-due`) each re-implement the identical `academy.plan_id → plans.platform_fee_percent ?? 10` lookup independently rather than sharing code.
- **Status:** IMPLEMENTED

### MKT-021 — Dead/orphaned local-storage payment & credit stores
- **Category:** Data — **Not wired to any UI**
- **Component:** `web/lib/payment-store.ts`, `web/lib/credits-store.ts`
- **Confirmed unchanged this pass** (both files re-read in full, byte-for-byte identical to the prior analysis; still zero import sites found).
- **Status:** NOT_IMPLEMENTED / dead code (MKT-GAP-12)

---

### MKT-022 — Coach Pro subscription checkout (NEW)
- **Category:** Functional / API / Integration / Security-Authorization
- **Description:** A coach's own paid subscription — separate from any academy's org billing and from a player's Free/Player Pro — priced from the same `coach-pro` Plan Catalog row the player-facing route used to also offer (Coach Pro is now conceptually "repurposed to be coach-only," per an in-code comment).
- **Component:** `web/app/api/stripe/create-coach-checkout-session/route.ts`
- **Inputs:** `{ coachId }` only — no `plan` parameter, since there is exactly one paid coach tier.
- **Authorization:** `app_metadata`-based; `role === "platform_admin"` or (`role === "coach" && ownCoachId === coachId`); 403 "You can only manage your own subscription" otherwise. 401 if not signed in.
- **Business rules:** Creates a Stripe Customer on first purchase and persists it on the `coaches` row (not `players`). Price resolved via `resolvePlanPrice(planRow.price_aud, planRow.prices_by_currency, coach.currency)`. `metadata`/`subscription_data.metadata`: `{ coach_id, type: "coach_subscription" }` — the webhook's handoff key (confirmed present in `web/app/api/stripe/webhook/route.ts` for both `checkout.session.completed` and subscription update/delete events, out of this domain).
- **Error handling:** 500 if plan row missing; 404 if coach not found; 502 on Stripe failure.
- **Status:** IMPLEMENTED

### MKT-023 — Coach Pro billing portal (NEW)
- **Category:** Functional / API / Integration
- **Component:** `web/app/api/stripe/create-coach-portal-session/route.ts`
- **Description:** Same shape as `create-portal-session` but for a coach's own `stripe_customer_id`. 400 "No billing account yet" if absent. Same authorization pattern as MKT-022.
- **Error handling gap (confirmed by direct source read):** `stripe.billingPortal.sessions.create(...)` (line 44) is **not** wrapped in try/catch — same unguarded shape as MKT-002/MKT-008.
- **Status:** IMPLEMENTED (PARTIALLY — same unverified Stripe-failure-path gap)

### MKT-024 — Coach subscription management UI (NEW)
- **Category:** Functional / UI
- **Component:** `web/components/CoachSubscriptionClient.tsx` (fetches the caller's own `Coach` row via `user.coachId`), `web/components/CoachSubscriptionPage.tsx` (plan cards, checkout/portal triggers, invoice history), `web/app/(dashboard)/coach/subscription/page.tsx` (trivial wrapper).
- **Business rules:** Plan cards built from `coachPlanFeatureLines(tier, plans)` for `"Free"`/`"Coach Pro"` (slugs `coach-free`/`coach-pro` — deliberately separate Plan Catalog rows from the player's `free`/`player-pro`, per an in-code comment: "an admin tightening the player Free tier's session cap shouldn't silently also change what an independent coach's Free roster cap is"). "Subscribe" disabled until a different plan than the current one is selected and the selection is a paid plan (`isPaidPlan`). Once `subscriptionStatus` is `active`/`trialing`, the only action offered is "Manage Billing" (portal), matching the player-side `SubscriptionPage` pattern.
- **Reuses `InvoiceHistoryList` with `scope="coach"`** — the invoice-history route (`api/stripe/invoices`, out of this domain) was extended to support a coach scope alongside player/academy.
- **Status:** IMPLEMENTED

### MKT-025 — Coach-tier plan-feature gating functions (NEW)
- **Category:** Business Rule / Data
- **Component:** `web/lib/plan-features.ts` — `canUseMarketplaceForCoach`, `canGenerateAiReportsForCoach`, `rosterCapForCoachPlan`, `coachPlanFeatureLines`
- **Business rules (verified):**
  - `canUseMarketplaceForCoach(tier, plans)`: `findCoachTierPlan(tier, plans)?.marketplaceEnabled ?? tier !== "Free"` — same admin-Plan-Catalog-driven pattern as the player-side `canUseMarketplace`, but reads `coach-free`/`coach-pro` rows.
  - `rosterCapForCoachPlan(tier, plans)`: an independent coach's own roster size cap — reuses the org-plan `seatCap` field; defaults `5` for Free, `null` (unlimited) for Coach Pro if the row is missing. **Confirmed enforced** in `web/components/PlayersClient.tsx` (`atRosterCap = rosterCap !== null && players.length >= rosterCap`, gating an independent coach's "Add Player" action) — this is the concrete, currently-wired consequence of Coach Pro for roster size.
  - `canGenerateAiReportsForCoach(tier, plans)`: same pattern for AI report generation — documented in `plan-features.ts` as gating "AI biomechanics reports for your players," but the actual enforcement call site was not read in this pass (out of this domain's file list) — INFERRED from the doc comment and the shared pattern with the confirmed player-side/roster-cap equivalents.
- **Status:** IMPLEMENTED (marketplace + roster cap confirmed wired; AI-report gate INFERRED, cross-domain)

### MKT-026 — Marketplace visibility gated behind Coach Pro for independent coaches (NEW)
- **Category:** Business Rule / Security-Authorization
- **Component:** `web/components/CoachesClient.tsx` (`marketplaceLocked`, confirmed at lines 410-415), cross-referenced with MKT-019.
- **Business rule:** An independent coach (no `academyId`) cannot turn on their own `marketplaceVisible` flag while on the Free coach tier — the checkbox is disabled and an "Upgrade" link to `/coach/subscription` is shown instead. Staff (`platform_admin`/`academy_admin`) editing any coach's record, and an academy-employed coach, are unaffected — the lock only fires for `user.role === "coach" && user.coachId === editingId && !editingCoach?.academyId`.
- **Security note:** Like MKT-009, this is a **client-side, render-only gate** — the checkbox is merely `disabled` in the React form; whether `upsertCoach()`/the underlying `coaches` table itself rejects a `marketplace_visible: true` write from a Free-tier independent coach bypassing the UI is UNKNOWN (RLS, hosted, out of this repo). See MKT-GAP-24.
- **Status:** IMPLEMENTED (client-side); server-side enforcement UNKNOWN

### MKT-027 — Referral creation (platform-admin only) (NEW)
- **Category:** Functional / API / Validation / Business Rule / Security-Authorization
- **Component:** `web/app/api/referrals/create/route.ts`
- **Authorization:** `getCaller()?.role !== "platform_admin"` → 403. No other role may create a referral.
- **Inputs:** `referrerName`, `referredName` required; `referredType` ∈ `{academy, coach, player, other}`; `commissionType` ∈ `{one_off, ongoing}`.
- **Business rules (verified):**
  - An `ongoing` commission **requires** a real linked entity (`referredAcademyId`/`referredCoachId`/`referredPlayerId`) — 400 if `referredType === "other"` with `commissionType === "ongoing"` ("there's no revenue to calculate from otherwise").
  - `one_off` requires `oneOffAmountAud > 0`; `ongoing` requires `ongoingRatePercent > 0` and a valid `ongoingRevenueSource` ∈ `{session_packs, bookings, both}`.
  - **A `one_off` referral immediately inserts a `referral_payouts` row** (`status: "pending"`, `period_label: null`) at creation time — "no monthly cron will ever create its payout the way an ongoing referral's does, so the ledger entry has to be created here" (code comment). An `ongoing` referral creates **no** payout row until the monthly cron runs (MKT-030).
  - New referral is always `status: "active"`; `created_by: caller.userId`.
- **Status:** IMPLEMENTED

### MKT-028 — Referral ending (NEW)
- **Category:** Functional / API / Security-Authorization
- **Component:** `web/app/api/referrals/end/route.ts`
- **Authorization:** `platform_admin` only.
- **Business rule:** Sets `referrals.status = "ended"`. Explicitly documented as **not retroactive** — "Ending a referral only stops future cron accrual — payouts already created stay exactly as they are, paid or not" (code comment). No way to resume an ended referral found in this route or `ReferralsClient.tsx` (one-directional).
- **Status:** IMPLEMENTED

### MKT-029 — Referral payout "mark paid" (NEW)
- **Category:** Functional / API / Security-Authorization
- **Component:** `web/app/api/referrals/mark-payout-paid/route.ts`
- **Authorization:** `platform_admin` only. Inputs `{ payoutId, paidDate }` both required.
- **Business rule:** Sets `referral_payouts.status = "paid", paid_date, paid_by: caller.userId`. Purely a manual reconciliation record — no Stripe/payment-rail integration; the actual money movement to the referrer happens off-platform (bank transfer, PayID, etc., per the `referrerPaymentDetails` free-text field captured at referral creation).
- **Status:** IMPLEMENTED

### MKT-030 — Monthly referral commission cron job (NEW)
- **Category:** Functional / API / Business Rule / Integration / Scheduled Job
- **Component:** `web/app/api/cron/referral-commissions/route.ts`; triggered by `.github/workflows/referral-commissions.yml` (`cron: '0 1 1 * *'` — once monthly, 01:00 UTC on the 1st — plus manual `workflow_dispatch`), via `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://crichq.com.au/api/cron/referral-commissions`.
- **Authorization:** `Authorization: Bearer <CRON_SECRET>` header, compared against `process.env.CRON_SECRET`; 401 on mismatch, 500 if `CRON_SECRET` isn't configured at all.
- **Business rules (verified):**
  - Computes the **previous calendar month's** window (`previousMonthRange`, UTC-based) relative to when the job runs.
  - Fetches every `referrals` row with `status: "active"` and `commission_type: "ongoing"`.
  - Skips (no payout row, `action: "skipped_ended"`) a referral whose `ongoing_end_date` is before the window start.
  - Skips (`"skipped_unlinked"`) a referral with no linked academy/coach/player.
  - Revenue is summed per the referral's `ongoing_revenue_source`:
    - `session_packs` (or `both`): `sum(total_sessions * fee_per_session)` for packs whose `purchase_date` falls in the window, filtered by the linked entity's column (`player_id`/`coach_id`/`academy_id`; for an academy, both its `player_ids` and `coach_ids` are checked).
    - `bookings` (or `both`): `sum(fee_aud)` for bookings whose `date` falls in the window, same per-entity-type column resolution (an academy sums bookings across **both** its players' and its coaches' bookings).
  - `amount = round(revenue * ongoing_rate_percent) / 100` (i.e. `revenue * rate% `, rounded to cents). Skipped (`"skipped_zero_revenue"`) if `amount <= 0`.
  - Writes one `referral_payouts` row per referral per period via `upsert(..., { onConflict: "referral_id,period_label", ignoreDuplicates: true })` — **re-running the job for an already-processed period is a safe no-op per referral** (the unique-constraint upsert prevents a duplicate payout row), but see MKT-GAP-19 for what that idempotency guarantee does *not* cover.
  - Returns a per-referral `results[]` array with `{ referralId, amount, action }` for observability — no email/Slack notification found; the workflow's own success/failure is only visible via GitHub Actions run history.
- **Status:** IMPLEMENTED

### MKT-031 — Referrals admin UI (NEW)
- **Category:** Functional / UI / Security-Authorization
- **Component:** `web/components/ReferralsClient.tsx` (463 lines), `web/app/(dashboard)/admin/referrals/page.tsx` (trivial wrapper)
- **Authorization:** Client-side redirect (`if (user && user.role !== "platform_admin") router.replace("/players")`) — same render-only pattern as other admin-only client components in this codebase; the actual data reads (`fetchReferrals`, `fetchReferralPayouts`) rely on RLS to enforce this server-side (UNKNOWN, out of this repo), and the mutating routes (MKT-027/028/029) do enforce `platform_admin` server-side independently.
- **Business rules (verified):** "New Referral" form lets an admin pick `referredType` and then a live-fetched picker of academies/coaches/players (or free-text name for `"other"`); "Ongoing" commission type is disabled in the UI when `referredType === "other"` (mirrors the server-side 400). Each referral row expands to show its payout history, a "Mark Paid" per-payout action (MKT-029), and, for an active ongoing referral, an "End this referral" action (MKT-028). **Referral commission amounts are always displayed/created in AUD** regardless of the referred entity's own currency — explicit code comment: "Referral commissions are a fixed platform payout structure..., independent of whatever currency the referred academy/player/coach happens to bill in — always AUD, not derived from the referred entity." See MKT-GAP-20 for why this is a real currency-correctness risk given the cron's revenue math.
- **Status:** IMPLEMENTED

### MKT-032 — Booking-created confirmation email/SMS (NEW)
- **Category:** Functional / API / Integration
- **Component:** `web/app/api/bookings/notify-created/route.ts`
- **Description:** Fired once, best-effort, immediately after a **new** (not edited) booking is saved from `BookingsClient.tsx:handleSave` (MKT-012). Never called from the marketplace request flow (MKT-011) — see MKT-GAP-23.
- **Authorization:** `getCaller()` + `callerCanAccessPlayer()` (role-scoped, same helper as MKT-014). 401/403/404 as appropriate.
- **Business rules:** Sends, independently and non-blocking on each other's failure:
  - An email to the **player** (if `player.email` and Gmail SMTP env vars are configured) confirming the booking, including the fee line only if `fee_aud > 0`.
  - An email to the **coach** (if `coach.email` present) notifying them of the new booking on their schedule.
  - An SMS to the player (if `player.phone` present) via `lib/sms.ts:sendSms`.
  - Returns `{ success: true, emailsSent, smsSent }` — a failed individual send is swallowed (`.catch(() => {})`) and never surfaces as a route-level error; the route always returns success once past auth/lookup.
- **Status:** IMPLEMENTED

### MKT-033 — Manual "mark booking paid" (cash/bank transfer) (NEW as a dedicated route)
- **Category:** Functional / API / Security-Authorization
- **Component:** `web/app/api/bookings/mark-paid/route.ts`
- **Authorization:** `getCaller()?.role` ∈ `{platform_admin, academy_admin, coach}` — explicitly staff-only; a player/parent must pay via `BookingPayOnlineButton` → Stripe Checkout (MKT-004) instead.
- **Business rule:** Sets `bookings.payment_status = "Paid", paid_date`. No Stripe involvement. `BookingsClient.tsx`'s `handleMarkPaid` calls this (via the pre-existing `lib/db.ts:markBookingPaid`, actually — see note) then immediately also calls `record-fee-due` (MKT-034) to log the platform's uncollected cut.
  - **Note on route vs. existing db helper:** `BookingsClient.tsx`'s actual `handleMarkPaid` calls `markBookingPaid()` from `lib/db.ts` (a direct client-side Supabase `.update()`, pre-existing) rather than this new `api/bookings/mark-paid` route — this new route exists as a **staff-authorized, server-side equivalent** but was not observed to be the one actually wired to the current Bookings UI in the files read. Its concrete caller (if any beyond direct API use) is `REQUIRES VALIDATION`.
- **Status:** IMPLEMENTED (route); UI wiring to this specific route vs. the pre-existing client-side helper REQUIRES VALIDATION

### MKT-034 — Booking platform-fee-due ledger & "Platform Fees" tab (NEW)
- **Category:** Functional / API / Business Rule / Security-Authorization
- **Components:** `web/app/api/bookings/record-fee-due/route.ts` (creates the ledger entry), `web/app/api/bookings/mark-fee-collected/route.ts` (closes it out), `BookingsClient.tsx` (`tab === "Platform Fees"`, `BookingMarkFeeCollectedButton`)
- **Description:** When a booking is paid outside Stripe, the platform's own commission is never automatically collected the way a real Checkout payment collects it (via `application_fee_amount`). This subsystem tracks what's owed as an explicit ledger row so it can be chased down/reconciled separately.
- **`record-fee-due` business rules (verified):** Any signed-in caller with `callerCanAccessPlayer()` access to the booking's player may trigger it (fired automatically by `BookingsClient.tsx:handleMarkPaid` right after `markBookingPaid`, MKT-018-parallel pattern). Resolves the academy via the booking's coach (`bookings` has no `academy_id` column of its own) — if the coach has no academy, silently `{ success: true, skipped: "no_academy" }` (no fee tracked for an unaffiliated coach's booking). `feePercent` = the academy's plan override or 10% default (same duplicated-lookup pattern as MKT-020/MKT-GAP-11). `amount = round(fee_aud * feePercent) / 100`; skipped if `<= 0`. **Upserts** with `onConflict: "booking_id", ignoreDuplicates: true` — id `bfd_{bookingId}` — so a double "Mark Paid" click/retry cannot create a duplicate ledger row for the same booking, but also means the fee % is **snapshotted at this moment and never recalculated** if the academy's plan later changes (explicit code comment).
- **`mark-fee-collected` business rules:** `platform_admin`-only. Sets `booking_fee_dues.status = "collected", collected_date, collected_by`.
- **UI:** A new "Platform Fees" tab (visible to `platform_admin`/`academy_admin`/`coach`) on the Bookings page shows pending vs. collected totals (via `sumMoneyByCurrency`, correctly currency-grouped per academy this time, unlike the referral cron — see MKT-GAP-20 contrast), and a per-due-row "Mark Collected" button visible only to `platform_admin`.
- **Status:** IMPLEMENTED

### MKT-035 — Session-pack platform-fee-due ledger (NEW)
- **Category:** Functional / API / Business Rule / Security-Authorization
- **Component:** `web/app/api/packs/record-fee-due/route.ts`
- **Description:** Direct pack-side mirror of MKT-034. `amount = round(total_sessions * fee_per_session * feePercent) / 100`. Upserts on `onConflict: "pack_id"` — id `pfd_{packId}`. Triggered from `SessionPacksClient.tsx:handleMarkPaid` right after `markPackPaid` (unawaited, per the MKT-018 minor note).
- **Status:** IMPLEMENTED

### MKT-036 — Session-pack platform-fee collection tracking & "Platform Fees" tab (NEW)
- **Category:** Functional / API / Security-Authorization
- **Component:** `web/app/api/packs/mark-fee-collected/route.ts`, `SessionPacksClient.tsx` (`pageTab === "Platform Fees"`)
- **Description:** Byte-for-byte the same shape as MKT-034's `mark-fee-collected` (`platform_admin`-only, sets `pack_fee_dues.status = "collected"`), surfaced in its own "Platform Fees" tab on the Session Packs page, alongside the pre-existing "Fees Due" tab (MKT-018, which tracks the pack's *own* payment status, a different concept from the *platform's* fee cut tracked here).
- **Status:** IMPLEMENTED

### MKT-037 — Multi-currency support across the marketplace (NEW, cross-cutting)
- **Category:** Business Rule / Data / Functional
- **Component:** `web/lib/currency.ts` (new file), consumed throughout `web/lib/types.ts` (`Coach.currency`, `Player.currency`, `Academy.currency`, `Plan.pricesByCurrency`), every checkout route (MKT-001 through MKT-006, MKT-022), the Connect destination-charge routes (MKT-003/004, which use the **academy's** currency), and every currency-aware UI surface (`BookingsClient`, `SessionPacksClient`, `FindCoachClient`, `CoachesClient`, `CoachSubscriptionPage`, `ReferralsClient`).
- **Business rules (verified):**
  - `SUPPORTED_CURRENCIES = [aud, usd, gbp, nzd, inr]`; `COUNTRY_OPTIONS` (the four Connect-eligible academy countries — AU/NZ/GB/US) each map 1:1 to a currency; **India/INR has no country option** — an academy cannot be created "in India" (Stripe Connect Express doesn't support it as a connected-account country) even though INR is a valid currency for an individual (non-Connect) player/coach purchase.
  - `resolvePlanPrice(priceAud, pricesByCurrency, preferred)`: if `preferred` is a supported non-default currency AND the plan has an override price for it, charge that; otherwise always fall back to the AUD price in AUD — **never** a currency-converted AUD amount. A plan simply not offered in a buyer's currency silently bills them in AUD instead, with no warning surfaced in any of the checkout routes read.
  - `sumMoneyByCurrency`: groups mixed-currency amounts into per-currency subtotals for display (e.g., `"A$120.00 + NZ$45.00"`) rather than summing raw numbers — used correctly by the new Platform Fees tabs (MKT-034/036) and pack/booking fee summaries.
  - An academy's `country` (and therefore `currency`) is described as locked once a Stripe Connect payout account exists for it (per `Academy.country`'s doc comment) — the enforcement site for that lock was not read in this pass (academy-settings UI, out of this domain's file list) — INFERRED.
- **Status:** IMPLEMENTED

### MKT-038 — Plan-Catalog-driven feature gating, 2-argument signature (NEW/CHANGED, cross-cutting)
- **Category:** Business Rule / Data — see the Domain Overview note above for the full description.
- **Component:** `web/lib/plan-features.ts` (entire file effectively rewritten, +108 lines)
- **The second argument, confirmed:** every gating function now takes `plans: Plan[]` — the caller's already-fetched, active Plan Catalog rows — as its second parameter, and looks up the tier's row by a fixed slug map (`PLAYER_TIER_SLUGS`/`COACH_TIER_SLUGS`) rather than any hardcoded rank. A caller passing only one argument (the historical 1-arg call shape) fails to typecheck — this is the direct cause of the `tests/unit/lib/plan-features.test.ts` "Expected 2 arguments, but got 1" failures referenced in this task's brief; not independently re-verified by running the suite, per this task's rules.
- **Full function inventory (all confirmed by direct source read):** `canGenerateAiReports(tier, plans)`, `canUseMarketplace(tier, plans)`, `sessionsLimitForPlan(tier, plans)`, `chatMessagesLimitForPlan(tier, plans)`, `isUnlimited(sessionsLimit)` (unchanged, 1-arg — not tier-based), `planFeatureLines(tier, plans)`, `canUseMarketplaceForCoach(tier, plans)`, `canGenerateAiReportsForCoach(tier, plans)`, `rosterCapForCoachPlan(tier, plans)`, `coachPlanFeatureLines(tier, plans)`.
- **Fallback semantics:** every lookup falls back to a hardcoded default (`tier !== "Free"` for booleans, `4`/`null` for the player session cap, `3`/`null` for chat messages, `5`/`null` for coach roster cap) **only if the expected Plan Catalog row is missing entirely** — i.e., the system degrades gracefully if `/admin/plans` seed data is incomplete, but an admin actively setting `marketplaceEnabled: false` on, say, `player-pro` takes full effect with no code-level override.
- **Status:** IMPLEMENTED

### MKT-039 — RBAC migration to `app_metadata` (NEW/CHANGED, cross-cutting)
- **Category:** Security-Authorization — see the Domain Overview note above.
- **Component:** Every route in this domain: `create-checkout-session`, `create-portal-session`, `create-pack-checkout-session`, `create-booking-checkout-session`, `create-assessment-checkout-session`, `create-library-checkout-session`, `connect/onboard`, `connect/login-link`, `create-coach-checkout-session`, `create-coach-portal-session`, and (via `lib/server-auth.ts:getCaller()`) `bookings/complete`, `bookings/mark-paid`, `bookings/notify-created`, `bookings/record-fee-due`, `bookings/mark-fee-collected`, `packs/record-fee-due`, `packs/mark-fee-collected`, `referrals/create`, `referrals/end`, `referrals/mark-payout-paid`.
- **Confirmed by direct source read of every one of the above files this pass:** each reads `user.app_metadata?.role` / `.academy_id` / `.coach_id` / `.player_id` (Stripe routes, inline via `createServerClient(...).auth.getUser()`) or the equivalent via `getCaller()` (booking/pack/referral routes). None read `user_metadata` anywhere in this domain's route code.
- **Status:** IMPLEMENTED

### MKT-040 — Legacy "Coach Pro for a player" checkout path still technically permitted (NEW finding — CONFLICTING)
- **Category:** Business Rule / Security-Authorization — **CONFLICTING**
- **Observed behavior:** `web/lib/stripe-client.ts:isPaidPlan` still validates against `["Player Pro", "Coach Pro"]` (unchanged), and `create-checkout-session/route.ts` still accepts `plan === "Coach Pro"` for a **playerId**, mapping it to the same `coach-pro` Plan Catalog slug the new coach-only route (MKT-022) uses, and would still create/update a **player's** `subscription.plan = "Coach Pro"` via the webhook if hit. However, the player-facing `SubscriptionPage.tsx` no longer offers "Coach Pro" as a card at all — confirmed by direct source read: `buildPlanCards` explicitly iterates only `["Free", "Player Pro"] as const`, with the comment "Coach Pro used to be offered here too, but it's now a coach's own plan... a player only ever chooses between Free and Player Pro."
- **Why it's ambiguous:** Either this is simply dead/unreachable server-side surface area now that no UI ever sends `plan: "Coach Pro"` with a `playerId` (harmless, low-risk), or it's a genuine latent authorization/business-logic gap — a technically-savvy player could still call `create-checkout-session` directly with `plan: "Coach Pro"` and end up with a `Player.subscription.plan` value the rest of the player-facing app (`plan-features.ts`'s `PLAYER_TIER_SLUGS`, which does include a `"Coach Pro": "coach-pro"` mapping) was arguably never meant to see on a player row now that Coach Pro is coach-only conceptually.
- **Status:** REQUIRES VALIDATION — see MKT-GAP-14.

### MKT-041 — Independent coach creation via self-serve signup approval (NEW, supporting finding)
- **Category:** Functional / Business Rule
- **Component:** `web/app/api/approve-user/route.ts` (confirmed via targeted grep: inserts a `coaches` row with `academy_id: null, marketplace_visible: false` when approving a self-serve coach signup with no academy link)
- **Description:** This is the creation path that produces the "independent coach" (no `academyId`) that MKT-022 through MKT-026 (Coach Pro subscription, marketplace-visibility gating, roster cap) are all specifically written around — as distinct from a coach created by academy staff via `CoachesClient.tsx`, which always requires an `academyId` (MKT-019's "Academy *" required field). Not fully read in this pass (out of this domain's file list); cited here only to establish where the "independent coach" concept this domain's new subsystems assume actually originates.
- **Status:** INFERRED (creation path confirmed to exist; full route logic not read this pass)

---

## 3. Business Rules

| # | Rule | Source | Status |
|---|---|---|---|
| BR-1 | Marketplace access (Find a Coach) requires the player's tier's Plan Catalog row to have `marketplaceEnabled` (defaults true for any non-Free tier if the row is missing). | `lib/plan-features.ts:canUseMarketplace` | CHANGED — was a fixed rank comparison |
| BR-2 | An academy-assigned player only sees marketplace-visible coaches from their **own** academy; only an academy-less player sees the platform-wide list — contradicts the paywall's own "beyond your own academy assignment" copy. | `FindCoachClient.tsx` | UNCHANGED |
| BR-3 | Session fee = academy's per-type/age fee table, or 0 if the academy's plan waives fees. | `lib/utils.ts:getSessionFee` | UNCHANGED |
| BR-4 | Platform fee on booking/pack revenue = academy's plan override or 10% default, taken via Stripe Connect `application_fee_amount` (Stripe-paid) or logged to a `*_fee_dues` ledger for manual reconciliation (cash/bank-transfer-paid). | Checkout routes + `record-fee-due` routes | CHANGED — now also tracked for non-Stripe payments |
| BR-5 | Payout destination: `head_coach` model → academy's head coach always; `split_by_coach` → booking pays the specific booked coach (hard-fails if not onboarded), pack pays its assigned coach or falls back silently to head coach. Connect transfer currency = the **academy's own** currency. | Both checkout routes | CHANGED — currency now academy-derived, not hardcoded AUD |
| BR-6 | A pack-drawn booking (`pack_id` set) is automatically `paymentStatus: "Paid"`; a non-pack booking must be paid individually (Stripe or manual cash/bank-transfer, the latter now producing a fee-due ledger row). | `BookingsClient.tsx`, `create-booking-checkout-session`, `record-fee-due` | CHANGED — cash path now tracked |
| BR-7 | Completing a pack-funded booking increments `sessions_used` but not `sub_sessions_used`; a non-pack booking consumes the subscription quota. | `api/bookings/complete/route.ts` | UNCHANGED |
| BR-8 | A pack's no-show/cancellation credit expires once its agreed weekly pace window elapses. | `lib/utils.ts:isPackCreditExpired` | UNCHANGED |
| BR-9 | Marketplace booking requests are always `status: "Pending"`, tagged `source: "marketplace"`, and — unlike a staff-created booking — never trigger the new booking-confirmation email/SMS. | `FindCoachClient.tsx:RequestBookingModal` | CHANGED — notify-created gap is new |
| BR-10 | A coach who is a sole/head coach of an academy, or has assigned players, cannot be deleted without reassignment first. | `CoachesClient.tsx:handleDelete` | UNCHANGED |
| BR-11 | Session packs are UI-restricted to `"Net Session"` type only. | `SessionPacksClient.tsx` | UNCHANGED |
| BR-12 | An independent coach cannot enable their own `marketplaceVisible` while on the Free coach tier; requires Coach Pro. | `CoachesClient.tsx` (`marketplaceLocked`) | **NEW** |
| BR-13 | An independent coach's own player-roster size is capped by `rosterCapForCoachPlan` (5 on Free, unlimited on Coach Pro). | `PlayersClient.tsx` + `plan-features.ts` | **NEW** |
| BR-14 | A `one_off` referral commission creates its payout ledger row immediately at referral-creation time; an `ongoing` referral's payout rows are only ever created by the monthly cron, one row per referral per calendar month, and only for months where computed revenue > 0. | `referrals/create/route.ts`, `cron/referral-commissions/route.ts` | **NEW** |
| BR-15 | Ending a referral stops future ongoing-commission accrual but never retroactively affects already-created payout rows. | `referrals/end/route.ts` | **NEW** |
| BR-16 | Referral ongoing-commission revenue is summed from raw `bookings.fee_aud` / `session_packs.total_sessions*fee_per_session` for the previous calendar month, with **no filter on whether that revenue was actually collected/paid**, and the resulting commission amount is always recorded and displayed in AUD regardless of the underlying currency those source rows are actually denominated in. | `cron/referral-commissions/route.ts`, `ReferralsClient.tsx` | **NEW** — see MKT-GAP-19/20 |
| BR-17 | A booking/pack paid in cash/bank-transfer generates a platform-fee-due ledger row (snapshotted fee % at that moment, never recalculated), closeable only by a platform admin. | `*/record-fee-due`, `*/mark-fee-collected` routes | **NEW** |

---

## 4. Key Workflows (Decision Logic)

### (a) Coach Pro subscription purchase end-to-end (NEW)

```
Independent coach clicks "Upgrade" (CoachesClient "Your plan" panel or the marketplaceLocked
prompt) or from CoachSubscriptionPage directly
  → POST /api/stripe/create-coach-checkout-session { coachId }
      ├─ not signed in → 401
      ├─ caller isn't platform_admin and isn't this coach → 403
      ├─ coach not found → 404
      ├─ coach-pro plan row missing → 500
      ├─ no stripe_customer_id → create one, persist on `coaches` row
      ├─ stripe.checkout.sessions.create(mode: subscription, price_data resolved via
      │    resolvePlanPrice(..., coach.currency), metadata: {coach_id, type: "coach_subscription"})
      ├─ Stripe API throws → 502
      └─ success → 200 {url}
  → redirect to Stripe Checkout
      → webhook checkout.session.completed, metadata.type === "coach_subscription"
        [HANDOFF — webhook route.ts] → sets coaches.{stripe_customer_id, stripe_subscription_id,
        subscription_status, sub_plan} — THIS is the point marketplaceVisible/roster-cap gates
        actually unlock
      → redirected to /coach/subscription?checkout=success
```

### (b) Referral lifecycle end-to-end (NEW)

```
platform_admin records a referral (ReferralsClient "New Referral")
  → POST /api/referrals/create
      ├─ not platform_admin → 403
      ├─ validation (referrer/referred names, referredType, commissionType, amounts/rates) → 400
      ├─ commissionType === "one_off" → insert referrals row (status: active) AND
      │    immediately insert one referral_payouts row (status: pending, period_label: null)
      └─ commissionType === "ongoing" → insert referrals row only; no payout row yet

Monthly, 01:00 UTC on the 1st (GitHub Actions cron) or manual workflow_dispatch:
  POST /api/cron/referral-commissions  (Authorization: Bearer CRON_SECRET)
      ├─ bad/missing secret → 401 / 500
      └─ for every active, ongoing referral:
          ├─ ongoing_end_date < previous-month start → skip (skipped_ended)
          ├─ no linked academy/coach/player → skip (skipped_unlinked)
          ├─ sum previous month's session-pack + booking revenue for the linked entity,
          │    per ongoing_revenue_source
          ├─ amount = round(revenue * rate%) / 100; <= 0 → skip (skipped_zero_revenue)
          └─ upsert referral_payouts (id: rpo_{referralId}_{YYYY-MM}, onConflict dedupe) →
               payout_created (or a no-op if this referral+month already has a row)

platform_admin reviews payouts in ReferralsClient, sends the actual money off-platform, then:
  → POST /api/referrals/mark-payout-paid {payoutId, paidDate}
      ├─ not platform_admin → 403
      └─ referral_payouts.status = "paid", paid_date, paid_by

platform_admin may also:
  → POST /api/referrals/end {referralId} → referrals.status = "ended" (stops future cron accrual
      only; existing payout rows are untouched)
```

### (c) Cash/bank-transfer booking or pack payment → platform-fee reconciliation (NEW)

```
Staff clicks "Mark Paid (Cash)" on a booking or pack
  → (booking) markBookingPaid() [lib/db.ts, pre-existing] → bookings.payment_status = "Paid"
     (pack)    markPackPaid()    [lib/db.ts, pre-existing] → session_packs.payment_status = "Paid"
  → best-effort, fired immediately after:
     POST /api/bookings/record-fee-due {bookingId}   OR   /api/packs/record-fee-due {packId}
       ├─ not signed in → 401 / no caller-access → 403
       ├─ (booking only) coach has no academy → skip (skipped_no_academy), no fee tracked
       ├─ feePercent = academy's plan override or 10%
       ├─ amount = round(fee_aud * feePercent) / 100  [booking]
       │  amount = round(total_sessions * fee_per_session * feePercent) / 100  [pack]
       └─ upsert booking_fee_dues / pack_fee_dues (one row per booking/pack, dedup on conflict)

platform_admin reviews the "Platform Fees" tab (Bookings page or Session Packs page)
  → POST /api/bookings/mark-fee-collected {dueId, collectedDate}
     POST /api/packs/mark-fee-collected {dueId, collectedDate}
      ├─ not platform_admin → 403
      └─ *_fee_dues.status = "collected", collected_date, collected_by
```

### (d) Subscription purchase end-to-end (Player Pro) — unchanged shape from prior analysis, currency-aware

```
Player clicks "Upgrade" → POST /api/stripe/create-checkout-session { playerId, plan }
  ├─ Input invalid → 400
  ├─ Not signed in → 401
  ├─ Caller is player/parent AND app_metadata.player_id !== playerId → 403   [CHANGED: app_metadata]
  ├─ player row missing → 404
  ├─ plans row for the slug missing → 500
  ├─ else: resolve price via resolvePlanPrice(priceAud, pricesByCurrency, player.currency)
  │    [CHANGED: currency-aware, was flat AUD]
  │    → stripe.checkout.sessions.create(...) → Stripe API throws → 502 / success → 200 {url}
  └─ Client redirects to Stripe Checkout → webhook checkout.session.completed [HANDOFF, other
       agent's domain] → players.{sub_plan, ...} updated → redirected to success/cancel URL
```

### (e) Booking creation → notification → payment → completion (staff path, updated)

```
Staff creates booking (BookingsClient) → upsertBooking() → local state updated
  → (new booking only, best-effort) POST /api/bookings/notify-created {bookingId}
       → email to player + coach (if configured), SMS to player (if phone present) — all
         individually best-effort, route always returns 200 once past auth/lookup   [NEW]

Marketplace path (FindCoachClient) → upsertBooking({status:"Pending", source:"marketplace"})
  → NO notify-created call — coach is not automatically emailed/texted about the new request
    [NEW GAP — MKT-GAP-23]

Payment (Stripe): unchanged from prior analysis (create-booking-checkout-session, now
  academy-currency-aware) → webhook → bookings.payment_status = "Paid"  [HANDOFF]

Payment (cash/bank transfer): NEW — see workflow (c) above, now also produces a platform-fee-due
  ledger row instead of silently letting the platform's cut go untracked

Completion: unchanged from prior analysis (api/bookings/complete)
```

---

## 5. Requirement-to-Code Traceability

| Requirement | Primary file(s) | Test file(s) |
|---|---|---|
| MKT-001 | `web/app/api/stripe/create-checkout-session/route.ts` | `web/tests/api/stripe/create-checkout-session.test.ts` (weak — `rawUser()` mismatch) |
| MKT-002 | `web/app/api/stripe/create-portal-session/route.ts` | `web/tests/api/stripe/create-portal-session.test.ts` (weak) |
| MKT-003 | `web/app/api/stripe/create-pack-checkout-session/route.ts` | `web/tests/api/stripe/create-pack-checkout-session.test.ts` (weak) |
| MKT-004 | `web/app/api/stripe/create-booking-checkout-session/route.ts` | `web/tests/api/stripe/create-booking-checkout-session.test.ts` (weak) |
| MKT-005 | `web/app/api/stripe/create-assessment-checkout-session/route.ts` | `web/tests/api/stripe/create-assessment-checkout-session.test.ts` (weak) |
| MKT-006 | `web/app/api/stripe/create-library-checkout-session/route.ts` | `web/tests/api/stripe/create-library-checkout-session.test.ts` (weak) |
| MKT-007 | `web/app/api/stripe/connect/onboard/route.ts` | `web/tests/api/stripe/connect/onboard.test.ts` (weak) |
| MKT-008 | `web/app/api/stripe/connect/login-link/route.ts` | `web/tests/api/stripe/connect/login-link.test.ts` (weak) |
| MKT-009 | `web/lib/plan-features.ts`, `web/components/FindCoachClient.tsx` | `web/tests/components/FindCoachClient.test.tsx` (weak); `web/tests/unit/lib/plan-features.test.ts` (confirmed stale — 1-arg calls) |
| MKT-010 | `web/components/FindCoachClient.tsx` | `web/tests/components/FindCoachClient.test.tsx` (weak) |
| MKT-011 | `web/components/FindCoachClient.tsx:RequestBookingModal` | none found |
| MKT-012 | `web/components/BookingsClient.tsx` | `web/tests/components/BookingsClient.test.tsx` (weak) |
| MKT-013 | `web/components/BookingsClient.tsx`, `web/lib/db.ts:updateBookingStatus` | none dedicated |
| MKT-014 | `web/app/api/bookings/complete/route.ts` | `web/tests/api/bookings/complete.test.ts` (weak) |
| MKT-015 | `web/components/BookingsClient.tsx` (~line 942) | none — defect undetected by any test |
| MKT-016 | `web/components/SessionPacksClient.tsx` | `web/tests/components/SessionPacksClient.test.tsx` (weak) |
| MKT-017 | `web/lib/utils.ts` | none found |
| MKT-018 | `web/components/SessionPacksClient.tsx` | `web/tests/components/SessionPacksClient.test.tsx` (weak) |
| MKT-019 | `web/components/CoachesClient.tsx` | `web/tests/components/CoachesClient.test.tsx` (weak) |
| MKT-020 | `web/lib/utils.ts` | none found |
| MKT-021 | `web/lib/payment-store.ts`, `web/lib/credits-store.ts` | none (dead code) |
| MKT-022 | `web/app/api/stripe/create-coach-checkout-session/route.ts` | **none found** |
| MKT-023 | `web/app/api/stripe/create-coach-portal-session/route.ts` | **none found** |
| MKT-024 | `web/components/CoachSubscriptionClient.tsx`, `CoachSubscriptionPage.tsx` | **none found** |
| MKT-025 | `web/lib/plan-features.ts`, `web/components/PlayersClient.tsx` | `tests/unit/lib/plan-features.test.ts` (confirmed stale) |
| MKT-026 | `web/components/CoachesClient.tsx` | **none found** |
| MKT-027 | `web/app/api/referrals/create/route.ts` | **none found** |
| MKT-028 | `web/app/api/referrals/end/route.ts` | **none found** |
| MKT-029 | `web/app/api/referrals/mark-payout-paid/route.ts` | **none found** |
| MKT-030 | `web/app/api/cron/referral-commissions/route.ts`, `.github/workflows/referral-commissions.yml` | **none found** |
| MKT-031 | `web/components/ReferralsClient.tsx` | **none found** |
| MKT-032 | `web/app/api/bookings/notify-created/route.ts` | **none found** |
| MKT-033 | `web/app/api/bookings/mark-paid/route.ts` | **none found** |
| MKT-034 | `web/app/api/bookings/record-fee-due/route.ts`, `mark-fee-collected/route.ts`, `BookingsClient.tsx` | **none found** |
| MKT-035 | `web/app/api/packs/record-fee-due/route.ts` | **none found** |
| MKT-036 | `web/app/api/packs/mark-fee-collected/route.ts`, `SessionPacksClient.tsx` | **none found** |
| MKT-037 | `web/lib/currency.ts` | **none found** in this domain's dirs (may exist under `tests/unit/lib/currency.test.ts` — not confirmed) |
| MKT-038 | `web/lib/plan-features.ts` | `tests/unit/lib/plan-features.test.ts` (confirmed stale, 1-arg) |
| MKT-039 | every route listed in MKT-039's description | all associated route tests are weak evidence per the `rawUser()` finding |
| MKT-040 | `web/app/api/stripe/create-checkout-session/route.ts`, `web/lib/stripe-client.ts`, `web/components/SubscriptionPage.tsx` | none found |
| MKT-041 | `web/app/api/approve-user/route.ts` | not read this pass |

---

## 6. Test Cases

| Test Case ID | Requirement ID | Test Scenario | Preconditions | Test Data/Input | Steps | Expected Result | Test Type | Priority | Automation Candidate | Relevant Code/Component |
|---|---|---|---|---|---|---|---|---|---|---|
| MKT-TC-001 | MKT-022 | Coach Pro checkout succeeds and creates a Stripe customer on the coach row | Independent coach, no `stripe_customer_id` | `{coachId}`, signed in as that coach | POST create-coach-checkout-session | 200, `url` returned, `coaches.stripe_customer_id` persisted | Functional | P0 | RECOMMENDED — no test file exists | `create-coach-checkout-session/route.ts` |
| MKT-TC-002 | MKT-022 | A coach cannot buy another coach's subscription | signed in as coach A | `{coachId: coachB.id}` | POST | 403 | Security | P0 | RECOMMENDED | same |
| MKT-TC-003 | MKT-026 | Independent Free-tier coach cannot enable marketplace visibility on their own profile | coach editing own profile, `subPlan: "Free"`, no academyId | toggle checkbox | render CoachesClient edit form | Checkbox disabled, "Requires Coach Pro" note shown | Functional / Business Rule | P1 | RECOMMENDED | `CoachesClient.tsx` (`marketplaceLocked`) |
| MKT-TC-004 | MKT-026 | Server accepts/rejects a direct `marketplace_visible: true` write from a Free-tier independent coach bypassing the UI | Free-tier independent coach, valid session | direct `upsertCoach` call | attempt update | Expected: rejected server-side; **Actual: UNKNOWN — no server-side check found** | Security | P0 | RECOMMENDED — see MKT-GAP-24 | server-side (route/RLS) — location unverified |
| MKT-TC-005 | MKT-027 | Non-platform_admin cannot create a referral | signed in as academy_admin | valid referral body | POST referrals/create | 403 | Security | P0 | RECOMMENDED | `referrals/create/route.ts` |
| MKT-TC-006 | MKT-027 | One-off referral immediately creates a pending payout row | valid one-off body, `oneOffAmountAud: 100` | POST | 200; `referral_payouts` has one row, `status: "pending"`, `amount_aud: 100` | Functional | P0 | RECOMMENDED | same |
| MKT-TC-007 | MKT-027 | Ongoing referral with `referredType: "other"` is rejected | commissionType: ongoing, referredType: other | POST | 400 | Validation | P1 | RECOMMENDED | same |
| MKT-TC-008 | MKT-030 | Cron rejects a request without the correct bearer token | missing/wrong `Authorization` header | POST cron/referral-commissions | 401 | Security | P0 | RECOMMENDED | `cron/referral-commissions/route.ts` |
| MKT-TC-009 | MKT-030 | Cron computes and upserts a commission for an active ongoing referral with real prior-month revenue | referral linked to a coach with $1000 of prior-month bookings, rate 5% | POST (with valid secret) | `referral_payouts` row created, `amount_aud: 50`, `action: "payout_created"` | Functional / Business Rule | P0 | RECOMMENDED | same |
| MKT-TC-010 | MKT-030 | Re-running the cron for an already-processed month does not duplicate or overwrite the payout amount | payout row already exists for referral+period | POST again | Existing row untouched (upsert `ignoreDuplicates: true`) — even if underlying revenue changed since | Business Rule / Regression | P1 | RECOMMENDED — also see MKT-GAP-19 | same |
| MKT-TC-011 | MKT-030 | Ended referral (`ongoing_end_date` before window start) is skipped | referral status active, `ongoing_end_date` in the past relative to the computed window | POST | `action: "skipped_ended"`, no payout row created | Business Rule | P1 | RECOMMENDED | same |
| MKT-TC-012 | MKT-034 | Marking a booking paid in cash creates a booking_fee_dues row with the correct academy-plan-derived fee % | booking fee $200, academy plan `platformFeePercent: 5` | mark paid → record-fee-due | `amount_aud: 10` | Business Rule | P1 | RECOMMENDED | `bookings/record-fee-due/route.ts` |
| MKT-TC-013 | MKT-034 | Only platform_admin can mark a fee-due row collected | signed in as academy_admin | POST bookings/mark-fee-collected | 403 | Security | P0 | RECOMMENDED | `bookings/mark-fee-collected/route.ts` |
| MKT-TC-014 | MKT-032 | New staff-created booking triggers notify-created and doesn't block the save on a mail failure | Gmail env vars misconfigured/absent | create booking | Booking still saves; notify-created best-effort call fails silently | Functional / Error-Handling | P2 | RECOMMENDED | `BookingsClient.tsx`, `bookings/notify-created/route.ts` |
| MKT-TC-015 | MKT-011 / MKT-GAP-23 | Marketplace booking request does NOT trigger a coach notification | Player-Pro player submits RequestBookingModal | submit | No call to `/api/bookings/notify-created` observed | Functional — Gap Regression | P2 | RECOMMENDED | `FindCoachClient.tsx` |
| MKT-TC-016 | MKT-009 / MKT-038 | Admin disabling `marketplaceEnabled` on the `player-pro` Plan Catalog row blocks Player Pro players from the marketplace | `plans` row `player-pro`, `marketplace_enabled: false` | render FindCoachClient for a Player Pro player | Paywall shown despite `plan === "Player Pro"` | Business Rule / Regression | P1 | RECOMMENDED — new admin-configurable-gate behavior, no existing test covers it | `plan-features.ts:canUseMarketplace`, `FindCoachClient.tsx` |
| MKT-TC-017 | MKT-003/004 | Connect destination charge for a GBP academy is created in GBP, not AUD | academy `country: "GB"`, `currency: "gbp"` | POST create-booking-checkout-session | Stripe session `currency: "gbp"` | Functional / Business Rule | P1 | RECOMMENDED | both checkout routes |
| MKT-TC-018 | MKT-020/MKT-016 (regression, unchanged) | Waived-fee academy pack is immediately Paid | academy plan `waivesSessionFees:true` | create pack | `paymentStatus:"Paid"` at creation | Business Rule | P2 | RECOMMENDED (carried from prior analysis, still no test found) | `SessionPacksClient.tsx` |
| MKT-TC-019 | MKT-015 (unchanged defect) | "Credit to Pack" on the Bookings page still fails to increment `sessionCredits` | Cancelled booking, active pack | click "Credit to Pack" | **Expected:** `sessionCredits +1`. **Actual (confirmed-unfixed defect):** unchanged, no-op | Functional — Regression | P0 | RECOMMENDED (urgent — still broken this merge) | `BookingsClient.tsx` (~line 942) |
| MKT-TC-020 | MKT-007 | Connect Express account creation, with the new `country` param, against the live Stripe test account | fresh coach at an AU academy, no existing Connect account | POST connect/onboard | REQUIRES VALIDATION — outcome not independently confirmed this pass | Integration / Regression | P0 | RECOMMENDED — re-run and update the prior analysis's pinned-502 expectation | `connect/onboard/route.ts` |

*(Test cases MKT-TC-001 through MKT-TC-040 from the prior analysis covering MKT-001–MKT-021's core happy/validation paths still apply as scenarios; they are not repeated verbatim here for space — see the prior analysis's Section 6 for their full text. Their `AUTOMATED` labels should be treated as unverified this pass given the `rawUser()`/`app_metadata` mismatch; re-classify only after confirming the mocks were updated.)*

---

## 7. Test Case Tags

**TEST_TYPE:** `Functional`, `Validation`, `Business Rule`, `Security`, `Error-Handling`, `Integration`, `Regression`, `Data Consistency`, `Scheduled Job`

**PRIORITY:** `P0` money-movement correctness / auth bypass / confirmed-broken paths (MKT-TC-004, -005, -008, -013, -019, -020). `P1` core commerce/business-rule correctness. `P2` secondary validation, UX-adjacent rules.

**AUTOMATION:** `AUTOMATED` only for a currently-existing test proven to cover the exact scenario (none found for any new-subsystem requirement this pass). `RECOMMENDED` for everything else.

**REQUIREMENT_TYPE:** `Functional`, `API`, `Business Rule`, `Data`, `Security-Authorization`, `Error-Handling`, `Integration`, `Scheduled Job`

**RISK:** `HIGH` (money-movement, auth-bypass, currency-correctness — MKT-015, MKT-GAP-07, MKT-GAP-19, MKT-GAP-20, MKT-GAP-24). `MEDIUM` (business-rule inconsistency, silent fallback, snapshot-drift — MKT-GAP-08, MKT-GAP-11, MKT-GAP-14). `LOW` (dead code, minor UX inconsistency — MKT-GAP-12, the unawaited `markPackPaid` note).

**COVERAGE:** `COVERED`, `PARTIAL`, `UNCOVERED`, `PINS-A-BUG` — no requirement in this domain's NEW subsystems (MKT-022 through MKT-041) currently has any `COVERED` status; all are `UNCOVERED`.

---

## 8. Existing Test Coverage vs Recommended

### EXISTING_TEST (present, but evidentiary weight downgraded this pass)
All of the prior analysis's cited test files still exist and still cover the same *scenarios* (400/401/403/404 shapes, at least one real-Stripe-test-API happy path per Stripe route): `tests/api/bookings/complete.test.ts`, `tests/api/stripe/create-{checkout,pack-checkout,booking-checkout,assessment-checkout,library-checkout,portal}-session.test.ts`, `tests/api/stripe/connect/{onboard,login-link}.test.ts`, `tests/components/{BookingsClient,SessionPacksClient,CoachesClient,FindCoachClient}.test.tsx`. **Their reliability as current-behavior evidence is downgraded** by the confirmed `tests/mocks/caller.ts:rawUser()` / `app_metadata` mismatch (see the top of this document) — every one of these tests that exercises an authorization branch is plausibly asserting the wrong status code right now, independent of whether the production route logic itself is correct.

### Missing — entirely new, zero test files found
- Every referral route and the referral UI: `referrals/create`, `referrals/end`, `referrals/mark-payout-paid`, `cron/referral-commissions`, `ReferralsClient.tsx`.
- Both coach-subscription routes and both coach-subscription components: `create-coach-checkout-session`, `create-coach-portal-session`, `CoachSubscriptionClient.tsx`, `CoachSubscriptionPage.tsx`.
- All six new booking/pack fee-tracking routes: `bookings/{mark-fee-collected,mark-paid,notify-created,record-fee-due}`, `packs/{mark-fee-collected,record-fee-due}`.
- No `tests/api/referrals/`, `tests/api/packs/`, `tests/components/CoachSubscription*`, or `tests/components/Referrals*` directories exist at all (confirmed by directory listing).
- No unit test found for `lib/currency.ts`'s `resolvePlanPrice`/`sumMoneyByCurrency`/`currencyForCountry` in the files checked (may exist elsewhere under `tests/unit/lib/` — not confirmed either way).

### Weak / carried forward from prior analysis, still true
- MKT-015's "Credit to Pack" no-op defect remains completely untested.
- No test proves a Player-Pro player actually **sees** the marketplace (only the Free-plan block is covered).
- No test for the cross-academy coach-visibility discrepancy (MKT-GAP-08).
- Real end-to-end Stripe Checkout flows (declined cards, 3DS, webhook races) remain untested anywhere in this domain's files.

### RECOMMENDED_TEST list (in addition to the prior analysis's still-valid list)
1. Regenerate/repair `tests/mocks/caller.ts:rawUser()` to build `{ id, app_metadata: metadata }` (or add a second helper) so the *entire* domain's existing test suite is re-aligned with current route code — this single fix likely resolves the majority of this merge's test failures across this domain without any production code change.
2. Full coverage for the referral subsystem: creation validation matrix, the monthly cron's revenue math per `ongoing_revenue_source`, the idempotent-upsert-on-rerun behavior, and mark-paid/end authorization.
3. Full coverage for the coach-subscription checkout/portal routes, mirroring the existing player-subscription test pattern.
4. A regression test locking in MKT-GAP-19/20's currency/collected-vs-booked revenue findings (or their resolution, if intentional).
5. Coverage for all six fee-tracking routes' upsert-dedup behavior (`onConflict` + `ignoreDuplicates`) and `platform_admin`-only `mark-*-collected` authorization.
6. A test confirming (or refuting) MKT-GAP-23 — that a marketplace-originated booking never fires `notify-created`.
7. Re-run (or newly write) a live-Stripe-test-API check of `connect/onboard` with the new `country` parameter to resolve MKT-007/MKT-GAP-17's now-unconfirmed status.

---

## 9. Gaps and Ambiguities

### 9a. NEW / CHANGED / REMOVED summary for this merge (as required)

**NEW subsystems and files (this domain):**
- Coach-side subscriptions: `create-coach-checkout-session/route.ts`, `create-coach-portal-session/route.ts`, `CoachSubscriptionClient.tsx`, `CoachSubscriptionPage.tsx`, `coach/subscription/page.tsx`, plus the coach-side gating functions in `plan-features.ts` (`canUseMarketplaceForCoach`, `canGenerateAiReportsForCoach`, `rosterCapForCoachPlan`, `coachPlanFeatureLines`) and the `Coach.currency`/`Coach.subPlan`/`Coach.stripeCustomerId` etc. type fields.
- Referral/commission program: `referrals/create`, `referrals/end`, `referrals/mark-payout-paid`, `cron/referral-commissions` + its GitHub Actions workflow, `ReferralsClient.tsx`, `admin/referrals/page.tsx`, the `Referral`/`ReferralPayout` types and `dbToReferral`/`dbToReferralPayout`/`fetchReferrals`/`fetchReferralPayouts` in `lib/db.ts`.
- Booking/pack fee-tracking: `bookings/mark-fee-collected`, `bookings/mark-paid`, `bookings/notify-created`, `bookings/record-fee-due`, `packs/mark-fee-collected`, `packs/record-fee-due`, the `PackFeeDue`/`BookingFeeDue` types, and the "Platform Fees" tabs on both `BookingsClient.tsx` and `SessionPacksClient.tsx`.
- Multi-currency support: `web/lib/currency.ts` (new file) and its consumption everywhere in this domain.
- Marketplace-visibility-gated-by-Coach-Pro business rule for independent coaches (`CoachesClient.tsx`).

**CHANGED (existing requirements, behavior materially different):**
- `plan-features.ts`'s entire gating API — 1-arg → 2-arg (`plans: Plan[]`), and semantically fixed-rank → admin-Plan-Catalog-driven (MKT-009, MKT-038).
- Every Stripe checkout route's authorization — `user_metadata` → `app_metadata` (MKT-001–008, MKT-039).
- `create-pack-checkout-session`/`create-booking-checkout-session` — Connect transfer currency now academy-derived, not hardcoded AUD (MKT-003/004).
- `connect/onboard` — now passes an explicit `country` to `stripe.accounts.create()` (MKT-007).
- `BookingsClient.tsx`/`SessionPacksClient.tsx` — substantially rewritten (336/443 lines different per the task brief) primarily to add the new "Platform Fees" tab, currency-aware money formatting throughout, and the `notify-created`/`record-fee-due` best-effort side-call wiring on save/mark-paid — the pre-existing core booking/pack CRUD and fee-computation logic itself is unchanged.
- `SubscriptionPage.tsx` (player-facing) — no longer offers "Coach Pro" as a purchasable card (MKT-040).
- `CoachesClient.tsx` — `marketplaceVisible` now conditionally locked behind Coach Pro for independent coaches; new "Your plan" panel (MKT-019/026).

**REMOVED:** No requirement from the prior analysis was found to be literally removed — every prior MKT-001 through MKT-021 requirement still maps to existing, functioning code. The closest thing to a removal is MKT-040's UI-level retirement of "Coach Pro" as a player-purchasable plan (the backend route still technically accepts it — see MKT-GAP-14) and the general obsolescence of the prior analysis's MKT-GAP-01 (product-doc-vs-code pricing-tier mismatch) now that `PlanTier` remains 3 fixed tiers but pricing/features are fully Plan-Catalog-driven rather than hardcoded — not re-verified against the product doc this pass, so not re-asserted as fixed or still-broken.

### 9b. Gap table

| Gap ID | Area | Observed Behavior | Why It's Ambiguous/Risky | Suggested Requirement/Question |
|---|---|---|---|---|
| MKT-GAP-02 | Missing explicit staff-role check | Unchanged from prior analysis — `create-checkout-session`/`create-assessment-checkout-session`/`create-library-checkout-session`/`create-portal-session` still only gate the `player`/`parent` branch; any other role passes through unchecked. | Same as before — a `coach` role can trigger a subscription/portal action for an arbitrary `playerId`. | Align these four routes to the explicit `isStaff` allow-list pattern used by `create-booking-checkout-session`/`create-pack-checkout-session`/`connect/onboard`/the two coach routes. |
| MKT-GAP-03 | Unhandled exception in `connect/login-link` | Confirmed by direct source read this pass — still no try/catch around `stripe.accounts.createLoginLink()`. | Unchanged risk — raw 500 crash instead of structured `{error}` on Stripe rejection. | Wrap in try/catch matching sibling routes. |
| MKT-GAP-06 | `create-portal-session` / `create-coach-portal-session` unguarded Stripe call | Both confirmed by direct source read this pass to lack try/catch around `stripe.billingPortal.sessions.create`. | Same unverified-failure-path risk as MKT-GAP-03, now duplicated into the new coach route too. | Add a Stripe-failure test for both; fix if confirmed. |
| MKT-GAP-07 | Marketplace paywall is client-side only | Confirmed unchanged this pass — `upsertBooking()` in `lib/db.ts` is still a bare, unguarded Supabase `.upsert()`. | A Free-plan (or now, marketplace-disabled-tier) player could bypass `canUseMarketplace`'s render gate entirely via a direct API/db call. | Confirm RLS enforces this server-side; if not, this is a real monetization bypass. |
| MKT-GAP-08 | Marketplace copy vs. actual coach-visibility filter | Confirmed unchanged this pass. | Same conflict as before between the paywall's cross-academy promise and the same-academy-only filter. | Product decision needed, unchanged from prior analysis. |
| MKT-GAP-09 | Non-atomic pack draw-down | Confirmed unchanged this pass (`api/bookings/complete/route.ts` still fetch-then-write). | Same concurrency risk as before. | Consider a Postgres RPC/atomic increment. |
| MKT-GAP-10 | "Credit to Pack" no-op (MKT-015) | Confirmed **still present, unfixed** this pass. | HIGH risk, unchanged — this merge touched this file heavily (336 lines different) but did not fix this defect. | Fix `BookingsClient.tsx`'s handler to match `SessionPacksClient.tsx:handleCredit`. |
| MKT-GAP-11 | Platform-fee-percent duplicated across client display, checkout routes, AND now the two new fee-due routes | The `academy.plan_id → plans.platform_fee_percent ?? 10` lookup is now independently re-implemented in **five** places (`lib/utils.ts`, two checkout routes, two `record-fee-due` routes) rather than shared. | Growing surface area for the client-display-vs-actual-charge drift risk already flagged in the prior analysis. | Extract one server-importable helper; the new routes make this more urgent, not less. |
| MKT-GAP-12 | Dead code: `payment-store.ts` / `credits-store.ts` | Confirmed unchanged, still zero import sites. | Same as before. | Recommend deletion. |
| MKT-GAP-14 | `create-checkout-session` still permits `plan: "Coach Pro"` for a `playerId` | See MKT-040. Player-facing UI no longer offers it, but the route and `isPaidPlan()` still accept it. | Unclear whether this is intentionally-retained legacy flexibility or an oversight now that Coach Pro is conceptually coach-only; a player ending up with `subscription.plan === "Coach Pro"` may confuse every player-side gate that reads `PlanTier`. | Confirm with product whether this path should be explicitly blocked (reject `plan === "Coach Pro"` for a player) now that MKT-022 exists as the correct coach-side path. |
| MKT-GAP-17 | `connect/onboard`'s previously-confirmed Stripe Express account-creation defect | Prior analysis pinned this as a confirmed 502-for-every-new-coach defect via a test file; **not independently re-verified this pass**, and the route now passes a new `country` parameter that may or may not change the outcome. | Whether coach payout onboarding is currently functional at all is now genuinely unknown from this repo alone. | Re-run a live Stripe-test-mode check of this route; do not assume either the old "broken" state or a silent fix. |
| MKT-GAP-19 | Referral cron sums gross booked/packed revenue, not confirmed-collected revenue | `cron/referral-commissions/route.ts`'s `sumSessionPacks`/`sumBookingsByColumn`/`sumBookingsForAcademy` all read `fee_aud`/`total_sessions*fee_per_session` directly with **no filter on `payment_status`** — a cancelled, never-paid, or still-Pending booking/pack still counts toward the referrer's ongoing commission for that month. | The platform could owe (and, per BR-14, immediately record as `pending`) a referral commission on revenue that was never actually collected, was refunded, or belonged to a booking later cancelled. | Confirm with product whether commission accrual is meant to be gross-booked or net-collected; if net-collected, the cron needs a `payment_status = 'Paid'` filter. |
| MKT-GAP-20 | Referral commission amounts are computed from mixed-currency source rows but always recorded/displayed as AUD | The cron's revenue sums (`fee_aud`, `fee_per_session`) come from `bookings`/`session_packs` rows that, per MKT-037, can now be denominated in an academy's **own** currency (GBP/USD/NZD/AUD) — the cron performs no currency conversion or filtering, just multiplies the raw number by a rate% and writes it to `amount_aud`, and `ReferralsClient.tsx` explicitly displays every referral amount with `formatMoney(amount, "aud")`. | For any referral linked to a non-AUD academy/coach/player, the computed "AUD" commission amount is actually `(raw GBP-or-USD-or-NZD revenue) × rate%` mislabeled as AUD — a real currency-correctness bug once any academy outside Australia has an active ongoing referral. This is a HIGH-risk, directly-money-affecting finding. | Either explicitly restrict ongoing referrals to AUD-currency entities, or add real currency conversion (and multi-currency payout tracking) to the cron and the payout ledger before this is used against a non-AUD academy/coach/player. |
| MKT-GAP-21 | No idempotency keys on any checkout-session creation, including the two new coach routes | Confirmed — `create-coach-checkout-session` has no `idempotencyKey` passed to `stripe.checkout.sessions.create`, same as every pre-existing checkout route (prior analysis's MKT-GAP-05). | Same double-checkout-session risk as before, now also possible for a coach subscribing. | Extend the prior recommendation to the new route. |
| MKT-GAP-23 | Marketplace booking requests never trigger `notify-created` | Confirmed by full-file read of `FindCoachClient.tsx` — no call to `/api/bookings/notify-created` anywhere in `RequestBookingModal`'s submit handler, unlike `BookingsClient.tsx:handleSave`. | A coach who has a marketplace-visible profile and receives a player-initiated booking request gets **no** automatic email/SMS about it — they only find out by proactively checking the Bookings page. Given `source: "marketplace"` bookings start `status: "Pending"` and need a coach/staff action to confirm, this silent gap could mean requests sit unnoticed. | Confirm whether this is intentional (marketplace requests deliberately routed to a staff review queue instead) or a gap; if the latter, wire `notify-created` into the marketplace request flow too. |
| MKT-GAP-24 | Coach-Pro-gated `marketplaceVisible` is client-side only | See MKT-026. No server-side check found (in the files read) preventing a Free-tier independent coach from writing `marketplace_visible: true` directly via `upsertCoach()`. | Same class of risk as MKT-GAP-07 — a coach-side monetization-bypass candidate, newly introduced by this merge. | Confirm RLS or add a server-side check on the coach-update path. |
| MKT-GAP-25 | Stale shared test mock breaks authorization-branch evidence across this entire domain | `tests/mocks/caller.ts:rawUser()` still builds `{ id, user_metadata: metadata }`; every route in this domain now reads `app_metadata`. | This is very likely the single root cause of most of this domain's test failures this session (per the task brief's "wrong-status-code" description) — not a sign of broken production code. | Fix `rawUser()` to build `app_metadata` (or add a parallel helper) and re-run the suite before drawing any conclusions about route correctness from test results. |

---

*Document generated by static code analysis of the repository at the paths cited above, immediately following the 120-commit `origin/master` merge dated 2026-09-01. No production code, test files, or CLAUDE.md/config were modified in producing this document.*
