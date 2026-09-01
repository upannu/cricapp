# Domain: Academy Admin, B2B Billing & Platform Admin Surfaces

Reverse-engineered from the live codebase at `c:\Development\Cricket\CricApp` (Next.js 16 / React 19,
Supabase Auth+DB, Stripe, Anthropic) **as of 2026-09-01, after a 120-commit merge from `origin/master`**
that touched ~133 files. This document fully replaces the pre-merge version of itself. It covers academy
(org-level) management, self-serve academy billing (now multi-currency), the platform-admin console
(KPIs, plan catalog — which has absorbed platform-wide B2C pricing — approvals-UI consumption, admin
grant/revoke, Academy Content publishing), and a brand-new Email Templates admin subsystem. Auth-domain
internals (signup, approve-user/reject-user, invite-coach) are covered by a separate `auth.md` and
referenced here only where this domain's UI consumes them.

**Everything in this document was re-verified directly against the current source in this session.**
Where existing tests were read, they are cited only as weak/historical evidence per the note below — many
assert against a metadata shape the current route code no longer reads.

---

## 0. The app_metadata migration (cross-cutting, affects almost every route in this domain)

A sibling audit of the AUTH domain confirmed, and this session independently re-verified by reading every
route below, that RBAC data — `role`, `approved`, `academy_id`, `coach_id`, `player_id`,
`linkedIdentities` — now lives in Supabase **`app_metadata`** (server-only, settable only via
`supabase.auth.admin.updateUserById`), not `user_metadata` (client-writable) as before. Every route in
this domain that performs a role/ownership check now reads `caller.app_metadata?.role` /
`.app_metadata?.academy_id` etc., either directly (`user.app_metadata?.role` inline in several routes) or
via the shared `getCaller()` helper (`web/lib/server-auth.ts`), which itself reads
`user.app_metadata?.role/academy_id/coach_id/player_id`. `user_metadata` is now used **only** for the
display-only `name` field (confirmed in `web/lib/auth.tsx`, `supabaseUserToAuthUser`).

**This directly explains why this domain's existing route/component tests are unreliable as evidence**:
the shared test mock helper `web/tests/mocks/caller.ts` — `rawUser({ role, academy_id, ... })` — still
constructs `{ id, user_metadata: metadata }`. Every route test in this domain that calls `rawUser(...)`
to simulate a signed-in caller (confirmed for `web/tests/api/plans/update.test.ts`; the same helper is
shared platform-wide) is asserting against a metadata field the route no longer reads, so `caller.role`
resolves to `undefined` for every "should succeed as platform_admin" positive-path assertion — those
tests will now fail (wrongly getting 403), while negative-path "non-admin gets 403" tests will pass
"for the wrong reason" (any undefined role also gets 403). This is a **single shared root cause**, not
20 independent test bugs — see ADMIN-GAP-011.

---

## 1. Domain Overview

CricHQ is a fast-bowling coaching platform serving four roles: `platform_admin`, `academy_admin`,
`coach`, `player`/`parent`. This domain covers the layer above individual coaching: **academies** (the
org/tenant unit grouping coaches and players, now with a required `country`/derived `currency`), their
**B2B billing** (a self-serve Stripe Checkout catalog that now resolves to a per-academy currency), and
the **platform-admin console** (cross-academy KPIs, the plan catalog editor — which now also owns
multi-currency pricing and replaces the deleted platform-pricing page, physical net management,
platform-admin grant/revoke, approvals-queue consumption, Academy Content/curriculum publishing, and a
new Welcome-Email-Templates editor).

Two roles can reach most of this domain: `platform_admin` (sees/manages every academy, plus
platform-only screens under `/admin/*`) and `academy_admin` (scoped to exactly one academy via
`app_metadata.academy_id` — previously `user_metadata.academy_id`, see Section 0 — with
billing/roster-edit rights on it but not create/delete/deactivate or platform-wide screens).

### Confirmed removal: `/admin/pricing` and `PlatformPricingClient`

Directly verified this session:
- `web/app/(dashboard)/admin/pricing/page.tsx` — **does not exist** in the current file tree.
- `web/components/PlatformPricingClient.tsx` — **does not exist** (deleted in the merge).
- `PlatformSettings` (the type) — **zero matches** anywhere under `web/` except in the one stale test
  file below; confirmed gone from `web/lib/types.ts`.
- `web/app/api/platform-settings/update/route.ts` — **does not exist**. Git history for this session
  confirms it was **renamed**, not deleted outright: `web/app/api/email-templates/update/route.ts` now
  occupies the old route's position in history, but its actual body was rewritten — see ADMIN-015 (REMOVED)
  and ADMIN-023 (NEW) below for what the new route at that URL actually does.
- What replaced platform-wide B2C pricing management: **the Plan Catalog** (`/admin/plans`,
  `PlansAdminClient.tsx`). `Plan` gained a `pricesByCurrency: Partial<Record<Currency, number>>` field
  (`web/lib/types.ts`), and `PlansAdminClient.tsx`'s edit modal now has an "Other currencies (optional)"
  grid (one numeric input per non-AUD supported currency) alongside the existing AUD price field. There
  is **no evidence** any dedicated "platform pricing" concept survived under a different name — Player
  Pro / Coach Pro pricing is not touched by this change; see ADMIN-015 for what's genuinely gone.
- Two stale references remain in the tree and are flagged as gaps, not evidence the removal is
  incomplete: `web/tests/components/PlatformPricingClient.test.tsx` (imports a component that no longer
  exists) and `web/tests/api/platform-settings/update.test.ts` (imports
  `@/app/api/platform-settings/update/route`, a path that no longer resolves). See ADMIN-GAP-012.

---

## 2. Implemented Requirements

### ADMIN-001 — Academy CRUD (create, edit, activate/deactivate)
- **Category:** Academy management
- **Description:** `platform_admin` can create a new academy, edit any academy's core fields (name,
  description, location, phone, country, start date, stage, status), and toggle Active/Inactive via a
  3-dot menu with a confirmation dialog. `academy_admin` can edit (but not create/deactivate) their own
  academy via an "Edit" button shown only when `user.academyId === academy.id`.
- **Component/Module:** `web/components/AcademyClient.tsx` (`openAdd`, `openEdit`, `handleSave`,
  `handleMenuAction`, `handleConfirmToggle`)
- **Source files:** `web/app/(dashboard)/academy/page.tsx` (thin wrapper), `web/components/AcademyClient.tsx`,
  `web/lib/db.ts` (`upsertAcademy`, `fetchAcademies`, `dbToAcademy`)
- **Inputs:** name* (required, trimmed non-empty), description, location, phone, **country** (new, see
  ADMIN-022), start date, stage (`Foundation|Mechanics|Velocity|Elite`), status (`Active|Inactive`), Head
  Coach (`headCoachId`, required — ADMIN-002), additional coach IDs, player IDs, session fee, per-session-
  type fees, per-age-group fees, payout model.
- **Outputs:** upsert into `academies` table; new academy IDs are client-generated as `` `ac${Date.now()}` ``.
- **Validation rules:** `name` non-empty; `headCoachId` non-empty (blocking "Academy Owner Required" modal).
- **Business rules:** `player_counts` (per-age-group headcount) is recomputed client-side on every save,
  not DB-triggered. A coach created inline via "+ Create New Coach" is inserted with `academy_id: null`
  and back-filled (`setCoachesAcademy`) only after the academy row itself saves — see Gaps for the
  two-step consistency risk.
- **Permissions:** `platform_admin` — full CRUD, all academies. `academy_admin` — edit only, own academy
  only. `coach`/`player` — no create/edit affordances rendered.
- **Error/exception behavior:** Save failure → `` `Save failed: ${msg}` ``, modal stays open. A subsequent
  coach-backfill failure after a successful academy save → `` `Academy saved, but linking coaches failed: ${msg}` ``
  — i.e. a save can partially succeed with no rollback.
- **Status:** IMPLEMENTED (unchanged in mechanics from the prior analysis; inputs gained `country`)

### ADMIN-002 — Academy Owner (Head Coach) requirement
- **Description:** Every academy must have exactly one designated owner (`headCoachId`), always kept a
  member of `coachIds` (cannot be removed from the additional-coaches list while owner).
- **Component:** `AcademyClient.tsx` (`setOwner`, `toggleCoach`, `ownerMissing`/`ownerSuggested`)
- **Status:** IMPLEMENTED (unchanged)

### ADMIN-003 — Academy roster: player assignment (manual, new-player, CSV import)
- **Description:** Within the Edit-Academy modal, `playerIds` can be toggled from the full player list, a
  brand-new player created inline and auto-assigned, or a CSV bulk-imported.
- **Source:** `AcademyClient.tsx`; `web/lib/db.ts` (`insertPlayer`, `insertPlayers`, `updateAcademyFields`)
- **Inputs (CSV):** `name*, email*, ageGroup, bowlingStyle, club, phone` (case-insensitive headers);
  downloadable template provided.
- **Validation:** row `skipped` if name/email blank; `duplicate` if email exists among current players or
  elsewhere in-file (case-insensitive); unrecognized age group/bowling style are defaulted and flagged
  `warning`.
- **Business rule:** CSV import commits immediately (`updateAcademyFields`) on click, independent of the
  outer "Save Changes" — deliberately, per an in-code comment, to avoid losing a bulk import to an
  accidentally-closed modal. Manual single-player add inserts the player row immediately too, but is only
  added to `draft.playerIds` pending the outer save.
- **Change this session:** a newly-created player/coach's `currency` field is now set from
  `currencyForCountry(draft.country)` rather than a hardcoded value — see ADMIN-022.
- **Status:** IMPLEMENTED

### ADMIN-004 — Academy roster: coach assignment
- **Description:** Additional coaches can be toggled per academy; a coach already assigned elsewhere is
  annotated ("In: {academy names}") but not blocked from a second assignment.
- **Source:** `AcademyClient.tsx` (`toggleCoach`, `coachAcademyMap`, `additionalCoaches`)
- **Status:** IMPLEMENTED (unchanged)

### ADMIN-005 — Academy pricing configuration
- **Description:** Three independent, optional pricing layers per academy: a flat "Default Session Fee",
  a per-session-type override grid, and a per-age-group override grid. Stored as `session_fee_aud`
  (numeric) and `session_type_fees`/`age_fees` (jsonb).
- **Business rule:** `ageFees` entries `<= 0` are stripped before persisting.
- **Change this session:** every money amount in this tab is now rendered through
  `formatMoney(amount, academy.currency)` (`web/lib/currency.ts`) instead of a hardcoded `$` — the
  session fee, per-type fees, and per-age fees are now displayed in the academy's own currency (derived
  from its country), not always AUD. The stored numeric fields are still literally named
  `session_fee_aud`/`sessionFeeAud` in the schema/type even though they may represent a non-AUD amount
  for a non-AU academy — **REQUIRES VALIDATION**: this is either an intentional "the field name is legacy,
  the value is currency-agnostic" design, or a naming trap that could confuse a future refactor into
  thinking these are always AUD-denominated.
- **Derived display:** live platform-fee split (`getPlatformFeePercent(academyId, academies, plans)` ×
  `sessionFeeAud`), formatted in `academy.currency`.
- **Status:** IMPLEMENTED

### ADMIN-006 — Payout model selection
- **Description:** Radio choice between `head_coach` and `split_by_coach`, persisted as
  `academies.payout_model`.
- **Note:** Only configures the model; actual Stripe Connect payout-splitting logic lives outside this
  domain's files (not re-traced this session).
- **Status:** IMPLEMENTED (config surface only)

### ADMIN-007 — Academy list scoping (self-view for academy_admin)
- **Description:** `academy_admin` sees only their own academy in the `/academy` list; "+ New Academy"
  and the platform-admin-only 3-dot menu are hidden for them.
- **Source:** `AcademyClient.tsx`, `displayed` filter:
  `if (user?.role === "academy_admin" && user.academyId && a.id !== user.academyId) return false;`
  — `user.academyId` is now sourced from `app_metadata.academy_id` (Section 0), not `user_metadata`.
- **Caveat (unchanged from prior analysis, HIGH RISK, still unresolved — ADMIN-GAP-001):**
  `fetchAcademies()` (`web/lib/db.ts`) still issues an **unfiltered** `select("*")` regardless of caller
  role; academy_admin scoping is applied client-side only, after every academy row has already reached
  the browser. Whether Postgres RLS on `academies` genuinely enforces this at the DB layer is **UNKNOWN**
  from this repo (no migrations/policy definitions found). The same unfiltered pattern was newly observed
  this session on `fetchNets()` — see ADMIN-025.
- **Status:** PARTIALLY_IMPLEMENTED / UNKNOWN (client filter confirmed; DB-level enforcement UNKNOWN)

### ADMIN-008 — Academy self-serve billing: plan selection & Checkout (now multi-currency)
- **Description:** `/academies/[id]/billing` shows the academy's current plan/subscription and a grid of
  selectable organization-audience plans. Clicking "Subscribe" POSTs to
  `/api/stripe/create-academy-checkout-session` and redirects to the returned Stripe Checkout URL.
- **Component:** `web/components/AcademyBillingClient.tsx` (`handleCheckout`)
- **API route:** `web/app/api/stripe/create-academy-checkout-session/route.ts`
- **Inputs:** `{ academyId, planId }`
- **Authorization:** caller must be `platform_admin`, or `academy_admin` whose
  `user.app_metadata.academy_id === academyId`; else `403`. No session ⇒ `401`.
- **Validation:** `academyId`/`planId` required (`400`); academy exists (`404`); plan exists, `active`,
  `audience === "organization"` (`400`).
- **CHANGED this session — currency resolution:** the route now calls
  `resolvePlanPrice(plan.price_aud, plan.prices_by_currency, academy.currency)` (`web/lib/currency.ts`)
  to pick the amount **and currency** to actually charge: if the academy's currency has a configured
  override price on the plan, that override amount is charged in that currency; otherwise it falls back
  to `price_aud`/AUD. The Stripe Checkout line item's inline `price_data.currency` is now this resolved
  currency, not always `"aud"` as implied by the pre-merge analysis. The UI card
  (`AcademyBillingClient.tsx`) shows the same resolved amount via the same `resolvePlanPrice` call, so
  what's displayed and what's charged can't drift.
- **Business rules (unchanged mechanics):** creates a Stripe Customer on first purchase if none exists
  (head coach's email as contact); inline `price_data` (not a stored Stripe Price ID) — price/currency
  are whatever `resolvePlanPrice` returns *at the moment of checkout*, not versioned; `mode: subscription`,
  metadata tags `academy_subscription`.
- **Status:** IMPLEMENTED

### ADMIN-009 — Academy billing: manage subscription (Stripe Billing Portal)
- **Description:** Once an academy has an active/trialing subscription, the CTA becomes "Manage Billing",
  opening a Stripe-hosted Billing Portal session.
- **API route:** `web/app/api/stripe/create-academy-portal-session/route.ts`
- **Authorization:** same pattern as ADMIN-008, now reading `user.app_metadata?.role`/`academy_id`.
- **Validation:** `academyId` required (`400`); academy must have `stripe_customer_id` set (`400`
  otherwise).
- **Status:** IMPLEMENTED (auth source changed per Section 0; behavior otherwise unchanged)

### ADMIN-010 — Academy subscription state sync (Stripe webhook)
- **Description:** `web/app/api/stripe/webhook/route.ts` keeps `academies` rows in sync for
  `metadata.type === "academy_subscription"` events (`checkout.session.completed`,
  `customer.subscription.updated`, `customer.subscription.deleted`) — sets/refreshes
  `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `plan_id`, computed
  `access_expires_at`.
- **Status:** IMPLEMENTED (not re-read line-by-line this session beyond confirming it's unlisted in the
  changed-files set; carried forward as INFERRED-stable)

### ADMIN-011 — Academy billing: invoice history (read-only)
- **Description:** `<InvoiceHistoryList scope="academy" id={academy.id} />` fetches
  `/api/stripe/invoices?academyId=...` and lists past invoices with a Download link. Display-only.
- **Status:** IMPLEMENTED

### ADMIN-012 — Plan seat-cap warning (advisory only)
- **Description:** While editing an academy, if assigned players exceed the active org plan's `seatCap`,
  an amber warning appears: `` `${playerIds.length} bowlers assigned, but the ${plan.name} plan is capped at ${seatCap}.` ``
  — confirmed still present verbatim in `AcademyClient.tsx`.
- **Business rule:** Soft, advisory-only — nothing blocks saving an over-cap roster; no server-side
  seat-cap enforcement found in this domain's routes.
- **Status:** IMPLEMENTED (warning); NOT_IMPLEMENTED (enforcement)

### ADMIN-013 — Platform admin: cross-academy KPI dashboard
- **Description:** `/admin/kpis` shows platform-wide stats (total/active academies, total coaches, total
  unique players, "needs attention" count), a plan-distribution breakdown, and a full academies table.
- **Component:** `web/components/PlatformKpisClient.tsx`
- **Calculations (unchanged):** `totalPlayers` de-duplicated across academies via `Set`; `needsAttention`
  = `subscriptionStatus` past_due/unpaid, or `status === "Active"` with no `planId`; table sorted
  attention-first then alphabetical.
- **Change this session:** the plan-distribution row's price display now goes through
  `formatMoney(plan.priceAud, "aud")` (explicitly pinned to AUD here, unlike the academy-currency-aware
  displays elsewhere) — this cross-academy view always shows each plan's AUD list price regardless of
  which academies bought it in another currency, which is consistent (one canonical reference price per
  plan) but means this table cannot be used to read what a specific academy is actually being billed in
  its own currency.
- **Permissions:** client-side redirect to `/players` for non-`platform_admin`; the underlying fetches
  (`fetchAcademies`, `fetchCoaches`, `fetchAllPlans`) still have **no server-side role check** — same gap
  as before (ADMIN-GAP-002).
- **Status:** IMPLEMENTED

### ADMIN-014 — Platform admin: plan catalog CRUD (`/admin/plans`) — now multi-currency and feature-gated
- **Description:** Create, edit, activate/deactivate rows in the `plans` table — B2C and B2B pricing tiers
  (Library, one-time Assessments, Academy/Club/Board org licenses) **and, per the in-UI copy, "B2C and
  B2B pricing tiers beyond Player Pro / Coach Pro"**. This is the single admin surface for the entire
  configurable catalog now that platform-wide pricing has no separate page (see Section 1).
- **Component:** `web/components/PlansAdminClient.tsx`
- **API route:** `web/app/api/plans/update/route.ts` (single endpoint: insert when no `id`, update
  when `id` present)
- **Fields (CHANGED — grew substantially this session):**
  `slug*, name*, audience* (individual|organization), billingType* (subscription|one_time),
  billingInterval (month|year, subscription only), priceAud* (>= 0 — CHANGED, was previously required
  > 0; a $0 plan is now valid, e.g. for an internal/test tier), **pricesByCurrency** (NEW — optional
  per-currency override map, one field per non-AUD supported currency: usd/gbp/nzd/inr), seatCap,
  accessDurationMonths, includedNotes, waivesSessionFees (bool), platformAdminOnly (bool),
  platformFeePercent (0–100, default 10), active (bool), sortOrder,
  **sessionsPerMonthLimit** (NEW, individual tiers), **chatMessagesPerDayLimit** (NEW, Coach AI chat cap),
  **aiReportsEnabled** (NEW, bool), **marketplaceEnabled** (NEW, bool), **locked** (NEW, read-only flag —
  see below).
- **NEW — "locked" system plans:** a plan row can be `locked: true` (currently the three seeded tier
  plans, slug `free`/`player-pro`/`coach-pro`, per the in-UI copy "This is a system plan (Free / Player
  Pro / Coach Pro)"). For a locked plan, the edit modal disables `slug`, `audience`, and `billingType`
  inputs client-side, and the API route independently re-asserts the same lock server-side: on update, if
  `plans.locked` is true for that row, the route overwrites the incoming `slug`/`audience`/`billing_type`/
  `billing_interval` with the existing DB values before writing, regardless of what the client sent — a
  genuine server-side enforcement, not just a disabled input.
- **Validation (server-side, in the route):**
  - `slug`, `name` non-empty; `audience` ∈ {individual, organization}; `billingType` ∈
    {subscription, one_time}; `priceAud >= 0` (CHANGED from `> 0`) — else `400`.
  - `billingType === "subscription"` requires `billingInterval` ∈ {month, year}; `one_time` forbids one —
    else `400`.
  - `platformFeePercent`, if provided, `0 ≤ x ≤ 100` — else `400`.
  - NEW: `sessionsPerMonthLimit`/`chatMessagesPerDayLimit`, if provided, must be non-negative numbers —
    else `400`.
  - NEW: every key in `pricesByCurrency` must be a `isSupportedCurrency()` value other than `"aud"`
    (aud is the base `priceAud` field, not an override), with a non-negative numeric value — else `400`
    `` `Invalid price override for currency "${currency}".` ``.
- **Authorization:** `caller?.app_metadata?.role !== "platform_admin"` → `403` (CHANGED from
  `user_metadata` per Section 0; the route still does its own direct cookie-based check rather than the
  shared `getCaller()` helper — same duplication noted pre-merge, see ADMIN-GAP-003). No distinct 401 for
  "not signed in" — an absent session simply fails the role check too.
- **Business rules (unchanged from before):** `waivesSessionFees` is a live, read-time flag, not
  snapshotted per-academy at subscribe time; `platformAdminOnly` plans are filtered from
  `AcademyBillingClient`'s `selectablePlans` unless the viewer is `platform_admin`.
- **Status:** IMPLEMENTED

### ADMIN-015 — REMOVED: Platform admin: flat B2C subscription pricing (`/admin/pricing`)
- **Prior description:** `/admin/pricing` edited the two flat, platform-wide `platform_settings.player_pro_price_aud`/`coach_pro_price_aud` values.
- **Confirmed removed this session:** `web/app/(dashboard)/admin/pricing/page.tsx`,
  `web/components/PlatformPricingClient.tsx`, `web/app/api/platform-settings/update/route.ts`, and the
  `PlatformSettings` type in `web/lib/types.ts` are all gone. See Section 1 for the direct-verification
  detail and Section 9 for the full removal writeup.
- **What replaced it — REQUIRES VALIDATION:** the merge did not obviously re-implement flat Player Pro /
  Coach Pro price editing anywhere. `Plan` rows with slug `player-pro`/`coach-pro` now exist as `locked`
  entries in the same Plan Catalog (ADMIN-014) and their `priceAud`/`pricesByCurrency` fields are editable
  there like any other plan — so editing Player Pro's price plausibly now happens through `/admin/plans`
  by editing the `player-pro` plan row instead of a dedicated pricing page. This is a **strong inference**
  from the `locked` mechanism's own description ("system plan (Free / Player Pro / Coach Pro)... Price,
  limits, and everything else are still editable") but this session did not trace the actual player-facing
  Player Pro/Coach Pro Stripe checkout route(s) to confirm they read `priceAud` from the `plans` table
  (by slug) rather than from some other still-existing config source — that would need a follow-up read of
  the individual (player/coach) subscription checkout routes, which are outside this domain's file list.
- **Status:** REMOVED (page/component/route/type all confirmed gone); its likely replacement (editing the
  locked `player-pro`/`coach-pro` rows via ADMIN-014) is REQUIRES_VALIDATION, not confirmed.

### ADMIN-016 — Quote-based / negotiated B2B pricing model (per `PACE_HQ_B2B_Platform_Spec.md`)
- **Description:** A companion spec document proposes per-institution negotiated pricing, a lead-intake
  surface, and Stripe Invoicing, explicitly stating none of it is built.
- **Status:** NOT_IMPLEMENTED (not re-verified this session; carried forward unchanged — no files in this
  session's review scope touched this area, and the spec doc's own disclaimer stands)

### ADMIN-017 — Platform admin: approvals queue consumption (UI)
- **Description:** `/admin/approvals` renders pending account requests (from `/api/pending-approvals` —
  see `auth.md`) and drives Approve/Reject, including the academy-assignment sub-flow.
- **Component:** `web/app/(dashboard)/admin/approvals/page.tsx` — a client component (whole page is
  `"use client"`), unchanged structurally from the prior analysis.
- **This domain's specific piece:** Approving an `academy_admin`-role request opens an "Assign Academy"
  dialog defaulting to "New Academy" (pre-filled from the requester's self-reported name/location), with
  an explicit toggle to "Existing Academy". "Create Academy" here calls the same `upsertAcademy` as
  ADMIN-001.
- **CHANGED this session (small, ~11 lines):** the inline academy object constructed by
  `handleCreateAcademy` after a successful create now includes `country: "AU", currency: "aud"` and
  `payoutModel: "head_coach"` in the client-side optimistic state update — bringing this ad-hoc academy
  object in line with the now-required `Academy.country`/`.currency` fields (ADMIN-022). The actual
  `upsertAcademy()` DB write in this flow still does **not** send a `country`/`currency` field explicitly
  (only `id, name, description, location, player_ids, ..., session_fee_aud, session_type_fees, age_fees`)
  — relying on `dbToAcademy`'s `?? "AU"` / `?? DEFAULT_CURRENCY` fallback (ADMIN-022) when the row is
  later re-fetched, rather than writing an explicit country at creation time. This is a minor
  inconsistency (client optimistic state assumes AU explicitly; the DB write leaves it to a column
  default/fallback) but not a functional bug given the fallback exists.
  Choosing "Existing Academy" with nothing selected still allows Approve (advisory-only warning, not a
  block, same as before).
- **Status:** IMPLEMENTED

### ADMIN-018 — Platform admin: grant/revoke platform_admin
- **Description:** `/admin/admins` lists every non-rejected user (split "Platform Admins" / "Everyone
  Else") with Promote/Demote actions.
- **Component:** `web/components/PlatformAdminsClient.tsx`
- **API routes:** `web/app/api/platform-admins/list/route.ts` (GET), `.../toggle/route.ts` (POST)
- **CHANGED this session (auth source, Section 0):**
  - `list`: authorization via `getCaller()`; filters out `u.app_metadata?.approved === false` (was
    `user_metadata`); maps `role: u.app_metadata?.role ?? "coach"` (was `user_metadata`); `name` is still
    read from `u.user_metadata?.name` (display-only field, correctly still there).
  - `toggle`: `caller.role !== "platform_admin"` via `getCaller()` → `403`; self-modification guard
    unchanged (`caller.userId === userId` → `400`); on success now calls
    `supabase.auth.admin.updateUserById(userId, { app_metadata: { role: makeAdmin ? "platform_admin" : fallbackRole } })`
    — **CHANGED from `user_metadata`**. Still replaces `role` only, leaving `academy_id`/`coach_id`
    untouched — the same demote-to-unscoped-role gap as before (ADMIN-GAP-004) persists unchanged, just on
    the new metadata field.
- **UI safeguard:** caller's own row never renders Promote/Demote (`isSelf` check), unchanged.
- **Status:** IMPLEMENTED

### ADMIN-019 — Platform admin: Academy Content (curriculum) publishing
- **Description:** `/admin/academy` manages `articles` (4-stage curriculum) and `daily_tips` backing the
  player-facing Academy learning module.
- **Component:** `web/components/AcademyContentAdminClient.tsx`
- **Source:** `web/lib/db.ts` (`fetchAllArticlesForAdmin`, `upsertArticle`, `deleteArticle`,
  `fetchTipArchive`, `upsertDailyTip`, `deleteDailyTip`) — all via the browser (anon-key) Supabase client,
  not a service-role route; same authorization-implication gap as before (ADMIN-GAP-002/003).
- **Business rule — new-article notification:** on save, if the article is newly flipped to
  `published: true` (not already published before this save), a fire-and-forget POST to
  `/api/notify-new-article` fires. Re-saving an already-published article does not re-notify.
- **Status:** IMPLEMENTED (unchanged this session — file not in the substantially-changed set, verified
  it still matches the prior description)

### ADMIN-020 — Plan-edit propagation to existing academies (live lookup, not a snapshot)
- **Description:** Editing a plan row's `platformFeePercent`, price(s), `seatCap`,
  `accessDurationMonths`, `waivesSessionFees`, or `active` flag takes effect immediately for every academy
  currently pointing at that `plan_id` — no snapshotting at subscribe-time.
- **CHANGED this session:** the live-lookup now also applies to `pricesByCurrency` — editing a plan's
  currency override table changes what `AcademyBillingClient`'s picker displays via `resolvePlanPrice`
  immediately, the same as `priceAud` always did. As before, an *already-subscribed* academy's actual
  Stripe-billed amount is unaffected until they re-subscribe (their subscription's price was fixed into a
  Stripe object at their own checkout time) — only the on-screen "what does this plan cost" projection and
  any *new* checkout are live.
- **Status:** IMPLEMENTED (as designed) — same blast-radius risk as before (ADMIN-GAP-008), now also
  covering currency-override edits.

---

### ADMIN-021 — NEW: Multi-currency plan pricing infrastructure (`lib/currency.ts`)
- **Category:** B2B billing / platform admin
- **Description:** A new shared currency module underpins ADMIN-008, ADMIN-014, ADMIN-020, ADMIN-022, and
  approve-user's plan-summary email. Defines `Currency = "aud" | "usd" | "gbp" | "nzd" | "inr"`,
  `SUPPORTED_CURRENCIES`, `DEFAULT_CURRENCY = "aud"`, and `COUNTRY_OPTIONS` (AU/NZ/GB/US only — deliberately
  excludes India from the *country* list even though INR is a supported currency, because Stripe Connect
  Express doesn't support India as a connected-account country per the in-code comment citing Stripe's own
  docs; INR is usable only for individual, non-Connect purchases).
- **Key functions:**
  - `currencyForCountry(code)`: derives currency from country code, defaulting to `DEFAULT_CURRENCY` for
    an unrecognized code.
  - `resolvePlanPrice(priceAud, pricesByCurrency, preferred)`: returns `{amount, currency}` — the
    preferred-currency override if one exists and preferred isn't already `"aud"`, else `{priceAud, "aud"}`.
    Shared by every plan-based Stripe checkout route (per its own doc comment) "so 'does this plan support
    the buyer's currency' is decided in exactly one place" — confirmed used by
    `create-academy-checkout-session`, `AcademyBillingClient`, and `plan-email.ts`.
  - `sumMoneyByCurrency(entries)`: sums same-currency entries, renders mixed-currency totals as
    `"A$120.00 + NZ$45.00"` style rather than a meaningless cross-currency sum. **Not observed being
    called anywhere in this domain's files** in this session's review — REQUIRES_VALIDATION whether it's
    used elsewhere in the app (e.g. a cross-academy revenue report outside this domain) or currently dead
    code.
  - `formatMoney(amount, currency)`: the one shared money formatter (`Intl.NumberFormat("en-AU", ...)`),
    used pervasively across `AcademyClient.tsx`, `AcademyBillingClient.tsx`, `PlansAdminClient.tsx`,
    `PlatformKpisClient.tsx`.
- **Status:** IMPLEMENTED

### ADMIN-022 — NEW: Academy country → currency binding, locked once payouts exist
- **Category:** Academy management
- **Description:** `Academy` gained a required `country: string` field (ISO 3166-1 alpha-2, e.g. `"AU"`)
  and `currency: Currency` is now always *derived* from it via `currencyForCountry`, never picked
  independently. Set at academy creation via a Country dropdown (`COUNTRY_OPTIONS`) in the Academy
  edit/create modal.
- **Component:** `AcademyClient.tsx` — `academyCountryLocked` (computed once, shared by both the disabled-
  dropdown UI state and `handleSave`'s enforcement, "so the two can never disagree" per the in-code
  comment).
- **Business rule — lock condition:** the Country field becomes disabled once **either** the head coach
  or any assigned coach has a `stripeConnectAccountId` — because "a Connect account's payout currency is
  tied to the country it was created with" (Stripe can't move a connected account's country after the
  fact). UI copy: "Locked — a coach here already has a Stripe payout account set up."
- **Server-side enforcement of the lock:** on save, if `academyCountryLocked` is true, `handleSave` uses
  the **existing** academy row's `country` (looked up fresh from `academies` state, not the draft) rather
  than whatever the (disabled but still form-bound) `draft.country` currently holds — explicitly to
  guard against "a stale/injected draft value" slipping through. This is a client-side-only guard,
  however — **REQUIRES VALIDATION** whether `/api/plans/update`-style server-side re-validation exists
  anywhere for a direct `upsertAcademy()` call bypassing the UI (it goes straight to the anon-key Supabase
  client with no dedicated academy-write API route in this domain, so the lock's only enforcement is this
  one client-side branch plus whatever RLS may or may not exist — same category of risk as ADMIN-GAP-001).
- **Backward compatibility:** `dbToAcademy()` defaults `country: r.country ?? "AU"` and
  `currency: (r.currency as Currency) ?? DEFAULT_CURRENCY` — pre-migration academy rows with no `country`
  column value read back as AU/AUD rather than erroring or crashing.
- **Downstream effects:** every money display for an academy (session fees, plan prices in
  `AcademyBillingClient`, KPI table currency-agnostic AUD reference) now flows through this field; new
  players/coaches created inline during academy editing get `currency: currencyForCountry(draft.country)`
  rather than a hardcoded AUD.
- **Status:** IMPLEMENTED

### ADMIN-023 — NEW: Welcome Email Templates admin (`/admin/email-templates`)
- **Category:** Platform admin console (new subsystem)
- **Description:** A platform-admin-only editor for the four role-scoped welcome-email templates sent
  automatically by `/api/approve-user` on account approval — **not** a general "platform settings" page
  despite occupying the URL/route the old `platform-settings/update` route used to (see Section 1). Each
  of the 4 fixed rows (`player`, `coach`, `academy_admin`, `parent` — `WelcomeEmailRole`) has an editable
  `subject`, `heading`, and `body`, each supporting a `{{name}}` placeholder token.
- **Page/Component:** `web/app/(dashboard)/admin/email-templates/page.tsx` (thin wrapper) →
  `web/components/EmailTemplatesAdminClient.tsx` (176 lines)
- **API route:** `web/app/api/email-templates/update/route.ts` — this is the file that occupies the old
  `platform-settings/update` route's position in git history, per the task's confirmed rename, but its
  actual body/purpose is entirely email-template-specific, not general platform settings (see below).
- **Data:** `web/lib/db.ts` `fetchEmailTemplates()` → `sb.from("email_templates").select("*").order("id")`
  → `dbToEmailTemplate`. `EmailTemplate { id: WelcomeEmailRole; subject; heading; body }`
  (`web/lib/types.ts`).
- **UI mechanics:** role-tab switcher (Player/Coach/Academy/Parent); a live split-pane preview rendered via
  `renderTemplate(draft.subject/heading/body, { name: "Alex Smith" })` (from `web/lib/email-templates.ts`)
  showing exactly what an approved user would see, including paragraph-splitting on blank lines
  (`body.split(/\n{2,}/)`); Save button disabled unless the active tab's draft differs from the last-saved
  value (`dirty` check).
- **API validation:** `id` must be one of the 4 fixed `VALID_ROLES`; `subject`/`heading`/`body` must all
  be strings — else `400` "Invalid template data."
- **Authorization:** `caller?.app_metadata?.role !== "platform_admin"` → `403` (direct cookie check,
  inline, same pattern/duplication as ADMIN-014 — see ADMIN-GAP-003).
- **Write:** `supabase.from("email_templates").update({ subject, heading, body, updated_at }).eq("id", id)`
  — update-only; rows are never inserted or deleted through this UI (the 4 rows are treated as fixed,
  seeded data, never user-created).
- **Consumption by outgoing email (confirms this is live, not just a preview tool):**
  `web/app/api/approve-user/route.ts` fetches `email_templates` by the approved request's role, runs
  `renderTemplate(...)` on subject/heading/body with `{ name: reqData.name }`, and falls back to a
  hardcoded generic subject/heading/body ("Your CRIC HQ account has been approved" / `Welcome, ${name}! 🏏`
  / "Your CRIC HQ account has been approved as a ${roleLabel}.") if the DB row is ever missing — an
  explicit design choice so approval emails "never silently go unsent" even if the templates table has a
  gap.
- **Determination on the task's specific question — "still functionally platform settings under a new
  name, or genuinely narrowed to email-template content":** **narrowed**. The route/table/UI are entirely
  and exclusively about the 4 welcome-email templates; there is no trace of the old
  `player_pro_price_aud`/`coach_pro_price_aud` fields, or any other non-email-template concept, anywhere
  in the new route, the new component, or the `email_templates` table's usage. The URL path coincidentally
  landing where the old route's git history sits does not carry forward any of its old scope.
- **Status:** IMPLEMENTED

### ADMIN-024 — NEW: On-demand "email my plan details" resend (academy billing)
- **Category:** B2B billing
- **Description:** A button on `/academies/[id]/billing` ("📧 Email Plan Details") that re-sends a summary
  of the academy's current plan — for when someone asks again after the one-time approval email. Reuses
  the exact same plan-lookup helper as the original welcome email so content can never drift.
- **Component:** `AcademyBillingClient.tsx` → `EmailPlanDetailsButton` (inline sub-component)
- **API route:** `web/app/api/send-plan-email/route.ts` (88 lines)
- **Shared logic:** `web/lib/plan-email.ts` → `fetchAcademyPlanInfo(supabase, academyId)` — looks up the
  academy's `plan_id`/`currency`, joins the `plans` row, and formats a plan-lines array via
  `resolvePlanPrice` + `formatMoney` + the plan's `included_notes`. Used by both this route and
  `approve-user`'s welcome email.
- **HTML rendering:** `web/lib/email-templates.ts` → `buildPlanDetailsEmailHtml(...)` — same visual shell
  (`shell()`, brand-green header, info-box) as the welcome email's `buildWelcomeEmailHtml`.
- **Authorization:** `getCaller()`; `platform_admin`, or `academy_admin` whose `caller.academyId ===
  academyId` — else `403`. No caller ⇒ `401`.
- **Validation:** `academyId` required (`400`); academy must exist (`404`); the academy must have a plan
  with at least one plan-info line, else `400` "This academy has no plan assigned yet — nothing to send.";
  Gmail SMTP env vars must be configured, else `500`.
- **Recipients:** **every** account with `app_metadata.role === "academy_admin"` and
  `app_metadata.academy_id === academyId` (not just the caller) — explicitly so a platform_admin
  triggering this on a customer's behalf reaches the actual academy admin(s) without needing to know who
  they are. `404` "No academy admin account found for this academy" if the list is empty.
- **Send mechanics:** `nodemailer` via Gmail SMTP, one email per recipient, best-effort
  (`.catch(() => {})` per recipient so one bad address doesn't block others); response reports `sent` count;
  `502` only if **zero** sends succeeded.
- **Status:** IMPLEMENTED

### ADMIN-025 — Physical net (bowling net) management per academy
- **Category:** Academy management
- **Description:** Within an academy's expanded accordion row, a "Nets" tab lists/creates/edits/deletes
  named practice nets (`name`, `dimensions`, e.g. "Net 1" / "30m x 3.5m") used at booking time to assign a
  specific net when an academy has more than one. Inline add/edit form, delete with an inline
  confirm-or-cancel (not a modal).
- **Component:** `AcademyClient.tsx` (`openAddNet`, `openEditNet`, `handleSaveNet`, `handleDeleteNet`,
  `showNetForm`/`editingNetId`/`netDraft` state)
- **Source:** `web/lib/db.ts` (`fetchNets`, `upsertNet`, `deleteNet`), `web/lib/types.ts` (`Net { id,
  academyId, name, dimensions }`)
- **Note on scope/verification:** this component and its net-management tab were **not covered by the
  prior (pre-merge) analysis of this domain at all** — it is documented here for the first time in this
  audit. Whether the Nets feature itself is new to this session's merge, or simply was present before and
  missed by the prior pass, could not be determined from this session's file-diff scope (Nets files were
  not called out in the task's changed-file list). Treat its "new-ness" as UNKNOWN; its current
  *implementation* is confirmed IMPLEMENTED either way.
- **Scoping gap (same shape as ADMIN-GAP-001):** `AcademyClient.tsx` calls `fetchNets()` with **no**
  `academyId` argument even though `fetchNets(academyId?)` supports server-side filtering
  (`.eq("academy_id", academyId)`) — every net for every academy is fetched into the browser regardless of
  caller role, and only filtered client-side per-academy at render time
  (`nets.filter(n => n.academyId === academy.id)`). Same unverified-RLS risk as `fetchAcademies()`.
- **Status:** IMPLEMENTED

---

## 3. Business Rules

1. **One owner per academy, always.** (ADMIN-002)
2. **Zero/blank fee inputs are "unset," not "$0."** (ADMIN-005)
3. **`academy_admin` scope is exactly one academy**, now sourced from **`app_metadata.academy_id`**
   (server-only) rather than `user_metadata.academy_id` — every route in this domain that accepts an
   `academyId` re-derives the caller's own academy id server-side and 403s on mismatch. (Section 0,
   ADMIN-008/009/024)
4. **`platform_admin` cannot self-promote or self-demote** through the admin-toggle endpoint. (ADMIN-018)
5. **The plan catalog is the single source of configurable pricing** — both B2B org licenses and, per
   ADMIN-015's inference, likely Player Pro/Coach Pro B2C pricing now that the standalone platform-pricing
   page is gone. Plan rows are live-referenced, not versioned: editing them changes behavior for every
   academy/user currently pointing at that row **except** the actual dollar amount Stripe already bills an
   active subscription (fixed at that subscription's own checkout/renewal time). (ADMIN-014, ADMIN-020)
6. **An academy's currency is derived from its country, never chosen independently**, and is locked once
   any of its coaches has a live Stripe Connect payout account, because Stripe Connect cannot move a
   connected account's country after creation. (ADMIN-022)
7. **CSV/manual player-add writes bypass the outer "Save Changes" gate** for data-loss-avoidance reasons.
   (ADMIN-003)
8. **A newly-published article notifies once, on the publish transition only.** (ADMIN-019)
9. **Seat-cap is advisory only** — nothing server-side rejects an over-cap roster. (ADMIN-012)
10. **Coaches may belong to more than one academy simultaneously.** (ADMIN-004)
11. **A locked (system) plan's `slug`/`audience`/`billingType` can never drift**, even from a malicious or
    buggy client payload — enforced both by disabling the inputs client-side and by the API route
    unconditionally overwriting those three fields from the DB's existing row whenever `locked: true`.
    (ADMIN-014)
12. **Welcome-email content is admin-editable but never blocks approval** — if the `email_templates` row
    for a role is ever missing, `approve-user` falls back to a hardcoded generic email rather than failing
    the approval or sending nothing. (ADMIN-023)

---

## 4. Key Workflows (Decision Logic)

### (a) `academy_admin` scoping — unchanged shape, new metadata source

```
User loads /academy
 └─ AcademyClient useEffect:
     coachId   = user.role === "coach" ? user.coachId : undefined       // from app_metadata.coach_id
     academyId = user.role === "academy_admin" ? user.academyId : undefined  // from app_metadata.academy_id
     Promise.all([
       fetchAcademies(),                  // ALWAYS unfiltered select("*") — ADMIN-GAP-001
       fetchPlayers(coachId, academyId),  // scoped server-side when academyId provided
       fetchCoaches(academyId),           // scoped server-side when academyId provided
       fetchActivePlans(),
       fetchNets(),                       // ALSO always unfiltered — see ADMIN-025
     ])
 └─ Render: `displayed` filtered client-side to the caller's own academy when role === academy_admin
```
The academy_admin/coach identity fields (`academyId`, `coachId`, `playerId`) now originate from
`app_metadata` (server-only) end-to-end — `useAuth()`'s underlying `supabaseUserToAuthUser()` reads
`sbUser.app_metadata` for every security-sensitive field and `sbUser.user_metadata` only for the
display-only `name`.

### (b) Academy self-serve billing checkout, now currency-resolved

| Step | Actor | Action |
|---|---|---|
| 1 | admin | Opens `/academies/{id}/billing`; server component fetches the academy row, 404s if absent |
| 2 | AcademyBillingClient | Loads `fetchActivePlans()`, filters `audience === "organization"`, hides `platformAdminOnly` unless viewer is `platform_admin` |
| 3 | User | Selects a plan card — card shows `resolvePlanPrice(p.priceAud, p.pricesByCurrency, academy.currency)` formatted via `formatMoney` |
| 4 | Client | POST `/api/stripe/create-academy-checkout-session` `{academyId, planId}` |
| 5 | Route | Re-auth via cookie → role check against `app_metadata` → 401/403 |
| 6 | Route | Validate academy exists (404), plan exists+active+org-audience (400) |
| 7 | Route | `resolvePlanPrice` again server-side (same function, so UI and charge can't disagree on amount/currency) |
| 8 | Route | Create/reuse Stripe Customer → Checkout Session, `price_data.currency` = resolved currency, `unit_amount` = resolved amount × 100 |
| 9 | Client | Redirect to `session.url` |
| 10 | Webhook | `checkout.session.completed` updates the academy row (customer/subscription ids, status, plan_id, computed `access_expires_at`) |

### (c) Platform admin granting/revoking another admin (metadata field changed, logic unchanged)

```
POST /api/platform-admins/toggle { userId, makeAdmin, fallbackRole? }
 ├─ userId missing OR makeAdmin not boolean                → 400
 ├─ makeAdmin === false AND fallbackRole not in
 │    {academy_admin, coach}                                → 400
 ├─ getCaller().role !== "platform_admin"  (from app_metadata) → 403
 ├─ caller.userId === userId (self-target)                   → 400
 └─ else: supabase.auth.admin.updateUserById(userId,
          { app_metadata: { role: makeAdmin ? "platform_admin" : fallbackRole } })   // CHANGED field
          → 200 { success: true }
```

### (d) Plan catalog edit propagation — retroactive or not? (updated for multi-currency)

| What changes on a `plans` row | Effect on already-subscribed academies | Effect on new subscriptions |
|---|---|---|
| `priceAud` | No change to Stripe's already-fixed price | New checkout uses the new AUD price |
| `pricesByCurrency[x]` (NEW) | No change to an already-billed non-AUD subscriber's Stripe price | New checkout in that currency uses the new override |
| `platformFeePercent` | Changes immediately (live lookup) | New plan-holders get the new % |
| `seatCap` | Changes immediately (seat-warning re-evaluates live) | New subscribers see new cap |
| `waivesSessionFees` | Changes immediately | Same |
| `accessDurationMonths` | Does not retroactively change an already-computed `access_expires_at` | New checkout computes from current value |
| `active: false` | No change to existing `subscription_status`/`plan_id` | No longer selectable |
| `locked` fields (slug/audience/billingType) on a locked plan | N/A — these can't be edited via the UI for a locked plan; API also blocks it | N/A |

### (e) Welcome-email send path (NEW)

```
approve-user POST
 └─ role determined (player/coach/academy_admin/parent)
 └─ plan info resolved (org plan via fetchAcademyPlanInfo, or individual tier via planFeatureLines)
 └─ SELECT email_templates WHERE id = role
     ├─ found  → subject/heading/body = renderTemplate(row.*, {name})
     └─ missing → hardcoded generic fallback (never blocks the approval)
 └─ nodemailer send via Gmail SMTP (buildWelcomeEmailHtml for the HTML part)
 └─ send failure is swallowed — approval itself always succeeds regardless of email outcome
```

---

## 5. Requirement-to-Code Traceability

| Req ID | Primary source file(s) | Key function(s)/route(s) |
|---|---|---|
| ADMIN-001 | `components/AcademyClient.tsx`, `lib/db.ts` | `handleSave`, `upsertAcademy` |
| ADMIN-002 | `components/AcademyClient.tsx` | `setOwner`, `toggleCoach` |
| ADMIN-003 | `components/AcademyClient.tsx`, `lib/db.ts` | `handleCsvImport`, `handleAddNewPlayer`, `insertPlayer(s)` |
| ADMIN-004 | `components/AcademyClient.tsx` | `toggleCoach`, `coachAcademyMap` |
| ADMIN-005 | `components/AcademyClient.tsx`, `lib/utils.ts`, `lib/currency.ts` | `handleSave`, `getPlatformFeePercent`, `formatMoney` |
| ADMIN-006 | `components/AcademyClient.tsx`, `lib/types.ts` | `draft.payoutModel` |
| ADMIN-007 | `components/AcademyClient.tsx`, `lib/db.ts` | `displayed` filter, `fetchAcademies` |
| ADMIN-008 | `components/AcademyBillingClient.tsx`, `app/api/stripe/create-academy-checkout-session/route.ts`, `lib/currency.ts` | `handleCheckout`, `POST`, `resolvePlanPrice` |
| ADMIN-009 | `components/AcademyBillingClient.tsx`, `app/api/stripe/create-academy-portal-session/route.ts` | `handleManageBilling`, `POST` |
| ADMIN-010 | `app/api/stripe/webhook/route.ts` | `checkout.session.completed`, subscription cases |
| ADMIN-011 | `components/InvoiceHistoryList.tsx` | fetch of `/api/stripe/invoices` |
| ADMIN-012 | `components/AcademyClient.tsx` | inline seat-cap check in Players section |
| ADMIN-013 | `components/PlatformKpisClient.tsx` | `needsAttention`, `planCounts`, `sortedAcademies` |
| ADMIN-014 | `components/PlansAdminClient.tsx`, `app/api/plans/update/route.ts` | `save`, `toggleActive`, `POST` |
| ADMIN-015 (REMOVED) | — | — (was `PlatformPricingClient.tsx`, `api/platform-settings/update/route.ts`) |
| ADMIN-016 | (spec doc only) | N/A |
| ADMIN-017 | `app/(dashboard)/admin/approvals/page.tsx` | `handleApproveClick`, `handleCreateAcademy`, `doApprove` |
| ADMIN-018 | `components/PlatformAdminsClient.tsx`, `app/api/platform-admins/{list,toggle}/route.ts` | `PromoteButton`/`DemoteButton`, `GET`, `POST` |
| ADMIN-019 | `components/AcademyContentAdminClient.tsx`, `lib/db.ts`, `app/api/notify-new-article/route.ts` | `handleSaveArticle`, `handleSaveTip`, `POST` |
| ADMIN-020 | `lib/utils.ts`, `lib/currency.ts`, `components/AcademyBillingClient.tsx`, `components/AcademyClient.tsx` | `getPlatformFeePercent`, `resolvePlanPrice`, `currentPlan` |
| ADMIN-021 | `lib/currency.ts` | `currencyForCountry`, `resolvePlanPrice`, `sumMoneyByCurrency`, `formatMoney` |
| ADMIN-022 | `lib/types.ts`, `lib/currency.ts`, `components/AcademyClient.tsx`, `lib/db.ts` | `academyCountryLocked`, `dbToAcademy` |
| ADMIN-023 | `components/EmailTemplatesAdminClient.tsx`, `app/api/email-templates/update/route.ts`, `lib/email-templates.ts`, `lib/db.ts` | `handleSave`, `POST`, `renderTemplate`, `fetchEmailTemplates` |
| ADMIN-024 | `components/AcademyBillingClient.tsx`, `app/api/send-plan-email/route.ts`, `lib/plan-email.ts` | `EmailPlanDetailsButton`, `POST`, `fetchAcademyPlanInfo` |
| ADMIN-025 | `components/AcademyClient.tsx`, `lib/db.ts` | `handleSaveNet`, `handleDeleteNet`, `fetchNets`/`upsertNet`/`deleteNet` |

---

## 6. Test Cases

| ID | Title | Preconditions | Steps | Expected Result | Priority |
|---|---|---|---|---|---|
| ADMIN-TC-001 | Save academy without a Head Coach is blocked | Modal open, no `headCoachId` | Fill name, click Save | "Academy Owner Required" modal shown; no write | High |
| ADMIN-TC-002 | Save academy without a name is blocked | Modal open, name blank | Click Save | Inline error; no write | High |
| ADMIN-TC-003 | Owner is auto-added to coachIds | New academy, ≥1 coach | Select a coach as owner | Owner id in `coachIds`; can't be toggled off | Medium |
| ADMIN-TC-004 | Zero-value age fee is not persisted | Age fee set then cleared to 0 | Save | `age_fees` excludes that age group | Low |
| ADMIN-TC-005 | CSV row with missing email is skipped | Valid CSV minus one row's email | Upload | Row `skipped`, excluded from import count | Medium |
| ADMIN-TC-006 | CSV import commits immediately, independent of outer Save | Editing existing academy | Import CSV, close modal without Save | Imported players persist on reload | High |
| ADMIN-TC-007 | academy_admin sees only their own academy | Two academies exist | Visit `/academy` as academy_admin | Only own academy row rendered | High |
| ADMIN-TC-008 | academy_admin cannot checkout for another academy | Logged in as academy_admin of ac1 | POST checkout-session `academyId: "ac2"` | 403 | High (security) |
| ADMIN-TC-009 | Checkout resolves the academy's currency, not always AUD | Academy currency = "usd", plan has a `pricesByCurrency.usd` override | POST checkout-session | Stripe session `price_data.currency === "usd"`, amount = the override, not `priceAud` | High |
| ADMIN-TC-010 | Checkout falls back to AUD when no override exists for the academy's currency | Academy currency = "gbp", plan has no `pricesByCurrency.gbp` | POST checkout-session | `price_data.currency === "aud"`, amount = `priceAud` | High |
| ADMIN-TC-011 | Portal session requires existing customer | `stripe_customer_id: null` | POST portal-session | 400 | Medium |
| ADMIN-TC-012 | Plan update accepts a $0 price | `priceAud: 0` | POST plans/update | 200 (CHANGED — was previously rejected as `<= 0`) | Medium |
| ADMIN-TC-013 | Plan update rejects an invalid currency-override key | `pricesByCurrency: { eur: 10 }` | POST plans/update | 400 "Invalid price override for currency \"eur\"." | Medium |
| ADMIN-TC-014 | Plan update rejects an AUD entry inside pricesByCurrency | `pricesByCurrency: { aud: 10 }` | POST plans/update | 400 | Low |
| ADMIN-TC-015 | Editing a locked plan cannot change its slug/audience/billingType | Plan row `locked: true` | POST plans/update with a different `slug` | 200, but the persisted `slug` is unchanged from the DB's existing value | High |
| ADMIN-TC-016 | Non-platform_admin cannot edit plan catalog | Caller role = academy_admin | POST plans/update | 403 | High (security) |
| ADMIN-TC-017 | Country dropdown is disabled once a coach has a Stripe Connect account | Editing an academy whose head coach has `stripeConnectAccountId` set | Open Edit modal | Country `<select>` is `disabled`; helper text explains why | Medium |
| ADMIN-TC-018 | Locked country cannot be changed even via a crafted draft value | Same precondition; a stale/injected `draft.country` differs from the real row | Click Save | Persisted `country` is the *existing* row's country, not the draft's | High (security-adjacent) |
| ADMIN-TC-019 | Currency displays follow the academy's own currency, not always AUD | Academy currency = "nzd" | View Pricing tab | Session fee, per-type fees, per-age fees all rendered via `formatMoney(x, "nzd")` | Medium |
| ADMIN-TC-020 | Email template save is scoped to a valid role only | `id: "invalid-role"` | POST email-templates/update | 400 "Invalid template data." | Medium |
| ADMIN-TC-021 | Non-platform_admin cannot edit email templates | Caller role = coach | POST email-templates/update | 403 | High (security) |
| ADMIN-TC-022 | Approval email uses the admin-edited template when present | `email_templates` row for role="coach" customized | Approve a pending coach request | Sent email's subject/heading/body reflect the custom template, `{{name}}` substituted | High |
| ADMIN-TC-023 | Approval email falls back to generic copy when the template row is missing | `email_templates` row for a role deleted/absent | Approve a pending request of that role | Approval still succeeds; email uses the hardcoded fallback subject/heading/body | Medium |
| ADMIN-TC-024 | Send-plan-email requires an assigned plan | Academy has no `plan_id` | POST send-plan-email | 400 "This academy has no plan assigned yet — nothing to send." | Medium |
| ADMIN-TC-025 | Send-plan-email reaches every academy_admin on the academy, not just the caller | Academy has 2 academy_admin accounts | platform_admin triggers send-plan-email | Both recipients receive the email; response `sent: 2` | Medium |
| ADMIN-TC-026 | Send-plan-email is best-effort per recipient | One of 2 recipients has an invalid address | POST send-plan-email | Response `sent: 1`, no 500; the other recipient still received it | Low |
| ADMIN-TC-027 | `/admin/pricing` route no longer resolves | — | Navigate to `/admin/pricing` | 404 (page removed) — confirms ADMIN-015 removal, not a redirect to a replacement | High |
| ADMIN-TC-028 | Platform admin cannot self-demote via toggle | `userId === caller.userId` | POST platform-admins/toggle `makeAdmin:false` | 400 | High (security) |
| ADMIN-TC-029 | KPI table always shows a plan's AUD reference price regardless of academy currency | An NZD-billed academy on a plan with a `pricesByCurrency.nzd` override | Visit `/admin/kpis` | Plan-distribution row shows `formatMoney(priceAud, "aud")`, not the NZD override | Low |
| ADMIN-TC-030 | Net CRUD is scoped to the correct academy in the UI despite an unfiltered fetch | Two academies each with nets | Open Academy A's Nets tab | Only Academy A's nets shown (client-side filter of the full unfiltered list) | Medium |
| ADMIN-TC-031 | Deleting a net does not affect bookings already made against it | A net has past bookings | Delete the net | Delete succeeds; booking history retains the net reference (not directly verified this session — REQUIRES_VALIDATION) | Low |

---

## 7. Test Case Tags

- **Layer:** `unit` (route-level Vitest), `component` (RTL), `e2e` (Playwright)
- **Type:** `functional`, `security`/`authz`, `validation`, `business-rule`, `regression`, `currency`
- **Priority:** `High`, `Medium`, `Low`
- **Domain:** `academy-crud`, `academy-roster`, `academy-billing`, `platform-kpis`, `plan-catalog`,
  `multi-currency`, `platform-admin-mgmt`, `approvals-ui`, `academy-content`, `email-templates`, `nets`

---

## 8. Existing Test Coverage vs Recommended

**Reminder (Section 0):** every result below that used `rawUser()` (`web/tests/mocks/caller.ts`) as its
caller-mocking mechanism is currently unreliable evidence — the helper still writes `user_metadata`, and
the routes it's used against now read `app_metadata`. Coverage is reported as it exists in the repo; do
not read "EXISTING_TEST" below as "currently passing."

| Requirement | Coverage | Evidence |
|---|---|---|
| ADMIN-001 Academy CRUD | EXISTING_TEST (component-mocked, weak) | `web/tests/components/AcademyClient.test.tsx` — likely mocks `useAuth()` directly rather than going through `rawUser()`/cookie auth (component tests don't hit the route-level auth check), so may be less affected by Section 0 than the API-route tests below — not independently re-verified line-by-line this session. |
| ADMIN-007 Academy scoping | EXISTING_TEST | `AcademyClient.test.tsx`; `web/tests/e2e/roles/academy_admin/academy.spec.ts` |
| ADMIN-008 Checkout session | EXISTING_TEST but likely broken by Section 0 for any positive-path (role=platform_admin/academy_admin) case | `web/tests/api/stripe/create-academy-checkout-session.test.ts` — real Stripe test-mode API, but the caller-role mock is almost certainly `rawUser()`-shaped |
| ADMIN-008 multi-currency resolution (NEW behavior) | Missing | No test found asserting `resolvePlanPrice`/currency-override behavior specifically for this route |
| ADMIN-009 Portal session | EXISTING_TEST (same Section-0 caveat) | `web/tests/api/stripe/create-academy-portal-session.test.ts` |
| ADMIN-013 KPIs | EXISTING_TEST (thin) | `web/tests/components/PlatformKpisClient.test.tsx` + e2e smoke |
| ADMIN-014 Plan catalog | EXISTING_TEST but confirmed using the stale `rawUser()` helper | `web/tests/api/plans/update.test.ts` (directly read this session — imports `rawUser` from `../../mocks/caller`, which is confirmed stale) + `web/tests/components/PlansAdminClient.test.tsx` |
| ADMIN-014 multi-currency fields (pricesByCurrency, sessionsPerMonthLimit, etc.) | Missing | No test asserting the new validation branches (`pricesByCurrency` currency-key check, `sessionsPerMonthLimit`/`chatMessagesPerDayLimit` non-negative check, `locked`-plan slug/audience/billingType override-on-write) was found |
| ADMIN-014 `priceAud >= 0` (CHANGED from `> 0`) | Missing | No test found asserting `priceAud: 0` is now accepted |
| ADMIN-015 (REMOVED) | Stale test file remains | `web/tests/components/PlatformPricingClient.test.tsx` imports a component that no longer exists in `web/components/`; `web/tests/api/platform-settings/update.test.ts` imports `@/app/api/platform-settings/update/route`, a path with no corresponding file — see ADMIN-GAP-012 |
| ADMIN-017 Approvals UI | Weak (unchanged from before) | e2e smoke only per the prior analysis; the academy-assignment dialog remains largely untested |
| ADMIN-018 Admin grant/revoke | EXISTING_TEST but confirmed asserting the wrong metadata field | `web/tests/api/platform-admins/toggle.test.ts` — directly read this session: asserts `updateUserById` called with `{ user_metadata: { role: ... } }`, but the route now calls it with `{ app_metadata: { role: ... } }` — this assertion will fail against current code. `web/tests/api/platform-admins/list.test.ts` mocks users with `user_metadata: { name, role, approved }`, but the route reads `app_metadata` for role/approved — every mocked user resolves to `role: "coach"` (the route's fallback) and `approved` always passes the filter, so list-grouping assertions are almost certainly wrong against current behavior too. |
| ADMIN-019 Academy content | Weak (unchanged) | e2e smoke only per the prior analysis |
| ADMIN-021 currency.ts (NEW) | Missing | No `web/tests/unit/lib/currency.test.ts` (or similarly named file) found — `resolvePlanPrice`, `currencyForCountry`, `sumMoneyByCurrency`, `formatMoney` are all untested at the unit level |
| ADMIN-022 Academy country/lock (NEW) | Missing | No test found for `academyCountryLocked` computation, the disabled-dropdown state, or the save-time "use existing row's country" guard |
| ADMIN-023 Email Templates admin (NEW) | **Missing entirely** | No `web/tests/components/EmailTemplatesAdminClient.test.tsx` and no `web/tests/api/email-templates/` directory exist at all — this brand-new subsystem (component + API route) has zero test coverage of any kind per the project's own stated convention (`AGENTS.md`: "New `components/*Client.tsx` → tests/components/<Name>.test.tsx"; "New `app/api/**/route.ts` → tests/api/<mirrored-path>.test.ts") |
| ADMIN-024 send-plan-email / plan-email.ts (NEW) | **Missing entirely** | No `web/tests/api/send-plan-email/` directory and no `web/tests/unit/lib/plan-email.test.ts` found |
| ADMIN-025 Nets management | Missing | No dedicated net-CRUD test found in `AcademyClient.test.tsx`'s visible surface (not exhaustively confirmed absent for every assertion in that file, but no net-specific test file exists) |

### RECOMMENDED_TEST list
1. **Fix the shared mock helper first, not the individual tests**: update `web/tests/mocks/caller.ts`
   `rawUser()` to build `{ id, app_metadata: metadata }` instead of `user_metadata` — this single change
   is the highest-leverage fix for this domain's (and likely the whole app's) route-test suite, per
   Section 0. (Explicitly not performed in this session — documentation-only, and modifying test files was
   out of scope.)
2. Route test: `create-academy-checkout-session` — assert the Stripe session's `price_data.currency`/
   `unit_amount` for (a) an academy currency with a configured override, (b) one without, locking in
   ADMIN-008's new multi-currency behavior as a regression guard.
3. Route test: `plans/update` — a locked plan's `slug`/`audience`/`billingType` cannot be changed by a
   crafted payload; a `priceAud: 0` submission succeeds; an invalid `pricesByCurrency` key/value is
   rejected with the specific error message.
4. Component + route test suite for `EmailTemplatesAdminClient`/`api/email-templates/update` — currently
   zero coverage for a subsystem that directly controls approval-email content sent to real users.
5. Route test for `send-plan-email` — multi-recipient fan-out, best-effort partial-failure behavior,
   the "no plan assigned" 400 path.
6. Unit tests for `lib/currency.ts` — `resolvePlanPrice`'s three branches (override exists / preferred is
   already aud / no override for a non-aud preferred), `currencyForCountry`'s fallback for an unknown code,
   `formatMoney`'s try/catch fallback path.
7. Component test: `AcademyClient` — the country-lock UI (disabled dropdown once a coach has
   `stripeConnectAccountId`) and the save-time "existing row wins over a stale draft country" guard.
8. E2E test confirming `/admin/pricing` returns a 404/not-found rather than silently 200-ing on stale
   cached routing — a direct regression guard for the removal itself.
9. Delete or repoint the two dead-reference test files (`PlatformPricingClient.test.tsx`,
   `platform-settings/update.test.ts`) — left as a documentation flag here (ADMIN-GAP-012) since modifying
   test files was out of scope for this audit.

---

## 9. Gaps and Ambiguities

**Section 9a — carried forward from the prior analysis, re-verified still present this session:**

| Gap ID | Area | Observed Behavior | Why It's Ambiguous/Risky | Suggested Requirement/Question |
|---|---|---|---|---|
| ADMIN-GAP-001 | Academy list scoping | `fetchAcademies()` still issues an unfiltered `select("*")` regardless of caller role; scoping is client-side only. | HIGH RISK if RLS isn't actually configured — an academy_admin's browser could receive every other academy's data over the wire. Unchanged and unverifiable from this repo. | Confirm RLS against the live Supabase project, or make `fetchAcademies()` accept/apply an `academyId` filter server-side the way `fetchPlayers`/`fetchCoaches` already do. |
| ADMIN-GAP-002 | Platform-only screens' read-path authorization | KPIs/Plan Catalog/Academy Content/Admins gate access with a client-side redirect only; underlying read functions (`fetchAllPlans`, `fetchAcademies`, `fetchAllArticlesForAdmin`, etc.) have no server-side role check — only *write* routes do. | Same inconsistency as before: write paths are properly gated server-side (now via `app_metadata`), reads still rely on unverified RLS. | Move admin-surface reads behind a service-role API route with an explicit role check, or formally document/test the relied-upon RLS policies. |
| ADMIN-GAP-003 | Inconsistent auth-check implementation across routes | `platform-admins/list+toggle` and `send-plan-email` use the shared `getCaller()`; `plans/update`, `email-templates/update`, `notify-new-article`, `create-academy-checkout-session`, `create-academy-portal-session`, `approve-user` each independently re-implement the identical inline `createServerClient` + `auth.getUser()` + `app_metadata?.role` check. | Duplicated security-critical logic across 6+ files is a maintenance risk — this session confirms the duplication survived the app_metadata migration (every copy was updated correctly, but independently, in this pass — a future fix could easily miss one). | Refactor onto `getCaller()` uniformly. |
| ADMIN-GAP-004 | Platform-admin demote leaves role/entity mismatch | `toggle` with `makeAdmin:false` sets `app_metadata.role` to the fallback only — never sets/clears `academy_id`/`coach_id`. Unchanged behavior, now on the new field. | A demoted platform_admin can land as an `academy_admin` with no `academy_id` — unable to do anything until separately assigned. | Restrict `fallbackRole` to the user's own last-known role/entity, or prompt for the matching scoped id at demote time. |
| ADMIN-GAP-005 | Seat-cap is advisory only | No API/DB constraint rejects an over-`seatCap` roster. | Ambiguous whether intentional (soft upsell nudge) or a real gap. | Confirm intent with product. |
| ADMIN-GAP-006 | Daily tip id collision | `` `tip-${publishDate}` `` derived id means two tips on the same date silently overwrite via upsert. | Not re-verified this session (file unchanged in scope) but no evidence of a fix; carried forward. | Decide one-tip-per-date as an enforced invariant, or stop deriving id from date. |
| ADMIN-GAP-007 | Quote-based B2B model entirely unbuilt | Per `PACE_HQ_B2B_Platform_Spec.md`; confirmed still unbuilt (no files in this session's scope touch it). | Open business question, not a code defect. | Product decision needed on whether/how to build it. |
| ADMIN-GAP-008 | Plan-edit blast radius has no confirmation or audit trail | Editing `platformFeePercent`/`seatCap`/`waivesSessionFees`/now `pricesByCurrency` changes live behavior for every current subscriber on that plan, no confirmation step or audit log. | A fat-fingered edit instantly affects every current subscriber with no undo. Now also covers currency-override edits (ADMIN-020). | Add a confirmation step showing affected-academy count; consider an audit/changelog table. |
| ADMIN-GAP-009 | notify-new-article email de-dupe is case-sensitive | Unchanged — recipients de-duplicated via `Set` on raw (non-lowercased) email. | Inconsistent with the CSV-import dedupe convention elsewhere in the same domain. | Lowercase before de-duplicating. |
| ADMIN-GAP-010 | Stale competitor-comparison doc claim | `PACE_HQ_Complete_Project_Documentation.md` rating Academy management "Partial (post-MVL gaps)" looks increasingly outdated given this session confirms an even larger surface (multi-currency, email templates, nets, locked-plan mechanics) than the already-substantial pre-merge feature set. | Not a code defect. | Treat that doc as stale for this domain. |

**Section 9b — NEW this session:**

| Gap ID | Area | Observed Behavior | Why It's Ambiguous/Risky | Suggested Requirement/Question |
|---|---|---|---|---|
| ADMIN-GAP-011 | Shared test-mock helper never migrated to app_metadata | `web/tests/mocks/caller.ts` `rawUser()` still constructs `{ id, user_metadata: metadata }`. Every route in this domain (and, per the sibling AUTH-domain finding, almost certainly across the whole app) that uses this helper to simulate a signed-in caller is testing against a metadata shape the real route code stopped reading. | This is the **single root cause** behind most of this domain's now-failing route tests — not 15 independent regressions. A wrong-status-code failure surfaces per-test, but the fix is one line in one shared file. | Update `rawUser()` to emit `app_metadata` (confirmed as the single highest-leverage fix — see RECOMMENDED_TEST #1). Left unfixed here since modifying test files was out of scope for this audit. |
| ADMIN-GAP-012 | Two test files reference code paths that no longer exist | `web/tests/components/PlatformPricingClient.test.tsx` imports `PlatformPricingClient` (deleted); `web/tests/api/platform-settings/update.test.ts` imports `@/app/api/platform-settings/update/route` (path renamed away, per Section 1). | These aren't "failing" in the assertion sense — they will fail to even **import**, likely erroring the whole test file rather than reporting a clean pass/fail per test. Confirms the task's framing that the old page/route's removal left orphaned test coverage rather than being cleanly migrated. | Delete both files, or repoint them at the genuine replacement surfaces (`PlansAdminClient`'s currency UI for the component test's intent, if any of its assertions are still meaningful; there is no direct replacement for a `platform-settings` route test since the new `email-templates/update` route is a different, narrower feature — see ADMIN-023). |
| ADMIN-GAP-013 | Brand-new subsystem (Email Templates) shipped with zero test coverage | No component test, no API route test exists for `EmailTemplatesAdminClient`/`api/email-templates/update` at all — not even a stale/broken one. | Directly violates this repo's own stated testing convention (`AGENTS.md`). This is a subsystem that directly controls the content of real transactional emails sent to real users on approval — an authorization or template-injection-shaped bug here has direct external impact and currently has no regression guard of any kind. | Add both test files per AGENTS.md convention (see RECOMMENDED_TEST #4). |
| ADMIN-GAP-014 | Brand-new plan-email resend route also shipped with zero test coverage | Same as GAP-013 for `api/send-plan-email/route.ts` and `lib/plan-email.ts`. | Same reasoning — multi-recipient fan-out and partial-failure logic (`sent` counter, best-effort per-recipient) is exactly the kind of logic that regresses silently without a test. | Add route + unit test coverage (RECOMMENDED_TEST #5). |
| ADMIN-GAP-015 | ADMIN-015's replacement is inferred, not confirmed | This session confirms the old platform-pricing page/component/route/type are gone and infers (from the Plan Catalog's `locked` system-plan mechanism and its own UI copy) that Player Pro/Coach Pro pricing is now edited via `/admin/plans` instead — but did not trace the actual player/coach individual-subscription Stripe checkout route(s) to confirm they read price from the `plans` table by slug rather than some other still-existing source. | If no route was ever updated to read Player Pro/Coach Pro pricing from the `plans` table, editing those "locked" plan rows in the UI might silently have **no effect** on what players are actually charged — a functionally broken admin control that looks like it works. | Trace the player-facing subscription checkout route(s) (outside this domain's assigned file list) to confirm they resolve price via `plans` lookup by slug (`player-pro`/`coach-pro`), not a separate/stale config source. |
| ADMIN-GAP-016 | `sessionFeeAud`/`session_fee_aud` naming now potentially misleading | The field is still literally named "Aud" throughout the type/schema/variable names, but is displayed (and, per the currency-derivation logic, presumably intended to be stored/interpreted) in the academy's own currency once `country` is non-AU. | Could be intentional legacy naming (harmless) or could indicate the value is only ever actually treated as AUD server-side somewhere this session didn't trace (e.g. a booking/payment route that reads `session_fee_aud` and assumes AUD regardless of academy currency) — REQUIRES_VALIDATION, see ADMIN-005. | Trace every consumer of `academies.session_fee_aud` outside this domain's files (booking/payment creation) to confirm they also currency-aware-interpret it via `academy.currency`, not assume AUD. |
| ADMIN-GAP-017 | Net management has no domain-scoped fetch, same pattern as ADMIN-GAP-001 | `fetchNets()` called with no `academyId` in `AcademyClient.tsx` despite the function supporting one. | Same unverified-RLS-dependent exposure as academies — every academy's net names/dimensions reach every viewer's browser. | Pass `academyId` when the caller is `academy_admin`, matching the `fetchPlayers`/`fetchCoaches` pattern already used elsewhere in the same component. |

---
