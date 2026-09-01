# Payments Core, Webhook, Cron & Coach-Chat — Reverse-Engineered Domain Spec

Repo: `c:\Development\Cricket\CricApp` (`web/` — Next.js 16 / React 19, Supabase, Stripe, Anthropic)
Scope: `web/app/api/stripe/webhook`, `web/app/api/cron/pack-reminders`, `web/app/api/cron/booking-reminders`, `web/app/api/cron/pack-auto-consume`, `web/app/api/cron/session-reminders`, `web/lib/cron-time.ts`, `web/app/api/coach-chat`, invoicing (`web/app/api/stripe/invoices*`, `web/lib/stripe-invoices.ts`, `web/lib/invoice-pdf.ts`), `web/lib/stripe.ts`, `web/lib/stripe-client.ts`, `web/lib/currency.ts`, `web/components/CoachChatWidget.tsx`, `web/components/InvoiceHistoryList.tsx`.

**This analysis was performed fresh against the current, post-merge source** (a 120-commit merge from `origin/master` landed the same day this was written), not carried over from the prior version of this document. Every file in scope was read in full for this pass. The prior version of this file is treated only as a diffing aid (Section 9), not as evidence of current behavior.

**Critical cross-cutting fact confirmed by re-reading the source:** the whole app's RBAC data (`role`, `approved`, `academy_id`, `coach_id`, `player_id`) has moved from Supabase `user_metadata` (client-writable) to `app_metadata` (server-only). Every route in this domain that authenticates a *session* (coach-chat, both invoice routes, `lib/server-auth.ts`) now reads `user.app_metadata?.*`, confirmed by direct inspection of `web/app/api/coach-chat/route.ts` and `web/lib/server-auth.ts`. The Stripe webhook and all cron jobs are **not** session-based (bearer-token or Stripe-signature authenticated with a service-role DB client) and are unaffected by this migration. The existing test fixture `web/tests/mocks/caller.ts` (`rawUser()`) still builds `{ id, user_metadata: metadata }` — this is now stale against the real code and will make every test using it (coach-chat, invoices, invoices-download) misresolve role/`playerId`/`coachId`/`academyId` as `undefined`, producing wrong-status-code failures. Treated as weak/historical evidence only per instructions, not re-asserted as passing or failing.

Status labels used below: IMPLEMENTED / PARTIALLY_IMPLEMENTED / INFERRED / UNKNOWN / NOT_IMPLEMENTED / CONFLICTING / REQUIRES_VALIDATION / REMOVED.

---

## 1. Domain Overview

This domain is the app's asynchronous, third-party-triggered backbone. It now has **five** scheduled/webhook mechanisms (previously two: webhook + one cron):

1. **Stripe webhook** (`web/app/api/stripe/webhook/route.ts`) — a single `POST` handler, signature-verified with `STRIPE_WEBHOOK_SECRET`, that is the *only* code path in the app that writes subscription/payment state (`players`, `academies`, `coaches`, `session_packs`, `bookings`) in response to what actually happened at Stripe. It dispatches on `event.type`, and within `checkout.session.completed` / `customer.subscription.updated` / `customer.subscription.deleted` further dispatches on a `metadata.type` discriminator. **New in this pass:** a seventh discriminator, `coach_subscription`, now exists across all three of those event types — a coach's own Coach Pro subscription is a wholly new self-serve purchase flow (`web/app/api/stripe/create-coach-checkout-session/route.ts`) that did not exist in the prior analysis.
2. **Daily payment-reminder cron** (`web/app/api/cron/pack-reminders/route.ts`) — the original cron; re-read in full this pass, logic unchanged from the prior analysis.
3. **Three brand-new scheduled cron jobs**, all added in this merge, all sharing the new `web/lib/cron-time.ts` Sydney-timezone helper and the same `CRON_SECRET` bearer-token pattern as the original cron:
   - `web/app/api/cron/booking-reminders/route.ts` — SMS/email reminder to a player (and, via the email template, mentions the coach) ~0–3 hours before a **1:1 paid booking** starts.
   - `web/app/api/cron/pack-auto-consume/route.ts` — once daily, automatically records attendance (as `"Absent"`, since no coach confirmed it) and draws down one session from a player's active session pack for any agreed recurring group-session day that nobody already marked attendance for.
   - `web/app/api/cron/session-reminders/route.ts` — SMS-only reminder to a player ~0–3 hours before their **recurring group session** starts.
4. **AI coach-chat** (`web/app/api/coach-chat/route.ts` + `web/components/CoachChatWidget.tsx`) — a streaming Anthropic Claude integration scoped by system prompt to cricket fast-bowling coaching, with a Free-plan daily message cap. **Changed this pass:** the cap is now sourced from the admin-editable Plan Catalog (`plans.chat_messages_per_day_limit`) rather than being purely hardcoded, and the caller's role/`player_id` now comes from `app_metadata`.
5. **Invoicing** (`web/app/api/stripe/invoices/route.ts`, `.../invoices/download/route.ts`, `lib/stripe-invoices.ts`, `lib/invoice-pdf.ts`, `components/InvoiceHistoryList.tsx`) — reads a payer's Stripe Customer history live from Stripe (no local invoice table). **Changed this pass:** `NormalizedInvoice.amountAud` was renamed to `NormalizedInvoice.amount` and the type is now genuinely currency-aware (`currency: string`, rendered via the new `formatMoney(amount, currency)` from `lib/currency.ts` rather than a fixed-AUD formatter). Session auth for both invoice routes now flows through `app_metadata` via `getCaller()`.

A sixth mechanism, `web/app/api/cron/referral-commissions/route.ts` (new `.github/workflows/referral-commissions.yml`, monthly), also landed in this merge but is **out of scope for this document** — it belongs to the MARKETPLACE domain per the task handoff. It is not analyzed here beyond noting its existence and that it follows the identical `CRON_SECRET` bearer pattern as the crons documented below.

Grouped together because none of these are simple synchronous user-initiated CRUD: they're secret/signature-authenticated, driven by a third party's callback (Stripe, GitHub Actions cron) or a third-party streaming API (Anthropic), and a defect in any of them either loses real money/entitlements silently, double-charges a session-pack credit, or (any cron) locks out / fails to notify a paying customer. This remains the **highest-risk domain in the app**, and it just tripled its cron surface area with **zero test coverage** on the new jobs (confirmed — see Section 7).

**Currency, specifically (task-flagged question):** the webhook route itself (`web/app/api/stripe/webhook/route.ts`) does **not** import `lib/currency.ts` and does not reference `currency` anywhere in its 220 lines — confirmed by a full read. None of its DB writes to `players`/`coaches`/`academies`/`session_packs`/`bookings` include a currency field. This is coherent with the rest of the system's design: every `create-*-checkout-session` route (pack, booking, assessment, library, academy, the generic player route, and the new coach route) is now currency-aware — each resolves a currency via `resolvePlanPrice`/`isSupportedCurrency` from `lib/currency.ts` before calling `stripe.checkout.sessions.create`, and Stripe's own `Subscription`/`Checkout.Session`/`Invoice` objects then carry that currency forward — but the webhook only ever *reads back* what Stripe already computed (subscription status, IDs, period dates); it never needs to re-derive or persist a currency value itself. Currency **does** flow into this domain downstream, in invoicing: `NormalizedInvoice.currency` is now a first-class field, used by `formatMoney()` in both the PDF (`lib/invoice-pdf.ts`) and the on-screen list (`InvoiceHistoryList.tsx`) — see PAY-037/038/039/040.

---

## 2. Implemented Requirements

### Webhook — infrastructure

**PAY-001 — Webhook signature verification gate**
- Category: Security / Auth
- Description: Every webhook POST reads the raw body and `stripe-signature` header, then verifies via `stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)` before any DB access.
- Component: `web/app/api/stripe/webhook/route.ts`, `POST`.
- Validation rules: no signature header, no `STRIPE_WEBHOOK_SECRET`, or a secret starting with `"REPLACE_ME"` → `500 {"error": "Webhook not configured — set STRIPE_WEBHOOK_SECRET."}`. Signature present but doesn't verify → `400 {"error": "Signature verification failed: <message>"}`.
- Status: IMPLEMENTED. Re-verified unchanged against current source. (Weak/historical) test evidence: `tests/api/stripe/webhook.test.ts`.

**PAY-002 — Webhook unrecognized event type acknowledgement**
- Description: The `switch (event.type)` has no `default` case; any event type not explicitly listed falls through doing nothing, and the handler still returns `200 {"received": true}`.
- Status: IMPLEMENTED. Unchanged.

### Webhook — `checkout.session.completed` sub-branches

**PAY-003 — checkout.session.completed / pack_payment — CHANGED**
- Description: When `session.metadata.type === "pack_payment"`, marks the referenced session pack as paid **and now also stamps a `paid_date`**.
- Source: `route.ts`, first branch inside `checkout.session.completed`.
- DB write (current): `session_packs.update({ payment_status: "Paid", paid_date: new Date(event.created * 1000).toISOString().slice(0, 10) }).eq("id", packId)`.
- **What changed:** the prior analysis (and, per its own in-code predecessor comment, the actual prior shipped behavior) only ever wrote `payment_status: "Paid"`. A code comment in the current source explains the reason for the fix directly: *"`paid_date` was previously only ever set by the manual 'Mark Paid' (cash/bank transfer) flow — a pack paid online never recorded one, so the 'Paid {date}' badge on the Packs page silently never showed for the majority of packs."* The date is derived from `event.created` (the Stripe event's own timestamp), not `new Date()` at handler-execution time — deliberately, so a delayed/retried webhook delivery still records the actual payment instant rather than whenever the retry happened to run.
- Validation: if `pack_id` is missing from metadata, no write occurs; `break` still fires.
- Status: IMPLEMENTED (feature fix). Test coverage: the existing test "checkout.session.completed / pack_payment marks the pack Paid" only asserts `payment_status`; it does not appear to assert `paid_date` was written (weak/stale — see Section 7) — REQUIRES_VALIDATION whether a test was updated for this new field.

**PAY-004 — checkout.session.completed / booking_payment**
- DB write: `bookings.update({ payment_status: "Paid" }).eq("id", bookingId)`.
- Status: IMPLEMENTED. Unchanged.

**PAY-005 — checkout.session.completed / assessment_payment**
- Logic: reads current `assessment_credits`, writes `(p?.assessment_credits ?? 0) + 1` — a **read-then-write, non-atomic increment**, no idempotency key.
- Status: IMPLEMENTED. Unchanged. Same non-idempotency risk as before (PAY-GAP-002).

**PAY-006 — checkout.session.completed / library_subscription**
- Logic: requires `session.subscription` to be a string; retrieves the live subscription; writes `library_stripe_subscription_id`/`library_subscription_status`.
- Status: IMPLEMENTED. Unchanged.

**PAY-007 — checkout.session.completed / academy_subscription**
- Logic: retrieves the live subscription; if `plan_id` has an `access_duration_months`, computes `accessExpiresAt`; writes `academies.update({ stripe_customer_id, stripe_subscription_id, subscription_status, plan_id, access_expires_at })`.
- Status: IMPLEMENTED. Unchanged.

**PAY-008 — checkout.session.completed / generic player subscription (fallback branch)**
- Reached when `session.metadata.type` is none of the six now-known discriminators (pack/booking/assessment/library/coach/academy). Handles individual Player Pro purchases (`create-checkout-session/route.ts`, whose metadata is `{ player_id, plan }` with no `type`).
- Logic unchanged: `playerId = session.metadata?.player_id ?? session.client_reference_id`; retrieves the subscription; writes `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `sub_plan`, `sub_start_date`/`sub_end_date`, and unconditionally `sub_sessions_limit: null`.
- Status: IMPLEMENTED. Unchanged, but its position in the fallthrough chain now sits *after* one more branch (`coach_subscription`) than before — behaviorally irrelevant since branches are mutually exclusive on `metadata.type`, but worth noting for anyone tracing the file top-to-bottom.

**PAY-043 — checkout.session.completed / coach_subscription — NEW**
- Category: Payments / Subscription lifecycle
- Description: Activates a coach's own Coach Pro subscription — a wholly new self-serve purchase flow for **independent (non-academy) coaches**, distinct from a player's Player Pro purchase (PAY-008) and from an academy's org-level plan (PAY-007).
- Component: `web/app/api/stripe/webhook/route.ts`, `checkout.session.completed` branch, discriminated by `session.metadata?.type === "coach_subscription"`.
- Logic: requires `session.metadata.coach_id` and `session.subscription` to be a string; retrieves the live subscription via `stripe.subscriptions.retrieve`; writes `coaches.update({ stripe_subscription_id: coachSub.id, subscription_status: coachSub.status, sub_plan: "Coach Pro" }).eq("id", subscribingCoachId)`. `sub_plan` is hardcoded to `"Coach Pro"` here (not read from subscription/session metadata like the player branch does) — there is exactly one paid coach tier, so no plan-name lookup is needed.
- Origin of the metadata: `web/app/api/stripe/create-coach-checkout-session/route.ts` — a new route, session-authenticated via `app_metadata` (`role === "coach" && ownCoachId === coachId`, or `platform_admin`), currency-aware via `resolvePlanPrice(planRow.price_aud, planRow.prices_by_currency, coach.currency)` against the `coach-pro` Plan Catalog row, `mode: "subscription"`, sets `metadata`/`subscription_data.metadata` in lockstep to `{ coach_id, type: "coach_subscription" }` (same convention as every other subscription type in this domain — BR-2).
- Status: IMPLEMENTED. No test found — `web/tests/api/stripe/webhook.test.ts` has no test with `coach_subscription` in its name or body (confirmed by grep of the whole file). **Genuine test gap** — see PAY-GAP-011.

**PAY-044 — customer.subscription.updated / coach_subscription — NEW**
- Description: Mirrors a coach's Coach Pro subscription status changes (renewal, `past_due`, etc.) from Stripe.
- Component: `route.ts`, `customer.subscription.updated`, discriminated by `subscription.metadata?.type === "coach_subscription"`.
- Logic: `isCoachActive = status === "active" || status === "trialing"`; writes `coaches.update({ subscription_status: subscription.status, ...(!isCoachActive ? { sub_plan: "Free" } : {}) }).eq("stripe_subscription_id", subscription.id)`. Note the asymmetry with the player-subscription branch (PAY-011): when active, `sub_plan` is **not** re-set here (it stays whatever it already is — `"Coach Pro"`, set once at PAY-043 time) — only the inactive path touches `sub_plan`, demoting it to `"Free"`.
- Status: IMPLEMENTED. No test found — genuine gap (PAY-GAP-011).

**PAY-045 — customer.subscription.deleted / coach_subscription — NEW**
- Description: Fully reverts a coach to the Free tier when their Coach Pro subscription is deleted at Stripe.
- Component: `route.ts`, `customer.subscription.deleted`, discriminated by `subscription.metadata?.type === "coach_subscription"`.
- DB write: `coaches.update({ sub_plan: "Free", subscription_status: "canceled", stripe_subscription_id: null }).eq("stripe_subscription_id", subscription.id)`.
- Status: IMPLEMENTED. No test found — genuine gap (PAY-GAP-011).

### Webhook — `customer.subscription.updated`

**PAY-009 — customer.subscription.updated / library**
- DB write: `players.update({ library_subscription_status: subscription.status }).eq("library_stripe_subscription_id", subscription.id)`.
- Status: IMPLEMENTED. Unchanged.

**PAY-010 — customer.subscription.updated / academy**
- DB write: `academies.update({ subscription_status: subscription.status }).eq("stripe_subscription_id", subscription.id)` — does not touch `access_expires_at`.
- Status: IMPLEMENTED. Unchanged.

**PAY-011 — customer.subscription.updated / generic player subscription (renewal/status-change)**
- Reached when subscription metadata carries none of `library_subscription`/`academy_subscription`/`coach_subscription`.
- Logic unchanged: `plan = subscription.metadata?.plan ?? null`; `isActive = status active|trialing`; always writes `subscription_status` + recomputed `sub_end_date`; if `plan && isActive` also sets `sub_plan`/`sub_sessions_limit: null`; if `!isActive` sets `sub_plan: "Free", sub_sessions_limit: await freeSessionsLimit(supabase)`.
- **Note (confirmed against current `lib/server-plans.ts`):** the Free-tier fallback limit is looked up live from `plans` (`sessions_per_month_limit` for the `free` slug), defaulting to `4` only if that row is missing — this was already true in `web/lib/server-plans.ts` and remains unchanged; the prior analysis's phrasing ("reverts to Free with the 4-session cap") is a simplification that still holds as the *default*, but the authoritative current behavior is "whatever `plans.sessions_per_month_limit` for the Free plan currently is, admin-editable."
- Status: IMPLEMENTED. Unchanged.

### Webhook — `customer.subscription.deleted`

**PAY-012 — customer.subscription.deleted / library**
- DB write: `players.update({ library_subscription_status: "canceled", library_stripe_subscription_id: null }).eq("library_stripe_subscription_id", subscription.id)`.
- Status: IMPLEMENTED. Unchanged. Still no dedicated test (confirmed by grep — only the generic-player and academy `.deleted` variants have named tests).

**PAY-013 — customer.subscription.deleted / academy**
- DB write clears `subscription_status`/`stripe_subscription_id`/`plan_id`/`access_expires_at`.
- Status: IMPLEMENTED. Unchanged.

**PAY-014 — customer.subscription.deleted / generic player subscription**
- DB write: `players.update({ sub_plan: "Free", subscription_status: "canceled", sub_sessions_limit: await freeSessionsLimit(supabase), stripe_subscription_id: null })`.
- Status: IMPLEMENTED. Unchanged (same live Free-limit lookup nuance as PAY-011).

### Webhook — other event types

**PAY-015 — account.updated (Stripe Connect onboarding)**
- Logic: `onboarded = !!account.charges_enabled && !!account.payouts_enabled`; writes `coaches.stripe_connect_onboarded`.
- Status: IMPLEMENTED. Unchanged.

**PAY-016 — invoice.payment_failed**
- Logic: `subscriptionId = invoice.parent?.subscription_details?.subscription` (string or expanded object, both handled); writes `players.update({ subscription_status: "past_due" }).eq("stripe_subscription_id", id)`.
- Scope gap, unchanged from before: only writes to `players`. No `coach_subscription`/`academy_subscription`/`library_subscription` branching exists for this event type — an academy, library, or (now) coach subscription's failed invoice payment gets no direct write here at all, still relying entirely on a later `customer.subscription.updated` event.
- Status: PARTIALLY_IMPLEMENTED (player-only; academy/library/coach not covered). Unchanged from prior analysis — confirmed the gap now also applies to the new coach subscription type (PAY-GAP-009, expanded).

### Cron — `pack-reminders` (original, re-verified)

**PAY-017 — Cron authentication (CRON_SECRET bearer token)**
- `CRON_SECRET` unset → `500`; `Authorization` header must equal exactly `Bearer ${cronSecret}` → else `401`.
- Status: IMPLEMENTED. Unchanged.

**PAY-018 — Cron email transport prerequisite**
- `GMAIL_USER`/`GMAIL_APP_PASSWORD` both required → else `500`.
- Status: IMPLEMENTED. Unchanged.

**PAY-019 — Cron candidate-pack query**
- `session_packs` where `status = "Active"` and `payment_status != "Paid"`.
- Status: IMPLEMENTED. Unchanged.

**PAY-020 — Cron 7-day-out reminder** — fires at `daysUntil === 7`, gated by `reminder_7d_sent_at`. IMPLEMENTED, unchanged.

**PAY-021 — Cron 2-day-out reminder** — fires at `daysUntil === 2`, gated by `reminder_2d_sent_at`. IMPLEMENTED, unchanged.

**PAY-022 — Cron due-today reminder + coach/academy CC and dual SMS** — fires at `daysUntil === 0`, gated by `reminder_due_sent_at`; emails player (CC notify target), independently SMS's player and notify target. IMPLEMENTED, unchanged.

**PAY-023 — resolveNotifyTarget helper** — coach → academy head coach → academy phone-only fallback chain. IMPLEMENTED, unchanged.

**PAY-024 — Cron overdue marking** — `daysUntil < 0 && payment_status === "Pending"` → `payment_status = "Overdue"`. IMPLEMENTED, unchanged.

**PAY-025 — Cron login-lock after grace period** — `daysToDue <= -PACK_PAYMENT_GRACE_DAYS (7)` and not already `Paid`/`login_disabled` → disables login, notifies player + notify target + `PLATFORM_ADMIN_EMAIL` by email, player + notify target by SMS. IMPLEMENTED, unchanged.

**PAY-026 — Cron: player with no email is skipped entirely** — `if (!player?.email) continue;` skips all reminder/overdue/lock logic for that pack. IMPLEMENTED, unchanged (still the same design choice/risk as before — PAY-GAP-004).

**PAY-027 — Cron response shape** — always `200 {"success": true, processed, results}`. IMPLEMENTED, unchanged.

### Cron — `booking-reminders` (NEW)

**PAY-046 — Booking-reminders cron authentication & schedule**
- Category: Security / Auth, Scheduling
- Component: `web/app/api/cron/booking-reminders/route.ts`.
- Logic: identical bearer-token pattern to PAY-017 — `CRON_SECRET` unset → `500`; wrong/missing `Authorization` header → `401`.
- Trigger: `.github/workflows/booking-reminders.yml` — `cron: '*/30 * * * *'` (every 30 minutes, production only) plus `workflow_dispatch`. Explicit workflow comment: the reminder condition inside the route is a 0–3 hour range and idempotency is enforced by a log table, so re-checking every 30 minutes is safe even under a delayed GitHub Actions run.
- Status: IMPLEMENTED. No test file exists (`web/tests/api/cron/` contains only `pack-reminders.test.ts` — confirmed by directory listing). **Gap** — PAY-GAP-012.

**PAY-047 — Booking-reminders candidate query & lead-window logic**
- Description: Reminds a player about a same-day, confirmed 1:1 coaching-session booking 0–3 hours before it starts.
- Logic: queries `bookings` where `status = "Confirmed"` and `date = todayIso` (today's date computed in `Australia/Sydney`, not server-local time, via `cron-time.ts`). For each booking, computes `start = sydneyLocalToInstant(todayIso, b.time, offsetMs)` and `hoursUntil = (start - now) / 3600000`; skips (`continue`) if `hoursUntil < 0` (already started/passed) or `> LEAD_HOURS` (`LEAD_HOURS = 3`).
- Business rule: only `"Confirmed"` bookings are reminded — `"Pending"`/other statuses never fire this reminder, regardless of date/time.
- Status: IMPLEMENTED.

**PAY-048 — Booking-reminders idempotency (booking_reminder_log)**
- Logic: before sending, checks `booking_reminder_log` for a row with deterministic id `brl_${b.id}`; if found, skips. On successful send, inserts `{ id: brl_${b.id}, booking_id: b.id }`.
- **Data-model gap:** the `booking_reminder_log` table is referenced by this route (`.from("booking_reminder_log")`) but does **not** appear anywhere in `web/tests/seed/schema-notes.md` or `web/tests/seed/seed.ts` (confirmed by grep — zero hits for `booking_reminder_log` in either file), even though `session_reminder_log` (used by PAY-056) *was* added to `schema-notes.md`. Per `web/AGENTS.md`'s own stated convention ("New `.from("some_table")` call anywhere → update `tests/seed/schema-notes.md` and `tests/seed/seed.ts` in the same PR"), this table's schema documentation was not kept in sync with the code that landed alongside it. UNKNOWN whether the table actually exists in the live Supabase project (the app code assumes it does) — flagged as PAY-GAP-013.
- Status: IMPLEMENTED (as coded), but its backing table's own schema documentation is missing — REQUIRES_VALIDATION against the live DB.

**PAY-049 — Booking-reminders notification content (SMS + email)**
- Logic: if `player.phone` present, SMS's `"reminder: your CRIC HQ session with {coach name or 'your coach'} is today at {time}."` via `sendSms` (best-effort, try/caught). If `player.email` AND `GMAIL_USER`/`GMAIL_APP_PASSWORD` are all present, dynamically imports `nodemailer` and `web/lib/email-templates.ts`'s `buildBookingEmailHtml` to send an HTML+text reminder email with Coach/Date/Time rows and a link to `${appUrl}/bookings`; email send itself is wrapped in `.catch(() => {})` (silently swallowed, no log). Both channels attempted regardless of whether the other succeeds; the whole per-booking block is additionally wrapped in an outer try/catch so a thrown error (e.g. the dynamic imports failing) skips writing the idempotency log row — the standard "best-effort, retry next tick" pattern used throughout this domain's crons.
- Note: unlike `session-reminders` (SMS-only, PAY-056), this cron reminds by **email as well as SMS** and does not require `player.phone` to exist at all — if a player has no phone, only the email path (if configured/available) fires; if a player has neither phone nor email, the booking is queried and looped over but nothing is sent and the idempotency row is still written on the (no-op) success path... **actually not quite**: re-reading the code, the log-row insert happens unconditionally after the try block regardless of whether either channel actually had a destination — REQUIRES_VALIDATION: confirm whether a player with neither `phone` nor `email` on file still gets `booking_reminder_log` stamped (silently "sending" nothing) on every cron tick until reactivated, since neither the SMS nor email calls would throw in that case (there's no `if (!player.phone && !player.email) continue` guard).
- Status: IMPLEMENTED. Behavior for a contactless player is REQUIRES_VALIDATION (see above) — no test exists to confirm either way.

### Cron — `pack-auto-consume` (NEW)

**PAY-050 — Pack-auto-consume cron authentication & schedule**
- Component: `web/app/api/cron/pack-auto-consume/route.ts`. Same `CRON_SECRET` bearer pattern as PAY-017/046.
- Trigger: `.github/workflows/pack-auto-consume.yml` — `cron: '0 13 * * *'` (13:00 UTC daily ≈ 11pm–midnight Sydney depending on DST), plus `workflow_dispatch`. Workflow comment: deliberately scheduled *late* in the Sydney day so any group session scheduled "today" has already happened by the time the job runs.
- Status: IMPLEMENTED. No test file exists — PAY-GAP-012.

**PAY-051 — Pack-auto-consume eligibility resolution**
- Description: For every `session_packs` row with `status = "Active"` whose `agreed_days` (a `text[]` of day tokens, e.g. `"Mon"`) includes today's Sydney day token, finds the *specific* recurring group session the player is rostered on.
- Logic: reads the player's `group_session_players` rows to get candidate `group_session_id`s, then narrows to the one `group_sessions` row matching `academy_id`, `session_type`, `day_of_week === todayDow`, and `active = true` (`.maybeSingle()` — assumes at most one match). If no roster rows or no matching group session, `continue`s (no action for that pack today).
- Business rule (explicit in-code comment): *"A pack's agreed days are a commitment, not an attendance record — the slot is booked and paid for whether or not the player actually turns up, or even gets added to that day's roster at all."* This is the philosophical basis for auto-consuming regardless of actual attendance.
- Status: IMPLEMENTED. Identical resolution logic to `session-reminders`' own (PAY-055) — the two routes independently re-implement the same roster/group-session matching query rather than sharing a helper function; a future change to one needs to be mirrored in the other by hand (INFERRED risk from direct code comparison, not stated in-code).

**PAY-052 — Pack-auto-consume occurrence creation & attendance idempotency**
- Logic: looks up (or creates, with deterministic id `gso_${group.id}_${todayIso}`) a `group_session_occurrences` row for today. Then checks `attendance_records` for an existing row keyed by `(occurrence_id, player_id)`; if one already exists — **whether recorded by a coach's own hand earlier that day, or by an earlier run of this same cron** — it `continue`s and does nothing further for that player.
- Idempotency mechanism reused deliberately from `lib/db.ts`'s own `saveAttendance()`: the attendance record id is the exact same deterministic format (`att_${occurrenceId}_${playerId}`) that the manual coach-attendance flow (`saveAttendance`, `web/lib/db.ts`) already uses — confirmed by direct comparison of both functions' id-construction logic. This means a coach marking real attendance *after* this cron already auto-marked "Absent" would go through `saveAttendance`'s own upsert-by-id path and overwrite the cron's row (same id) rather than creating a duplicate — and conversely, if the cron runs after a coach already marked attendance, the cron's `existingRecord` check finds the coach's row first and skips.
- Status: IMPLEMENTED.

**PAY-053 — Pack-auto-consume session draw-down / no-room handling**
- Business rule: only draws down (`sessions_used: pk.sessions_used + 1`) if `pk.sessions_used < pk.total_sessions` (`hasRoom`). The attendance record is written **either way** — `status: "Absent"`, `pack_id: hasRoom ? pk.id : null` — so a pack that's already fully used still gets an attendance record for the day (with no pack linkage and no session drawn down), rather than being skipped from the loop entirely.
- Result codes reported per player: `"consumed"` (drew down a session) vs. `"recorded_no_room"` (attendance written, no pack credit available).
- Status: IMPLEMENTED. **Business-rule note:** unlike the manual `saveAttendance` path (which lets a coach set `status: "Present"` or `"Absent"` and consumes the same slot either way, per its own in-code comment), this cron **always** writes `status: "Absent"` — there is no way for the cron to know if the player actually showed up, and it makes no attempt to reconcile with any other attendance-adjacent signal. A coach who forgets to mark attendance at all on a session day will have every one of their absent-that-day (from this cron's point of view) players auto-marked Absent and auto-charged a session credit late that night — REQUIRES_VALIDATION whether this is the intended product behavior (auto-draw-down as a "you booked it, you're charged" policy) versus a risk of over-charging players who *did* attend but whose coach simply hadn't logged it yet by the time this cron runs.

### Cron — `session-reminders` (NEW)

**PAY-054 — Session-reminders cron authentication & schedule**
- Component: `web/app/api/cron/session-reminders/route.ts`. Same `CRON_SECRET` bearer pattern.
- Trigger: `.github/workflows/session-reminders.yml` — `cron: '*/30 * * * *'`, plus `workflow_dispatch`. Same "safe to re-check frequently" rationale as booking-reminders.
- Status: IMPLEMENTED. No test file exists — PAY-GAP-012.

**PAY-055 — Session-reminders eligibility resolution + lead window**
- Description: Reminds a player about their upcoming **recurring group session** (not a 1:1 booking — that's PAY-047) 0–3 hours before it starts.
- Logic: same `agreed_days`-token / roster / group-session-matching resolution as PAY-051 (pack-auto-consume), independently re-implemented in this file too — three separate crons (`pack-auto-consume`, `session-reminders`) and, in spirit, `pack-reminders` all do their own version of "which active pack applies to this player today" without a shared helper. Once the specific `group_sessions` row is found (including its `time`/`location`/`name`), computes `hoursUntil` via `sydneyLocalToInstant` exactly as PAY-047 does, using the group session's own `time` field rather than a booking's.
- Status: IMPLEMENTED.

**PAY-056 — Session-reminders idempotency + SMS-only notification**
- Logic: checks `session_reminder_log` for an existing row keyed by `(player_id, group_session_id, session_date)`; if found, skips. `if (!player?.phone) continue` — **this cron is SMS-only**, there is no email fallback at all (unlike booking-reminders, PAY-049, which has both). On successful SMS send, inserts a `session_reminder_log` row with deterministic id `srl_${pk.player_id}_${group.id}_${todayIso}`.
- Message content: `"reminder: your {session_type} session is today at {time}, {location or 'check with your coach for the venue'}."`
- Status: IMPLEMENTED. `session_reminder_log` schema **is** documented in `tests/seed/schema-notes.md` (confirmed present, unlike `booking_reminder_log` — PAY-GAP-013), matching the columns the route selects/inserts (`id`, `player_id`, `group_session_id`, `session_date`, `sent_at`).

### Shared cron infrastructure

**PAY-057 — cron-time.ts Sydney-timezone helper — NEW**
- Category: Shared utility
- Component: `web/lib/cron-time.ts` (38 lines).
- Description: every academy on the platform is Australian and every session/booking time is entered by staff as a bare local-time string with no stored timezone, but the deployed server's own clock is not guaranteed to be Sydney time (explicit in-code comment: this exact bug class "already bit the payment-reminder cron's own testing once"). This module centralizes correct Sydney-local time math for all four reminder/consumption crons.
- Exports:
  - `ACADEMY_TZ = "Australia/Sydney"`, `DAY_TOKENS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]` (index-aligned with JS `Date.getUTCDay()`, `0 = Sunday`).
  - `sydneyNowParts(now: Date)` — formats `now` into Sydney-local date/time parts via `Intl.DateTimeFormat`, returning `{ dateIso, hour, minute, second }`.
  - `sydneyOffsetMs(now: Date)` — computes Sydney's *current* UTC offset in milliseconds by re-interpreting the Sydney-local wall-clock time as if it were UTC and diffing against the real instant; deliberately computed live (not hardcoded) because Sydney's offset varies AEST/AEDT across the year.
  - `sydneyLocalToInstant(dateIso, hhmm, offsetMs)` — converts a Sydney-local `"HH:mm"` on a given Sydney-local date into the real UTC instant, correctly accounting for DST on that specific date (by using the *pre-computed* offset for `now`, not a fresh recompute for the target date/time — REQUIRES_VALIDATION: since `offsetMs` is derived from `now` rather than from the target instant, this is subtly imprecise right around a DST transition boundary, though for a same-day 0–3-hour-ahead lookahead window this is very unlikely to ever cross a DST boundary in practice).
- Consumers: `booking-reminders` (PAY-047), `pack-auto-consume` (PAY-051, day-of-week only, not the instant-conversion functions), `session-reminders` (PAY-055). `pack-reminders` (the original cron, PAY-017–027) does **not** use this helper — it still does its own simple calendar-day (not instant/hour) math via a local `daysUntil()` function, since it only needs day-granularity, not hour-of-day precision.
- Status: IMPLEMENTED.

### Coach-Chat

**PAY-028 — Coach-chat authentication & role/context resolution — CHANGED (auth source)**
- Source: `web/app/api/coach-chat/route.ts`.
- Logic: requires a non-empty `messages` array whose last entry has `role: "user"` (else `400`); resolves caller via Supabase SSR cookie session (`authClient.auth.getUser()`, `401` if none); reads `role`/`playerId` off **`user.app_metadata`** (confirmed by direct read of current source: `const role = user.app_metadata?.role as string | undefined; const playerId = user.app_metadata?.player_id as string | undefined;`) — this is the one concrete line that changed from the prior `user_metadata` read the earlier analysis described. If role is `player`/`parent`: requires a linked `playerId` (`400` if absent), fetches the player row (`404` if not found).
- Status: IMPLEMENTED. The gating *behavior* (400/401/404 sequencing) is unchanged; the *data source* it reads is not. This is exactly the migration the sibling AUTH-domain analysis flagged — see the domain-overview note at the top of this document.

**PAY-029 — Coach-chat Free-plan daily message limit — CHANGED (now Plan-Catalog-driven)**
- Source: lines cross-referenced with `lib/plan-features.ts`'s `chatMessagesLimitForPlan(tier: PlanTier, plans: Plan[]): number | null`.
- **What changed:** the route now fetches the full active Plan Catalog (`sb.from("plans").select("*").eq("active", true)`, mapped via `dbToPlan`) on every request and passes it into `chatMessagesLimitForPlan(player.sub_plan, plans)` — a **two-argument** call. `chatMessagesLimitForPlan` itself: `const plan = findPlayerTierPlan(tier, plans); return plan ? plan.chatMessagesPerDayLimit : (tier === "Free" ? 3 : null);` — i.e. the daily cap is now an admin-editable field on the matching Plan Catalog row (`plans.chat_messages_per_day_limit`, mapped in `lib/db.ts`'s `dbToPlan`), and only falls back to the hardcoded `3`/`null` if no matching row exists in the catalog for that tier. This confirms the cross-domain signature change flagged in the task brief: the coach-chat call site *does* pass the second `plans` argument, consistent with `plan-features.ts`'s current two-arg signature.
- Remaining logic unchanged: day-rollover computed inline as `usedToday = player.chat_last_message_date === today ? player.chat_messages_used_today : 0`, where `today = new Date().toISOString().slice(0, 10)` — **note this is UTC-based**, not Sydney-local, even though the four cron jobs in this same domain now deliberately compute "today" in `Australia/Sydney` via `cron-time.ts` (PAY-057). This is an unreconciled inconsistency between the two subsystems — flagged as PAY-GAP-014. At-cap → `403 {"error": "...", limitReached: true}` before any Anthropic call; under-cap → increments `chat_messages_used_today`/stamps `chat_last_message_date` **before** the Anthropic call (same "counter consumed even if the generation later fails" risk as before).
- Status: IMPLEMENTED.

**PAY-030 — Coach-chat topic-scoped system prompt & player-context injection**
- `SYSTEM_PROMPT` still enumerates exactly 8 numbered topic areas (technique, report-metric explanation, drills, S&C, workload/injury-risk with "not a doctor" redirect, Academy article content, match-day/tactical, mental approach) — confirmed unchanged text on a full re-read. `contextBlurb` (player/parent only) still injects name/academy stage/latest ball speed/front knee angle/action type/injury risk.
- Enforcement remains prompt-level only — no server-side keyword filter, topic classifier, or output check.
- Status: IMPLEMENTED. Unchanged.

**PAY-031 — Coach-chat streaming response & mid-stream error handling**
- `anthropic.messages.stream({ model: "claude-opus-4-8", max_tokens: 1024, thinking: { type: "adaptive" }, output_config: { effort: "medium" }, ... })` — confirmed identical model/config to the prior analysis. Mid-stream throw → in-band bracketed error text appended to the same stream, response stays `200`. `ANTHROPIC_API_KEY` missing → `500` before streaming starts.
- Status: IMPLEMENTED. Unchanged.

**PAY-032 — CoachChatWidget client-side streaming consumption — CHANGED (disclaimer text no longer present)**
- Source: `web/components/CoachChatWidget.tsx` (confirmed 5 lines changed per the task brief; full file re-read this pass).
- Core send/stream-consumption logic unchanged: optimistic user-message append, POSTs the full running `messages` array, appends an empty assistant placeholder and progressively fills it from the `ReadableStream`, `!res.ok || !res.body` → parses `data.error` into a visible error banner.
- **What's different from the prior analysis's description:** the prior write-up described the widget as rendering "a persistent disclaimer ('AI-generated — it can make mistakes...')". A full read of the current file shows **no such text anywhere** — no string containing "mistake" or "AI-generated" appears in the component (confirmed by grep of the whole file, zero hits). The only static copy shown is the header subtitle "Cricket coaching & analysis only" and the three canned suggestion prompts. This is either a genuine removal in this merge or an inaccuracy in the prior analysis that can no longer be distinguished without git history (this repo has no `.git`, so no diff was possible) — treated as CONFLICTING with the prior analysis, current-source behavior (no disclaimer) is what's documented as authoritative per this task's instructions.
- `limitReached` (the 403 body flag from PAY-029) is still **not** read anywhere in this component (confirmed by grep — zero hits) — same dead-flag gap as before (PAY-GAP-005, unchanged).
- Status: IMPLEMENTED (core mechanism), with the disclaimer-copy discrepancy flagged above.

**PAY-033 — Coach-chat E2E real-API smoke test**
- Source: `web/tests/e2e/roles/player/coach-chat.spec.ts`. Deliberately hits the real Anthropic API. Not re-executed per task rules (no test runs performed); file's stated intent (smoke-only, real API) is unchanged from the prior analysis on inspection of its framing comment.
- Status: IMPLEMENTED (as a smoke test, by design).

### Invoicing

**PAY-034 — Invoice listing (GET /api/stripe/invoices) — CHANGED (auth source; added coach scope)**
- Source: `web/app/api/stripe/invoices/route.ts`.
- **What changed vs. the prior analysis:** the route now accepts **three** mutually-exclusive scopes — `playerId`, `academyId`, **and `coachId`** (new) — `provided !== 1` → `400`. The prior analysis only documented player/academy scopes; a coach-scoped invoice listing did not exist before (this is the natural counterpart to the new Coach Pro self-serve subscription, PAY-043). Coach-scope permission: `caller.role === "platform_admin" || (caller.role === "coach" && caller.coachId === coachId)`.
- Auth source: `getCaller()` (`web/lib/server-auth.ts`) — confirmed reads `user.app_metadata?.role/academy_id/coach_id/player_id`, not `user_metadata`.
- Player/academy-scope logic and empty-list-when-no-`stripe_customer_id` behavior otherwise unchanged.
- Status: IMPLEMENTED.

**PAY-035 — Invoice PDF download (GET /api/stripe/invoices/download)**
- Source: `web/app/api/stripe/invoices/download/route.ts`. Still only supports `playerId`/`academyId` scopes (no `coachId` download path was added alongside the new coach listing scope in PAY-034 — REQUIRES_VALIDATION whether that's an intentional gap or an oversight, since a coach can now *list* their own invoices via PAY-034 but has no route to download a PDF of one the way a player/academy can).
- Ownership check unchanged: `invoice.customerId !== expectedCustomerId` → `403`. Uncaught error → generic `404`.
- Status: IMPLEMENTED (for its two supported scopes). Missing coach-scope download — flagged as PAY-GAP-015.

**PAY-036 — getCaller / callerCanAccessPlayer ownership resolution — CHANGED (data source)**
- Source: `web/lib/server-auth.ts`.
- `getCaller()`: builds `{ userId, role, academyId, coachId, playerId }` from `user.app_metadata.role/academy_id/coach_id/player_id` — confirmed by direct read; this is the exact function whose data source moved from `user_metadata` to `app_metadata`.
- `callerCanAccessPlayer(supabase, caller, targetPlayerId)`: rule set unchanged — `platform_admin` always; `player`/`parent` only self; `coach` only if `players.coach_id === caller.coachId`; `academy_admin` only if `targetPlayerId` is in `academies.player_ids`; any other/missing role → `false`.
- Status: IMPLEMENTED. Used by both invoice routes.

**PAY-037 — Invoice normalization (Stripe Invoice objects) — CHANGED (field rename + currency)**
- Source: `web/lib/stripe-invoices.ts`, `normalizeStripeInvoice`.
- **Confirmed field rename:** `NormalizedInvoice.amountAud` → `NormalizedInvoice.amount` (direct read of the current interface: `amount: number; currency: string;` — no `amountAud` field exists anywhere in this file or type). `amount = (status === "paid" ? invoice.amount_paid : invoice.amount_due) / 100`, `currency = invoice.currency` (Stripe's own invoice currency, verbatim, not re-derived).
- `paymentType`/`description` derivation from subscription metadata unchanged in kind (academy/library/coach/Player-Pro/Coach-Pro detection via `subMeta.type`/`subMeta.plan`), status mapping unchanged (`paid|open|void|uncollectible`, else `unpaid`), invoice-number derivation unchanged (`invoice.number` else `PACE-<last10ofid>`).
- Status: IMPLEMENTED. **This confirms the task brief's flagged typecheck error is real and current**: `amountAud` no longer exists on this type; any code (including the stale test fixtures, see Section 7) still referencing `amountAud` is out of date against this file.

**PAY-038 — Invoice normalization (one-time Checkout Sessions) & combined history — CHANGED (currency default only)**
- Source: same file, `normalizeCheckoutSession`, `listAllInvoices`, `listAllCheckoutSessions`, `listInvoicesForCustomer`, `fetchSingleInvoice`.
- `normalizeCheckoutSession`: `amount = (session.amount_total ?? 0) / 100`, `currency = session.currency ?? "aud"` (falls back to the literal string `"aud"`, not `DEFAULT_CURRENCY` from `lib/currency.ts` — a minor inconsistency: this file does not import `lib/currency.ts` at all, so the fallback is a hand-typed literal rather than the shared constant. REQUIRES_VALIDATION whether this is meant to track `DEFAULT_CURRENCY` going forward or is coincidentally the same value today).
- Business rule (one Stripe Customer per payer, lifetime), pagination cap (5×100=500 records per list type), sort order (newest-first by ISO date string) all unchanged from the prior analysis.
- Status: IMPLEMENTED.

**PAY-039 — Invoice PDF generation (buildInvoicePdf) — CHANGED (currency-aware rendering)**
- Source: `web/lib/invoice-pdf.ts`. Uses `pdf-lib` to draw a single A4 page (unchanged layout: header, invoice number/date/status, "Billed To", one line-item, total, footer).
- **What changed:** the amount line now reads `formatMoney(invoice.amount, invoice.currency)` from `lib/currency.ts` (imported at the top of the file) instead of a hand-rolled `$${amount.toFixed(2)}`/fixed-AUD string. `formatMoney` uses `Intl.NumberFormat("en-AU", { style: "currency", currency: code.toUpperCase() })` for any of the 5 supported currencies (falls back to `DEFAULT_CURRENCY`/AUD if the invoice's currency isn't one of the 5 supported, via `isSupportedCurrency`), with a manual symbol-prefix fallback if `Intl` itself throws.
- `sanitizeForPdf` (WinAnsi-encoding character stripping for names/descriptions) unchanged.
- Status: IMPLEMENTED.

**PAY-040 — InvoiceHistoryList (client component) — CHANGED (currency-aware rendering)**
- Source: `web/components/InvoiceHistoryList.tsx`. Fetch/loading/error/empty-state logic, status-pill styling, and download-link construction all unchanged in shape.
- **What changed:** the amount cell now renders `formatMoney(inv.amount, inv.currency)` (imported from `lib/currency.ts`) instead of the old `amountAud`-keyed formatting — this is the client-side half of the PAY-037 rename, confirmed consistent (no lingering `amountAud` reference anywhere in this component).
- Status: IMPLEMENTED.

### Stripe client infrastructure

**PAY-041 — Lazy Stripe client Proxy (lib/stripe.ts)**
- `getStripe()` lazily constructs a memoized `Stripe` instance (`apiVersion: "2026-06-24.dahlia"`) on first property access via a `Proxy`. Re-exports `isPaidPlan`/`PaidPlan`.
- Status: IMPLEMENTED. Unchanged (confirmed by direct read — identical to before, including the exact API version string).

**PAY-042 — isPaidPlan (lib/stripe-client.ts)**
- `PAID_PLANS = ["Player Pro", "Coach Pro"] as const`; `isPaidPlan` is a pure type-narrowing membership check.
- Status: IMPLEMENTED. Unchanged. Note: this list still includes `"Coach Pro"`, and `create-checkout-session/route.ts` (the *player*-facing generic route) still calls `isPaidPlan(plan)` to validate its `plan` input — meaning that route's type guard still nominally accepts `"Coach Pro"` as a valid value for a *player* purchase even though coaches now have their own dedicated purchase route (PAY-043's origin). Whether the player-facing UI ever actually offers "Coach Pro" as a selectable plan for a player account is outside this file's scope to determine — flagged only as a code-level observation, not asserted as a bug.

---

## 3. Business Rules

- **BR-1 (Single source of truth):** The Stripe webhook is the *only* code path that writes `subscription_status`, `sub_plan`, `payment_status` (pack/booking), `assessment_credits`, `library_subscription_status`, academy subscription fields, coach subscription fields (now including the new `coach_subscription` branches), or `stripe_connect_onboarded`. Checkout-session-creation routes never write success state directly. Unchanged, now extended to cover coaches too.
- **BR-2 (Metadata discriminator convention):** Every non-generic Stripe object carries a `metadata.type` string, set in lockstep on both `session.metadata` and (for subscriptions) `subscription_data.metadata`. **Now seven** discriminators exist: `pack_payment`, `booking_payment`, `assessment_payment`, `library_subscription`, `academy_subscription`, `coach_subscription` (NEW), plus the type-less generic player-subscription fallback.
- **BR-3 (Free plan reversion):** Any player subscription leaving active/trialing reverts `sub_plan` to `"Free"` and `sub_sessions_limit` to the *live* Free-tier cap (`freeSessionsLimit()`, admin-editable via the Plan Catalog, default `4`). Unchanged in mechanism; restated here because the prior analysis phrased the cap as a hardcoded `4` — it was already a live lookup in `lib/server-plans.ts` prior to this pass, and remains so.
- **BR-3b (Free coach plan reversion) — NEW:** A coach's Coach Pro subscription leaving active/trialing (via `.updated`) or being deleted (via `.deleted`) reverts `coaches.sub_plan` to `"Free"`.
- **BR-4 (Free plan Coach-AI cap) — CHANGED:** Free-tier players get a daily Coach AI message cap now sourced from the Plan Catalog (`plans.chat_messages_per_day_limit` for the matching tier row), falling back to a hardcoded `3` only if no matching Plan Catalog row exists; paid tiers (row-driven, or `null` fallback) are unlimited. Day-rollover is computed against **UTC**, not the Sydney-local day the cron jobs use (PAY-GAP-014). Non-player/parent roles are never capped.
- **BR-5 (Session-pack payment grace period):** Unchanged — 7 days overdue (`PACK_PAYMENT_GRACE_DAYS`) with `payment_status !== "Paid"` disables login; reactivation is a manual staff action.
- **BR-6 (Cron notification target ≠ payout target):** Unchanged — the player's actual assigned coach (falling back through academy head coach, then academy phone) is notified about payment issues, deliberately not the Stripe Connect payout-destination coach.
- **BR-7 (One Stripe Customer per payer, lifetime):** Unchanged, and now explicitly applies to coaches too (a coach's own `stripe_customer_id` is created/reused in `create-coach-checkout-session/route.ts` the same way a player's/academy's is elsewhere).
- **BR-8 (Board-tier academy access window):** Unchanged.
- **BR-9 (Coach-chat scope):** Unchanged — 8 enumerated topic areas, prompt-level enforcement only.
- **BR-10 (Session-pack commitment, not attendance) — NEW:** An active session pack's `agreed_days` represent a booked-and-paid-for commitment, not a record of actual attendance. `pack-auto-consume` (PAY-051–053) enforces this by drawing down a session and recording `"Absent"` attendance for every agreed day nobody already recorded attendance for, regardless of whether the player showed up or was ever even added to that day's roster.
- **BR-11 (Sydney-local time for all reminder/consumption crons) — NEW:** `booking-reminders`, `pack-auto-consume`, and `session-reminders` all compute "today" and "hours until start" in `Australia/Sydney` explicitly via `cron-time.ts`, independent of the deployed server process's own timezone. `pack-reminders` (the original cron) does not use this helper and works at calendar-day granularity only, not hour-of-day.
- **BR-12 (Currency now flows through checkout → Stripe → invoicing) — NEW:** Every `create-*-checkout-session` route (six pre-existing, plus the new coach one) resolves a currency via `lib/currency.ts` before creating the Stripe object; the webhook itself remains currency-agnostic (it never needs to write a currency value); invoicing surfaces whatever currency Stripe's own objects report, rendered via the shared `formatMoney()`.
- **BR-13 (RBAC data lives in `app_metadata`, not `user_metadata`) — CHANGED (platform-wide, restated for this domain):** Every session-authenticated route in this domain (`coach-chat`, both invoice routes via `getCaller()`) now reads role/scope identifiers exclusively from `user.app_metadata`. The webhook and every cron are bearer/signature-authenticated and use a service-role DB client — they never touch Supabase Auth user objects at all, so this migration has zero effect on them.

---

## 4. Key Workflows (Decision Logic)

### 4.1 Webhook dispatch — full decision trace (current source)

```
POST /api/stripe/webhook
 → read rawBody (text), stripe-signature header, STRIPE_WEBHOOK_SECRET
 → IF no signature OR no secret OR secret starts "REPLACE_ME": 500 "not configured" (no DB access)
 → ELSE stripe.webhooks.constructEvent(rawBody, signature, secret)
      → throws: 400 "Signature verification failed: <msg>" (no DB access)
      → succeeds: event: Stripe.Event
 → build service-role Supabase client (bypasses RLS)
 → switch (event.type):
      checkout.session.completed
        → metadata.type == pack_payment        → session_packs: payment_status=Paid, paid_date=event.created  [PAY-003, CHANGED]
        → metadata.type == booking_payment     → bookings.payment_status = "Paid"                              [PAY-004]
        → metadata.type == assessment_payment  → players.assessment_credits += 1 (read-then-write)             [PAY-005]
        → metadata.type == library_subscription → retrieve sub → players.library_* fields                     [PAY-006]
        → metadata.type == coach_subscription  → retrieve sub → coaches.{sub_id,status,sub_plan="Coach Pro"}  [PAY-043, NEW]
        → metadata.type == academy_subscription → retrieve sub (+ plan lookup) → academies.* fields            [PAY-007]
        → (none of the above) → retrieve sub → players.stripe_*/subscription_status/sub_plan/sub_start_end     [PAY-008]
      customer.subscription.updated
        → metadata.type == library_subscription → players.library_subscription_status (by sub id)              [PAY-009]
        → metadata.type == academy_subscription → academies.subscription_status (by sub id)                    [PAY-010]
        → metadata.type == coach_subscription   → coaches.status (+ sub_plan="Free" if inactive) (by sub id)   [PAY-044, NEW]
        → (else) → players.subscription_status/sub_end_date + (active?plan:Free+live-cap) (by sub id)          [PAY-011]
      customer.subscription.deleted
        → metadata.type == library_subscription → players.library_* → canceled/null                            [PAY-012]
        → metadata.type == academy_subscription → academies.* → canceled/null/null/null                        [PAY-013]
        → metadata.type == coach_subscription   → coaches.* → Free/canceled/null                               [PAY-045, NEW]
        → (else) → players.* → Free/canceled/live-cap/null                                                     [PAY-014]
      account.updated → coaches.stripe_connect_onboarded = charges_enabled && payouts_enabled                   [PAY-015]
      invoice.payment_failed → players.subscription_status = "past_due" (by subscription id; players only)      [PAY-016]
      (any other type) → no-op
 → return 200 {"received": true}   [always]
```

- No try/catch around any individual event-type branch (unchanged) — an uncaught exception inside the `switch` (e.g. an empty `subscription.items.data` array, a failed Stripe retrieve) propagates as an unhandled route error; Next.js's default 500 behavior is INFERRED, not directly observed.
- Response-code contract unchanged: every reachable path returns `500` (misconfiguration), `400` (bad signature), or `200` (everything else, including no-ops).

### 4.2 Cron pack-reminders — decision trace

Unchanged from the prior analysis — re-verified against current source, logic identical. See PAY-017 through PAY-027 above for the itemized branches; the full trace is: auth → Gmail-config check → query unpaid Active packs → per pack: skip if no player email → 7-day/2-day/due-today reminder branches (each gated by its own `reminder_*_sent_at` flag) → separate overdue-mark check (`daysToDue<0 && Pending`) → separate, unconditional grace-period login-lock check (`daysToDue <= -7`) → `200` summary.

### 4.3 Cron booking-reminders — decision trace (NEW)

```
POST /api/cron/booking-reminders
 → CRON_SECRET unset → 500; wrong/missing bearer → 401
 → now = current instant; offsetMs = sydneyOffsetMs(now); todayIso = sydneyNowParts(now).dateIso
 → query bookings WHERE status="Confirmed" AND date=todayIso
 → query error → 500
 → for each booking:
     → start = sydneyLocalToInstant(todayIso, b.time, offsetMs); hoursUntil = (start-now)/3600000
     → hoursUntil<0 OR hoursUntil>3 → continue (too early or already started)
     → already in booking_reminder_log (id brl_<bookingId>) → continue
     → fetch player; no player → continue
     → try:
         → player.phone → sendSms(...) [independent, not gated on email]
         → player.email AND Gmail configured → dynamic-import nodemailer + email-templates, send HTML+text reminder [errors swallowed via .catch]
         → insert booking_reminder_log row
         → results += {bookingId, action: "reminder_sent"}
     → catch → best-effort, will retry next tick (log row not written)
 → return 200 {success:true, processed:<n>, results}
```

### 4.4 Cron pack-auto-consume — decision trace (NEW)

```
POST /api/cron/pack-auto-consume
 → CRON_SECRET unset → 500; wrong/missing bearer → 401
 → todayIso = sydneyNowParts(now).dateIso; todayDow = UTC-day-of-date(todayIso); todayToken = DAY_TOKENS[todayDow]
 → query session_packs WHERE status="Active"
 → for each pack:
     → todayToken not in pack.agreed_days → continue
     → resolve rostered group_session_players → candidate group_session_ids
     → no candidates → continue
     → find matching group_sessions row (academy_id, session_type, day_of_week=todayDow, active=true) → none → continue
     → find or create today's group_session_occurrences row (id gso_<groupId>_<todayIso>)
       → create fails → continue (best-effort, retry next run)
     → existing attendance_records row for (occurrence, player) → continue (already handled, by coach or a prior run)
     → hasRoom = sessions_used < total_sessions
     → hasRoom → session_packs.sessions_used += 1
     → upsert attendance_records: status="Absent", pack_id = hasRoom ? pack.id : null (id att_<occ>_<player>)
       → upsert fails → continue
     → results += {playerId, groupSessionId, action: hasRoom ? "consumed" : "recorded_no_room"}
 → return 200 {success:true, processed:<n>, results}
```

### 4.5 Cron session-reminders — decision trace (NEW)

```
POST /api/cron/session-reminders
 → CRON_SECRET unset → 500; wrong/missing bearer → 401
 → todayIso, todayDow, todayToken as above
 → query session_packs WHERE status="Active"
 → for each pack:
     → todayToken not in agreed_days → continue
     → resolve rostered group_session_players → candidate group_session_ids
     → no candidates → continue
     → find matching group_sessions row (academy_id, session_type, day_of_week, active=true) incl. time/location/name → none → continue
     → hoursUntil = (sydneyLocalToInstant(todayIso, group.time, offsetMs) - now)/3600000
     → hoursUntil<0 OR >3 → continue
     → already in session_reminder_log (player_id, group_session_id, session_date) → continue
     → player has no phone → continue  [SMS-only, no email fallback]
     → try: sendSms(...) → insert session_reminder_log row → results += {playerId, groupSessionId, "reminder_sent"}
     → catch → best-effort, retry next tick
 → return 200 {success:true, processed:<n>, results}
```

### 4.6 Coach-chat message send — decision trace

```
POST /api/coach-chat  { messages: [...] }
 → messages empty OR last.role != "user" → 400
 → getUser() via cookie session → no user → 401
 → role/playerId from user.app_metadata   [CHANGED — was user_metadata]
 → IF role in {player, parent}:
     → no playerId → 400
     → fetch players row by playerId → not found → 404
     → fetch active Plan Catalog rows → limit = chatMessagesLimitForPlan(sub_plan, plans)   [CHANGED — now 2-arg, Plan-Catalog-driven]
     → IF limit != null:
         → usedToday = (chat_last_message_date==today[UTC]) ? chat_messages_used_today : 0
         → usedToday >= limit → 403 {error, limitReached:true}   [no Anthropic call made]
         → else → players.update(chat_messages_used_today: usedToday+1, chat_last_message_date: today)
     → build contextBlurb from player's name/stage/latest biomech fields
 → (role not player/parent) → no limit check, no contextBlurb, straight through
 → ANTHROPIC_API_KEY unset → 500
 → construct ReadableStream over anthropic.messages.stream(...) → enqueue text_delta chunks
 → on throw at any point → enqueue "\n\n[Coach AI hit an error: <msg>]" into the SAME stream, then close
 → return 200, Content-Type: text/plain, streamed body
```

### 4.7 Invoice PDF download — decision trace

Unchanged from the prior analysis in shape; auth now flows through `getCaller()` reading `app_metadata`:

```
GET /api/stripe/invoices/download?playerId|academyId&kind&stripeId
 → exactly one of playerId/academyId required → else 400
 → kind must be stripe_invoice|checkout_session → else 400
 → stripeId required → else 400
 → getCaller() [app_metadata-based] → not signed in → 401
 → permission check → fail → 403
 → resolve payer's stripe_customer_id → none → 404
 → try: fetchSingleInvoice → ownership check (customerId match) → fail → 403
        → buildInvoicePdf(invoice, billedTo) [now currency-aware via formatMoney] → 200 PDF
 → catch (any thrown error) → 404 "Invoice not found."
```

### 4.8 Decision table — Stripe event type → discriminator → DB writes → user-visible effect

| Event type | Metadata discriminator | Table(s) written | User-visible state change |
|---|---|---|---|
| `checkout.session.completed` | `type=pack_payment` | `session_packs` | Pack shows Paid **and now shows a Paid-date** (CHANGED) |
| `checkout.session.completed` | `type=booking_payment` | `bookings` | Booking shows Paid |
| `checkout.session.completed` | `type=assessment_payment` | `players` | `assessment_credits` +1 |
| `checkout.session.completed` | `type=library_subscription` | `players` | Library access status set from live Stripe status |
| `checkout.session.completed` | `type=coach_subscription` **(NEW)** | `coaches` | Coach gets `sub_plan="Coach Pro"`, subscription id/status set |
| `checkout.session.completed` | `type=academy_subscription` | `academies` | Academy subscription active, plan assigned, optional access-expiry window |
| `checkout.session.completed` | *(none)* | `players` | Player upgraded to paid plan, unlimited sessions |
| `customer.subscription.updated` | `type=library_subscription` | `players` | Library status mirrors Stripe |
| `customer.subscription.updated` | `type=coach_subscription` **(NEW)** | `coaches` | Coach status mirrors Stripe; demoted to Free if inactive |
| `customer.subscription.updated` | `type=academy_subscription` | `academies` | Academy status mirrors Stripe |
| `customer.subscription.updated` | *(none)* | `players` | Player plan/end-date renewed if active; demoted to Free+live-cap if not |
| `customer.subscription.deleted` | `type=library_subscription` | `players` | Library access revoked |
| `customer.subscription.deleted` | `type=coach_subscription` **(NEW)** | `coaches` | Coach fully reverted to Free |
| `customer.subscription.deleted` | `type=academy_subscription` | `academies` | Academy subscription fully cleared |
| `customer.subscription.deleted` | *(none)* | `players` | Player reverted to Free, live-cap, sub id cleared |
| `account.updated` | n/a | `coaches` | Marketplace payout eligibility flag flips |
| `invoice.payment_failed` | n/a | `players` only | Player flagged `past_due` (academy/library/**coach**, still not covered) |
| *(any other type)* | n/a | none | No visible change; 200 acknowledged |

---

## 5. Requirement-to-Code Traceability

| Requirement | File | Function/Region |
|---|---|---|
| PAY-001, PAY-002 | `web/app/api/stripe/webhook/route.ts` | top of `POST`, switch fallthrough |
| PAY-003–PAY-008 | `web/app/api/stripe/webhook/route.ts` | `case "checkout.session.completed"` |
| PAY-043 | `web/app/api/stripe/webhook/route.ts` + `web/app/api/stripe/create-coach-checkout-session/route.ts` | `checkout.session.completed` / `coach_subscription` branch + its metadata origin |
| PAY-009–PAY-011 | `web/app/api/stripe/webhook/route.ts` | `case "customer.subscription.updated"` |
| PAY-044 | `web/app/api/stripe/webhook/route.ts` | `customer.subscription.updated` / `coach_subscription` branch |
| PAY-012–PAY-014 | `web/app/api/stripe/webhook/route.ts` | `case "customer.subscription.deleted"` |
| PAY-045 | `web/app/api/stripe/webhook/route.ts` | `customer.subscription.deleted` / `coach_subscription` branch |
| PAY-015 | `web/app/api/stripe/webhook/route.ts` + `web/app/api/stripe/connect/onboard/route.ts` | `case "account.updated"` |
| PAY-016 | `web/app/api/stripe/webhook/route.ts` | `case "invoice.payment_failed"` |
| PAY-017–PAY-027 | `web/app/api/cron/pack-reminders/route.ts` | whole file |
| PAY-046–PAY-049 | `web/app/api/cron/booking-reminders/route.ts` | whole file |
| PAY-050–PAY-053 | `web/app/api/cron/pack-auto-consume/route.ts` | whole file |
| PAY-054–PAY-056 | `web/app/api/cron/session-reminders/route.ts` | whole file |
| PAY-057 | `web/lib/cron-time.ts` | whole file |
| PAY-028, PAY-029 | `web/app/api/coach-chat/route.ts` | `POST`; `lib/plan-features.ts`'s `chatMessagesLimitForPlan`; `lib/db.ts`'s `dbToPlan` |
| PAY-030 | `web/app/api/coach-chat/route.ts` | `SYSTEM_PROMPT`, `contextBlurb` |
| PAY-031 | `web/app/api/coach-chat/route.ts` | streaming block |
| PAY-032 | `web/components/CoachChatWidget.tsx` | `send()`, render |
| PAY-033 | `web/tests/e2e/roles/player/coach-chat.spec.ts` | whole file |
| PAY-034 | `web/app/api/stripe/invoices/route.ts` | `GET` |
| PAY-035 | `web/app/api/stripe/invoices/download/route.ts` | `GET` |
| PAY-036 | `web/lib/server-auth.ts` | `getCaller`, `callerCanAccessPlayer` |
| PAY-037, PAY-038 | `web/lib/stripe-invoices.ts` | `normalizeStripeInvoice`, `normalizeCheckoutSession`, list/fetch helpers |
| PAY-039 | `web/lib/invoice-pdf.ts` | `buildInvoicePdf`, `sanitizeForPdf` |
| PAY-040 | `web/components/InvoiceHistoryList.tsx` | whole component |
| PAY-041 | `web/lib/stripe.ts` | `getStripe`, `stripe` Proxy |
| PAY-042 | `web/lib/stripe-client.ts` | `isPaidPlan` |
| Currency plumbing | `web/lib/currency.ts` | `resolvePlanPrice`, `isSupportedCurrency`, `formatMoney`, `sumMoneyByCurrency` |
| Metadata origin for PAY-003–008 | `create-pack-checkout-session`, `create-booking-checkout-session`, `create-assessment-checkout-session`, `create-library-checkout-session`, `create-academy-checkout-session`, `create-checkout-session` (all under `web/app/api/stripe/`) | each route's `metadata`/`subscription_data.metadata` |
| BR-4 limits | `web/lib/plan-features.ts` | `chatMessagesLimitForPlan`, `sessionsLimitForPlan` |
| BR-3/14 live Free-cap lookup | `web/lib/server-plans.ts` | `freeSessionsLimit` |
| Schema for all DB writes above | `web/tests/seed/schema-notes.md` | `players`, `academies`, `coaches`, `session_packs`, `bookings`, `plans`, `group_sessions`, `group_session_players`, `group_session_occurrences`, `attendance_records`, `session_reminder_log` tables — **`booking_reminder_log` is used by code but absent from this file (PAY-GAP-013)** |

---

## 6. Test Cases

Standard columns: ID | Title | Preconditions | Steps | Expected Result | Priority | Type.

| ID | Title | Preconditions | Steps | Expected Result | Priority | Type |
|---|---|---|---|---|---|---|
| PAY-TC-001 | Webhook 500 when secret unset | `STRIPE_WEBHOOK_SECRET=""` | POST signed request | 500 | High | Negative |
| PAY-TC-002 | Webhook 500 when secret is placeholder | secret = `"REPLACE_ME..."` | POST | 500 | High | Negative |
| PAY-TC-003 | Webhook 400 on invalid signature | valid secret | POST with bogus `stripe-signature` | 400, no DB writes | Critical | Negative/Security |
| PAY-TC-005 | pack_payment happy path (incl. paid_date) | pack exists | POST event | `payment_status="Paid"` **and `paid_date` set from `event.created`** | Critical | Positive — **paid_date assertion NOT confirmed present in existing test (weak evidence, REQUIRES_VALIDATION)** |
| PAY-TC-007 | booking_payment happy path | booking exists | POST event | `bookings.payment_status="Paid"` | Critical | Positive |
| PAY-TC-008 | assessment_payment increments credits | credits=2 | POST event | credits become 3 | Critical | Positive |
| PAY-TC-010 | library_subscription happy path | — | POST event | library fields set | Critical | Positive |
| PAY-TC-010b | **coach_subscription checkout happy path (NEW)** | coach exists, no `stripe_subscription_id` yet | POST `checkout.session.completed` with `metadata.type=coach_subscription, coach_id` | `coaches.stripe_subscription_id`/`subscription_status` set, `sub_plan="Coach Pro"` | Critical | Positive — **NOT COVERED, no test exists** |
| PAY-TC-011 | academy_subscription with access window | plan has `access_duration_months` | POST event | `academies.access_expires_at` ≈ now+N mo | Critical | Positive |
| PAY-TC-013 | generic player subscription | `client_reference_id` set | POST event | `players.sub_plan`, dates set | Critical | Positive |
| PAY-TC-015 | subscription.updated / library | — | POST event | library status updated | High | Positive |
| PAY-TC-016 | subscription.updated / academy | — | POST event | academy status updated, `access_expires_at` untouched | High | Positive |
| PAY-TC-016b | **subscription.updated / coach_subscription — active (NEW)** | `status=active` | POST event | `coaches.subscription_status="active"`, `sub_plan` untouched (stays whatever it was) | High | Positive — **NOT COVERED** |
| PAY-TC-016c | **subscription.updated / coach_subscription — inactive (NEW)** | `status=past_due` | POST event | `coaches.subscription_status="past_due"`, `sub_plan="Free"` | High | Positive — **NOT COVERED** |
| PAY-TC-017 | subscription.updated / player active | `plan` set, `status=active` | POST event | `sub_plan` set, `sub_sessions_limit=null` | Critical | Positive |
| PAY-TC-018 | subscription.updated / player inactive | `status=past_due` | POST event | `sub_plan="Free"`, `sub_sessions_limit`=live Free cap | Critical | Positive |
| PAY-TC-019 | subscription.deleted / library | — | POST event | library fields reset | High | Positive — **still no dedicated test (unchanged gap)** |
| PAY-TC-020 | subscription.deleted / academy | — | POST event | academy fields fully cleared | High | Positive |
| PAY-TC-020b | **subscription.deleted / coach_subscription (NEW)** | — | POST event | `coaches`: `sub_plan="Free"`, `subscription_status="canceled"`, `stripe_subscription_id=null` | High | Positive — **NOT COVERED** |
| PAY-TC-021 | subscription.deleted / player | — | POST event | player reset to Free/canceled/live-cap/null | Critical | Positive |
| PAY-TC-022 | account.updated both flags true | — | POST event | `stripe_connect_onboarded=true` | Medium | Positive |
| PAY-TC-024 | invoice.payment_failed sets past_due (player) | — | POST event | `players.subscription_status="past_due"` | High | Positive |
| PAY-TC-024b | **invoice.payment_failed for a coach_subscription (NEW gap case)** | subscription belongs to a coach | POST event | No write occurs anywhere — `coaches` table untouched by this event type | High | Gap/Negative — **NOT COVERED** |
| PAY-TC-026 | Unhandled event type acknowledged | — | POST `payment_intent.succeeded` | 200, no DB writes | Medium | Positive |
| PAY-TC-027 | Duplicate/redelivered webhook (assessment_payment) | pack already credited | POST same event twice | UNKNOWN/expected double-credit (no idempotency key) | Critical | Negative/Idempotency — **NOT COVERED** |
| PAY-TC-029 | Cron 500 when CRON_SECRET unset (pack-reminders) | — | POST | 500 | High | Negative |
| PAY-TC-030 | Cron 401 wrong bearer (pack-reminders) | — | POST wrong token | 401 | Critical | Negative/Security |
| PAY-TC-033–041 | Full pack-reminders reminder/overdue/lock suite | see prior analysis | POST | (unchanged from before — see Section 7) | Critical–High | Positive/Negative |
| PAY-TC-060 | Invoice download 403 cross-account | authorized for player A, invoice belongs to player B's customer | GET | 403 "does not belong to this account" | Critical | Negative/Security |
| PAY-TC-066 | **Booking-reminders 500 when CRON_SECRET unset (NEW)** | — | POST | 500 | High | Negative — **NOT COVERED, no test file** |
| PAY-TC-067 | **Booking-reminders 401 wrong bearer (NEW)** | — | POST wrong token | 401 | Critical | Negative/Security — **NOT COVERED** |
| PAY-TC-068 | **Booking-reminders sends inside the 3-hour window (NEW)** | Confirmed booking today, 2h away | POST | SMS+email sent, `booking_reminder_log` row inserted | Critical | Positive — **NOT COVERED** |
| PAY-TC-069 | **Booking-reminders skips outside the window (NEW)** | booking 5h away, or already started | POST | no send, no log row | High | Negative/Edge — **NOT COVERED** |
| PAY-TC-070 | **Booking-reminders idempotent on second run (NEW)** | already logged | POST twice | second run no-ops for that booking | High | Negative/Idempotency — **NOT COVERED** |
| PAY-TC-071 | **Booking-reminders: player with neither phone nor email (NEW)** | both null | POST | REQUIRES_VALIDATION — does `booking_reminder_log` still get stamped with nothing sent? | Medium | Edge — **NOT COVERED, behavior itself is ambiguous from source** |
| PAY-TC-072 | **Pack-auto-consume 500/401 auth gate (NEW)** | — | POST | 500 unconfigured / 401 wrong bearer | High/Critical | Negative — **NOT COVERED** |
| PAY-TC-073 | **Pack-auto-consume draws down a session when room exists (NEW)** | active pack, today in `agreed_days`, matching group session exists, no existing attendance | POST | `sessions_used`+1, `attendance_records` row `status="Absent", pack_id=<pack>` | Critical | Positive — **NOT COVERED** |
| PAY-TC-074 | **Pack-auto-consume records-no-room when pack exhausted (NEW)** | `sessions_used == total_sessions` | POST | attendance row written with `pack_id=null`, no draw-down, action `"recorded_no_room"` | High | Positive/Edge — **NOT COVERED** |
| PAY-TC-075 | **Pack-auto-consume skips when attendance already recorded (NEW)** | coach already marked attendance for that occurrence/player | POST | no double-charge, existing record untouched | Critical | Negative/Idempotency — **NOT COVERED** |
| PAY-TC-076 | **Pack-auto-consume skips when no matching group session (NEW)** | player not rostered on any matching group session today | POST | pack untouched, no attendance row | Medium | Edge — **NOT COVERED** |
| PAY-TC-077 | **Session-reminders 500/401 auth gate (NEW)** | — | POST | 500/401 | High/Critical | Negative — **NOT COVERED** |
| PAY-TC-078 | **Session-reminders sends inside the 3-hour window (NEW)** | matching group session 1h away, player has phone | POST | SMS sent, `session_reminder_log` row inserted | Critical | Positive — **NOT COVERED** |
| PAY-TC-079 | **Session-reminders skips a player with no phone (NEW)** | `player.phone` null | POST | no send (SMS-only, no email fallback) | High | Negative/Edge — **NOT COVERED** |
| PAY-TC-080 | **Session-reminders idempotent on second run (NEW)** | already logged for (player, group_session, date) | POST twice | second run no-ops | High | Negative/Idempotency — **NOT COVERED** |
| PAY-TC-081 | **cron-time.ts: sydneyOffsetMs reflects AEST vs AEDT correctly (NEW)** | one fixed instant in each DST regime | call directly | offset differs by 1 hour between regimes | Medium | Unit — **NOT COVERED, no `tests/unit/lib/cron-time.test.ts` found** |
| PAY-TC-082 | Coach-chat 403 limitReached at Plan-Catalog-driven cap | Free plan, `plans.chat_messages_per_day_limit` set to a custom value, `used==limit` | POST | 403, `limitReached:true`, no Anthropic call | Critical | Positive/Negative — **weak coverage: existing test likely still exercises only the hardcoded-3 fallback, not an actual Plan Catalog row (REQUIRES_VALIDATION)** |
| PAY-TC-083 | Invoice list: coach scope happy path (NEW) | coach has `stripe_customer_id` | GET `?coachId=` as that coach | 200, invoice list returned | High | Positive — **NOT COVERED, no test found for the new `coachId` query param** |
| PAY-TC-084 | Invoice list: coach scope 403 for a different coach | caller is coach B, `coachId`=coach A | GET | 403 | Critical | Negative/Security — **NOT COVERED** |
| PAY-TC-085 | Invoice download: coach scope unsupported (NEW gap) | coach wants to download a PDF of their own Coach Pro invoice | GET `/invoices/download?coachId=...` | Route only accepts `playerId`/`academyId` → `400` "Provide exactly one of playerId or academyId." — a coach cannot download an invoice PDF at all | Medium | Gap — **confirmed by direct code read, not a test** |
| PAY-TC-086 | Invoice amount/currency rendering end-to-end (NEW) | a non-AUD invoice, e.g. `currency="usd"` | GET list, GET PDF | both surfaces render via `formatMoney(amount, "usd")` → `US$X.XX` | Medium | Positive — REQUIRES_VALIDATION against current fixtures (stale `amountAud`-based fixtures would not exercise this) |

---

## 7. Existing Test Coverage vs Recommended

### `web/tests/api/stripe/webhook.test.ts`

Re-uses real Stripe test-mode signature generation (unchanged strategy). Covers, by test name: secret-unset/placeholder 500s, bad-signature 400, `pack_payment`/`booking_payment`/`assessment_payment`/`library_subscription`/`academy_subscription`/generic-player checkout branches, `library`/`academy`/active-player/inactive-player `.updated` branches, player/academy `.deleted` branches, both `account.updated` outcomes, `invoice.payment_failed`, unhandled-event 200. This suite does **not** use `rawUser`/`user_metadata` at all (confirmed by grep) since the webhook is never session-authenticated — it is unaffected by the `app_metadata` migration.

**Confirmed gaps (all NEW, all genuinely untested — not stale-fixture false negatives):**
- Zero tests reference `coach_subscription` anywhere (confirmed: `grep -n "coach_subscription" web/tests/api/stripe/webhook.test.ts` → no matches). All three new webhook branches (PAY-043/044/045) are completely uncovered.
- No test asserts the new `paid_date` field on the `pack_payment` branch (PAY-003) — the existing "marks the pack Paid" test title/intent suggests it only checks `payment_status`.
- `customer.subscription.deleted / library` (PAY-012) still has no dedicated test — unchanged gap from the prior analysis.
- Idempotency/duplicate-delivery (PAY-TC-027) and mid-handler-exception behavior remain entirely untested, as before.

### `web/tests/api/cron/pack-reminders.test.ts`

Comprehensive for the original cron's happy paths and dedup logic — unchanged in scope from the prior analysis (7-day/2-day/due-today/overdue/lock/no-email-skip all covered). This file uses `routeMockState`/service-client mocking, not `rawUser`, and the route itself is bearer-token authenticated — also unaffected by the `app_metadata` migration.

### `web/tests/api/cron/` — new cron jobs: **zero test files exist**

Confirmed by directory listing: `web/tests/api/cron/` contains only `pack-reminders.test.ts`. There is no `booking-reminders.test.ts`, `pack-auto-consume.test.ts`, or `session-reminders.test.ts`. There is also no `web/tests/unit/lib/cron-time.test.ts` for the new shared helper. **This is the single largest test-coverage gap introduced by this merge** — three entirely new scheduled jobs that touch real money (`pack-auto-consume` draws down paid session-pack credits automatically) and real customer communications (SMS/email), shipped with no automated test coverage at all. Per `web/AGENTS.md`'s own convention ("New `app/api/**/route.ts` → `tests/api/<mirrored-path>.test.ts`"), each of the three new routes is missing its required test file.

### `web/tests/api/coach-chat.test.ts`

Fully mocks `@anthropic-ai/sdk` (unchanged strategy, consistent with `AGENTS.md`). Covers: empty-messages 400, non-user-last-message 400, unauthenticated 401, no-linked-player 400, player-not-found 404, at-cap 403 with `limitReached`, day-rollover reset, successful stream + counter increment, Player-Pro bypass, coach-role bypass, missing-API-key 500, mid-stream error.

**Confirmed stale-fixture issue:** every `routeMockState.cookieUser = rawUser({...})` call in this file builds `{ id, user_metadata: {...} }` (per `web/tests/mocks/caller.ts`, read directly), but the current route reads `user.app_metadata?.role`/`user.app_metadata?.player_id`. This means every test that sets a role/`player_id` via `rawUser(...)` (e.g. the 400-no-linked-player, 404-player-not-found, 403-limitReached, coach-bypass tests) is exercising a caller whose `role`/`playerId` will resolve as `undefined` against the real code, not the value the test intends — the actual current behavior for these scenarios is different from what the test's assertions describe. Per this task's instructions, this is documented as a **known-stale test fixture**, not asserted as pass/fail.

**Also missing (new, on top of the fixture issue):** no test constructs a Plan Catalog row with a custom `chat_messages_per_day_limit` to verify the Plan-Catalog-driven cap (PAY-029) beyond the hardcoded-3 fallback path — REQUIRES_VALIDATION whether the existing "403 with limitReached" test still only exercises the fallback default.

### `web/tests/e2e/roles/player/coach-chat.spec.ts`

One real-API smoke test, unchanged framing. Session-auth-based (Playwright drives a real login), so it is affected by the `app_metadata` migration only insofar as the login flow itself must now correctly populate `app_metadata` server-side for the test's session to carry a working role — outside this file's own content to verify.

### `web/tests/api/stripe/invoices.test.ts`, `invoices-download.test.ts`, `web/tests/components/InvoiceHistoryList.test.tsx`

**Confirmed stale in two independent ways:**
1. **Auth fixture staleness:** both API test files use `rawUser({...})` (same `user_metadata`-based fixture as coach-chat's tests) against routes (`invoices/route.ts`, `invoices/download/route.ts`) that now resolve caller identity via `getCaller()` → `user.app_metadata`. Every 403/401 authorization-scoping test in these files is exercising a caller whose role/scope IDs will not resolve the way the test's `rawUser(...)` call implies.
2. **`amountAud` field staleness (confirmed directly):** `invoices.test.ts` line 12 constructs `SAMPLE_INVOICE` with `amountAud: 40` (confirmed by direct read); `invoices-download.test.ts` also contains an `amountAud: 40` literal (confirmed by grep). The current `NormalizedInvoice` type has no `amountAud` field at all — it is `amount`. A fixture built this way does not match the shape `normalizeStripeInvoice`/`normalizeCheckoutSession` actually produce, and any assertion comparing a route's JSON response against this fixture (e.g. `expect(body.invoices).toEqual([SAMPLE_INVOICE])`) is comparing against a shape the real code cannot produce. This directly confirms the task brief's flagged typecheck error.

**Also missing (new, beyond the stale-fixture/field issues):** no test exercises the new `coachId` query-scope on `invoices/route.ts` (PAY-034's new third scope) — REQUIRES_VALIDATION/confirmed absent by inspection (no `coachId` string appears in `invoices.test.ts`).

`InvoiceHistoryList.test.tsx` exists and, per the file list, covers the component (PAY-040) — not read in full this pass beyond confirming its existence; its fixtures likely share the same `amountAud` staleness pattern as the API tests it's adjacent to, given the component now reads `inv.amount`/`inv.currency` — REQUIRES_VALIDATION.

### RECOMMENDED_TEST list (net-new, prioritized)

1. **[Critical]** Test files for all three new cron routes (`booking-reminders`, `pack-auto-consume`, `session-reminders`) — currently zero coverage on jobs that move real money/entitlements and fire real customer communications.
2. **[Critical]** Webhook coverage for the three new `coach_subscription` branches (checkout/updated/deleted) — currently zero coverage on a brand-new paid-subscription flow.
3. **[High]** Update `web/tests/mocks/caller.ts`'s `rawUser()` to build `{ id, app_metadata: metadata }` instead of `user_metadata` — this single fixture change would realign every affected test file's intended-vs-actual auth resolution across this domain (and, per the sibling AUTH-domain finding, across the whole app). Documentation-only per this task's rules — flagged for the owning team, not applied here.
4. **[High]** Update the `SAMPLE_INVOICE`-style fixtures in `invoices.test.ts`/`invoices-download.test.ts` (and likely `InvoiceHistoryList.test.tsx`) from `amountAud` to `amount`, and add a `currency` value that isn't the default, to actually exercise `formatMoney`'s multi-currency path.
5. **[High]** `pack-auto-consume`'s over-charging risk (PAY-053) — a test (and a product decision) for what happens when a coach hasn't logged attendance yet by the time this cron runs late at night for a session that in fact was attended.
6. **[Medium]** `customer.subscription.deleted / library_subscription` (PAY-012) — still the only `.deleted` sub-branch without a direct test, unchanged from the prior analysis.
7. **[Medium]** `resolveNotifyTarget`'s academy-head-coach and academy-phone-only fallback tiers, in isolation — unchanged recommendation from the prior analysis.
8. **[Medium]** A unit test for `cron-time.ts` around a DST transition boundary, given the noted imprecision in `sydneyLocalToInstant` (PAY-057).
9. **[Medium]** `booking-reminders`' contactless-player edge case (PAY-049/PAY-TC-071) — clarify and test whether the idempotency log gets stamped for a send that had nowhere to go.
10. **[Low]** Invoice/session listing pagination cap (500 items) — unchanged recommendation from the prior analysis.
11. **[Low]** Coach-scoped invoice download (PAY-GAP-015) — decide whether this is an intentional product gap or should be added alongside the new coach-scoped listing.

---

## 8. Gaps and Ambiguities

| Gap ID | Area | Observed Behavior | Why It's Ambiguous/Risky | Suggested Requirement/Question |
|---|---|---|---|---|
| PAY-GAP-001 | Webhook — unhandled event types | Unchanged from prior analysis: no `default` case, silent no-op, 200 acknowledged, no logging/metric/alert. | HIGH RISK, unchanged. | Same as before — should unhandled types be logged/alerted? |
| PAY-GAP-002 | Webhook — idempotency (Stripe redelivery) | Unchanged: no `event.id` dedup anywhere. `assessment_credits += 1` (PAY-005) remains the clearest non-idempotent branch under redelivery. | HIGH RISK, unchanged, and now the new `coach_subscription` `.updated`/`.deleted` branches (PAY-044/045) inherit the same lack-of-dedup pattern, though both are absolute-value writes (naturally idempotent) rather than increments. | Same as before. |
| PAY-GAP-003 | Webhook — partial failure mid-handler | Unchanged: no try/catch inside any `switch` branch. | HIGH RISK, unchanged. | Same as before. |
| PAY-GAP-004 | pack-reminders — player with no email skipped entirely | Unchanged. | MEDIUM RISK, unchanged. | Same as before. |
| PAY-GAP-005 | Coach-chat — `limitReached` flag unused by the client | Confirmed still unused this pass (`CoachChatWidget.tsx` has zero references to `limitReached`). | LOW-MEDIUM RISK, unchanged. | Same as before. |
| PAY-GAP-006 | Coach-chat — topic-scoping is prompt-only, not code-enforced | Unchanged — still 8 topics, still prompt-level only. | MEDIUM RISK, unchanged. | Same as before. |
| PAY-GAP-009 | `invoice.payment_failed` doesn't cover non-player subscription types | Confirmed unchanged AND now expanded in scope: academy, library, **and now coach** (PAY-043's new subscription type) invoice failures all get no direct write from this event — only `players.subscription_status` is ever touched. | MEDIUM-HIGH RISK — three subscription types now depend entirely on a later `customer.subscription.updated` event to reflect `past_due`, up from two before this merge. | Should `invoice.payment_failed` branch by subscription-type metadata the same way the other three event types now do (including the new coach type)? |
| PAY-GAP-010 | `lib/stripe.ts` Proxy failure mode undocumented at call sites | Unchanged. | MEDIUM RISK, unchanged. | Same as before. |
| PAY-GAP-011 | **NEW** — `coach_subscription` webhook branches entirely untested | All three new branches (PAY-043/044/045) have zero test coverage (confirmed by grep of `webhook.test.ts`). | HIGH RISK for a newly-shipped paid-subscription flow — the exact kind of change most likely to have an edge-case bug (e.g. the asymmetric `sub_plan` handling in PAY-044, where the active path deliberately does *not* re-set `sub_plan`) that a test would catch. | Add the three tests listed in Section 6 (PAY-TC-010b/016b/016c/020b) before this flow sees production traffic, if it hasn't already. |
| PAY-GAP-012 | **NEW** — all three new cron routes have zero test coverage | Confirmed by directory listing of `web/tests/api/cron/`. | HIGH RISK — these jobs run unattended in production every 30 minutes (`booking-reminders`, `session-reminders`) or daily (`pack-auto-consume`), the latter directly debiting paid session-pack credits with no human in the loop and no test asserting it does so correctly. | Add `booking-reminders.test.ts`, `pack-auto-consume.test.ts`, `session-reminders.test.ts` per `AGENTS.md`'s own stated convention for new route handlers. |
| PAY-GAP-013 | **NEW** — `booking_reminder_log` table undocumented in the schema notes | The route uses `.from("booking_reminder_log")` for both a read (existence check) and a write (insert), but this table does not appear anywhere in `web/tests/seed/schema-notes.md` or `web/tests/seed/seed.ts` (confirmed by grep — zero hits in either file), unlike `session_reminder_log`, which *is* documented. | MEDIUM-HIGH RISK — violates the project's own stated AGENTS.md convention for this exact scenario, and leaves it genuinely unclear (from this repo alone) whether the table exists in the live Supabase project at all; if it doesn't, every `booking-reminders` cron run would be failing its `.select`/`.insert` calls in production with no test to have caught it beforehand. | Confirm the table exists in the live dev/prod Supabase project and backfill `schema-notes.md`/`seed.ts` per the stated convention. |
| PAY-GAP-014 | **NEW** — Coach-chat's daily-limit day boundary is UTC, while the four reminder/consumption crons in the same domain are Sydney-local | `chat_last_message_date`/`today` in `coach-chat/route.ts` is computed via plain `new Date().toISOString().slice(0,10)` (UTC), while `cron-time.ts` (used by three of the four crons) was added specifically because "the deployed server's own clock is not guaranteed to be [Sydney]" for date/time-sensitive logic. | MEDIUM RISK / inconsistency — for an Australian user base, a Free-plan player's daily Coach AI message count resets at UTC midnight, i.e. mid-morning-to-early-afternoon Sydney time (depending on DST) rather than at actual Sydney midnight — the reset point is a few hours "early" in the Sydney day from a user's point of view. This exact class of bug is what `cron-time.ts`'s own in-code comment says already bit the *payment*-reminder cron once; coach-chat's day-boundary was not similarly hardened in this merge. | Should `coach-chat`'s daily-cap day boundary also use `sydneyNowParts()` for consistency with the rest of the domain's date-sensitive logic? |
| PAY-GAP-015 | **NEW** — Coach-scoped invoice listing exists but coach-scoped PDF download does not | `invoices/route.ts` (PAY-034) added a `coachId` scope in this merge; `invoices/download/route.ts` (PAY-035) still only accepts `playerId`/`academyId` — confirmed by direct read, no `coachId` handling anywhere in the download route. | MEDIUM RISK (product/UX gap, not a security issue) — a coach can now see their own Coach Pro invoice history in a list but has no route to download a PDF of any individual invoice the way a player or academy admin can. | Was this intentionally deferred, or should a coach-scope be added to the download route to match the new listing scope? |
| PAY-GAP-016 | **NEW** — `pack-auto-consume` always records `"Absent"`, with same-day auto-charge, ahead of any human attendance-taking | See PAY-053's business-rule note. | MEDIUM-HIGH RISK (money/fairness) — a player who genuinely attended a session, whose coach simply hasn't logged attendance by the time this cron runs late that night, is auto-marked absent *and* auto-charged a session credit; nothing in the visible UI/data model distinguishes "auto-consumed, actually absent" from "auto-consumed, coach just hadn't logged it yet" after the fact (both are `status: "Absent"`, and the coach's own later edit, if any, would silently overwrite it per PAY-052's idempotency mechanism — but only if the coach *does* go back and fix it, which nothing prompts them to do). | Is same-night auto-charge-as-absent the intended policy (a firm "you agreed to this day, you're billed" rule), or should there be a longer grace window, an explicit distinguishing flag, or a coach-facing nudge to reconcile attendance before the cron runs? |

**Risk flags recap:**
- **HIGH — Three new crons, zero tests (PAY-GAP-012):** the single largest net-new risk introduced by this merge, compounded by `pack-auto-consume` directly moving money/credits unattended.
- **HIGH — Three new webhook branches, zero tests (PAY-GAP-011):** a newly-shipped paid-subscription flow (Coach Pro self-serve) with no automated coverage.
- **HIGH — `booking_reminder_log` schema-documentation gap (PAY-GAP-013):** genuinely unclear from this repo whether the table this cron depends on for every run even exists in the live database.
- **HIGH (carried forward, unchanged) — Webhook idempotency (PAY-GAP-002)** and **partial-write failure mid-handler (PAY-GAP-003)**, both still unaddressed.
- **MEDIUM-HIGH — pack-auto-consume's same-night auto-charge policy (PAY-GAP-016):** a real-money business-rule question, not just a test gap.

---

## 9. Changes Since Prior Analysis (this merge)

### NEW

- **Three new scheduled cron jobs**, all sharing the `CRON_SECRET` bearer-token pattern and all using the new `web/lib/cron-time.ts` Sydney-timezone helper:
  - `web/app/api/cron/booking-reminders/route.ts` (PAY-046–049) — every 30 minutes, reminds a player by SMS+email 0–3h before a confirmed 1:1 booking. Workflow: `.github/workflows/booking-reminders.yml`.
  - `web/app/api/cron/pack-auto-consume/route.ts` (PAY-050–053) — once daily (13:00 UTC), auto-records `"Absent"` attendance and draws down a session-pack credit for every agreed recurring-session day nobody already recorded attendance for. Workflow: `.github/workflows/pack-auto-consume.yml`.
  - `web/app/api/cron/session-reminders/route.ts` (PAY-054–056) — every 30 minutes, reminds a player by SMS only 0–3h before their recurring group session. Workflow: `.github/workflows/session-reminders.yml`.
- **`web/lib/cron-time.ts`** (PAY-057) — new shared Sydney-timezone helper (`sydneyNowParts`, `sydneyOffsetMs`, `sydneyLocalToInstant`, `DAY_TOKENS`), consumed by the three crons above (not by the original `pack-reminders`).
- **A wholly new Coach Pro self-serve subscription flow**: `web/app/api/stripe/create-coach-checkout-session/route.ts` + three new webhook branches — `checkout.session.completed` (PAY-043), `customer.subscription.updated` (PAY-044), `customer.subscription.deleted` (PAY-045) — all discriminated by the new `metadata.type === "coach_subscription"`.
- **A new `coachId` scope** on `GET /api/stripe/invoices` (PAY-034) alongside the existing `playerId`/`academyId` scopes.
- **System-wide multi-currency support** (`web/lib/currency.ts`, new file): `Currency` type (`aud|usd|gbp|nzd|inr`), `resolvePlanPrice`, `formatMoney`, `sumMoneyByCurrency`, `currencyForCountry`. Consumed by every `create-*-checkout-session` route (now currency-aware price resolution) and by invoicing (PAY-037–040, currency-aware amount rendering). The webhook itself remains currency-agnostic by design (see Section 1).
- A fourth new cron, `web/app/api/cron/referral-commissions/route.ts` (`.github/workflows/referral-commissions.yml`, monthly), also landed in this merge — **out of scope for this document**, belongs to the MARKETPLACE domain.

### CHANGED

- **`NormalizedInvoice.amountAud` → `NormalizedInvoice.amount`** (`web/lib/stripe-invoices.ts`), and the type is now genuinely currency-aware (`currency: string` rendered via the new shared `formatMoney()` rather than a fixed-AUD formatter). Confirmed to flow through `web/lib/invoice-pdf.ts` and `web/components/InvoiceHistoryList.tsx` consistently; confirmed **not** reflected in the existing test fixtures (`invoices.test.ts`, `invoices-download.test.ts` both still construct `amountAud: 40`).
- **`checkout.session.completed` / `pack_payment`** (PAY-003) now also stamps `session_packs.paid_date` from `event.created`, fixing a previously-silent "Paid {date}" badge bug for online-paid packs (per an explicit in-code comment explaining the fix).
- **Session-authenticated routes in this domain now read `app_metadata` instead of `user_metadata`** for role/scope resolution: `web/app/api/coach-chat/route.ts` (PAY-028) and `web/lib/server-auth.ts`'s `getCaller()` (PAY-036, used by both invoice routes). The Stripe webhook and every cron are unaffected (bearer/signature-authenticated, service-role DB client, no Supabase Auth user object involved).
- **Coach-chat's Free-plan daily message cap** (PAY-029) is now sourced from the admin-editable Plan Catalog (`plans.chat_messages_per_day_limit`) via a **two-argument** `chatMessagesLimitForPlan(tier, plans)` call, falling back to the previous hardcoded `3`/`null` only when no matching Plan Catalog row exists.
- **`CoachChatWidget.tsx`**: the persistent "AI-generated — it can make mistakes" disclaimer text described by the prior analysis is not present anywhere in the current file (confirmed by grep) — flagged as CONFLICTING with the prior write-up since no git history exists in this repo to confirm whether this was an active removal in this merge or an inaccuracy in that earlier pass.
- All six pre-existing `create-*-checkout-session` routes now resolve price/currency via `lib/currency.ts`'s `resolvePlanPrice`/`isSupportedCurrency` instead of a flat AUD-only price — a change to files adjacent to (metadata-origin dependencies of) this domain, not to the webhook itself.

### REMOVED

- No webhook event-type branch, cron job, or invoicing capability present in the prior analysis was removed in this merge — every previously-documented requirement (PAY-001 through PAY-042) remains implemented, some with the specific behavior changes itemized above.
- The one candidate removal — `CoachChatWidget.tsx`'s disclaimer copy — is documented under CHANGED above rather than as a formally REMOVED requirement, since it was never assigned its own requirement ID in the prior analysis (it was prose within PAY-032, not a separately numbered item).
