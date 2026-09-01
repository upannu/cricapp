# Test Data Catalog (Refreshed)

Rebuilt against the current codebase. All values are synthetic — no real sensitive data, no real payment cards beyond Stripe's published test cards, no real production credentials. Everything targets a dev Supabase project and Stripe test mode.

---

## 0. Prerequisite: schema must actually have this merge's new columns/tables

Before any test data below is useful, confirm the dev Supabase project has: `players.currency`, `coaches.currency`, `academies.country`/`currency`, `reports.review_status` (+ reviewer/timestamp fields), `plans.prices_by_currency`/`sessions_per_month_limit`/`chat_messages_per_day_limit`/`ai_reports_enabled`/`marketplace_enabled`/`locked`, and (unconfirmed from source alone) `booking_reminder_log`. See `test-strategy.md §6/§19`.

## 1. Existing seed fixtures (ground truth — `web/tests/seed/`, not yet updated for this merge)

Same 5 role accounts, 1 academy/coach/player/report as before. **Not yet extended** for: a `currency` value on any fixture, a second academy in a different currency, a Coach Pro-subscribed coach, an active referral, a report in each review state, or data for the 3 new cron jobs. Building these is the top test-data priority for this merge (below).

## 2. Valid data (new/changed this merge)

| Field/Entity | Example valid value |
|---|---|
| Currency | `"aud"`, `"usd"`, `"gbp"`, `"nzd"`, `"inr"` (individual purchases only — see §3) |
| Academy country | `"AU"`, `"US"`, `"GB"`, `"NZ"` (drives derived currency; India excluded from academy country options) |
| Plan `pricesByCurrency` | `{ usd: 35, gbp: 28 }` — admin-set override per currency, falls back to `priceAud` if absent |
| Report review status | `"not_reviewed"`, `"under_review"`, `"completed"` |
| Referral type | one-off bonus or ongoing % of revenue |
| Booking reminder window | 0–3 hours before a confirmed 1:1 booking |

## 3. Invalid data (new/changed this merge)

| Field | Invalid example | Expected handling |
|---|---|---|
| Currency | `"eur"` (not a supported currency), `"AUD"` (wrong case), `123` (wrong type) | Should be rejected — confirm, don't assume |
| Academy country for a Connect-payout-active academy | Any value other than the existing one | Should be silently ignored server-side per `ADMIN-TC-018`/`SEC-TC-008`, confirming the field is truly locked |
| Plan `pricesByCurrency` key | `"eur"` (unsupported), `"aud"` (must use `priceAud` instead) | 400 (`ADMIN-TC-013`/`014`) |
| Report review transition | Attempting `not_reviewed → completed` directly (skipping `under_review`) | Untested — worth establishing whether this is blocked or silently allowed |
| CRON_SECRET (any of the 5 cron routes) | Wrong/missing bearer token | 401/500 per route |

## 4. Boundary data (new/changed this merge)

| Boundary | Values to test |
|---|---|
| Independent-coach roster cap | At exactly the cap, one over |
| Booking/session-reminder window | Exactly 3 hours before vs. 3h01m before |
| Report review state | Each of the 3 states, and the transition edges between them |
| Pack-auto-consume | A pack with exactly 0 sessions remaining vs. 1 remaining |
| All boundaries from the prior test-data catalog (session limits, unlock gates, XP bonuses, pose-detection threshold) — still apply, now sourced from the Plan Catalog rather than hardcoded — verify the *value* still matches |

## 5. Empty / null data (new/changed this merge)

| Field | Empty/null case |
|---|---|
| `plans.prices_by_currency` | Absent entirely — must fall back to `priceAud` cleanly |
| Player/coach `currency` | Unset on an existing pre-merge fixture row — confirm the app doesn't crash on a legacy row created before this field existed |
| `booking_reminder_log` row for a booking | Never created — first-ever reminder for that booking |
| Report `review_status` | Unset on a legacy pre-merge report row — confirm it defaults sensibly (`not_reviewed`?) rather than crashing |

## 6. Duplicate data (new/changed this merge)

| Scenario | Duplicate case |
|---|---|
| Two active referrals for the same academy/coach/player | Should be rejected or the second supersede the first — untested, see `NEG-TC-006` |
| A cron invoked twice in immediate succession | Should no-op the second time for anything already processed — the single most important new duplicate-data class this merge introduced (3 new crons, one of which auto-debits money) |
| Duplicate webhook delivery for a `coach_subscription` event | Same idempotency question as the pre-existing `assessment_payment` gap, now applies to a second money-adjacent event family |

## 7. Large data

Unchanged from the prior catalog, plus: a payer with invoices in multiple currencies (tests the currency-aware invoice list/PDF rendering at volume), an academy with a very large roster on `pack-auto-consume` (tests the cron's batch runtime — `SCN-PERF-005`).

## 8. Special characters

Unchanged from the prior catalog, plus: a referral's recorded name/notes field with special characters, an Email Template's HTML content with characters that could break the HTML-shell rendering.

## 9. Different user roles

Same 5 roles, same gaps as before (multi-linked-identity account, `approved:false` staff account, second academy for IDOR testing — all still missing from seed data) **plus new for this merge**: a coach with an active Coach Pro subscription (needed to test coach-side marketplace visibility and roster-cap gating), a coach with no subscription (needed to test the gated-off state).

## 10. Different states (new/changed this merge)

| Entity | States to seed/produce |
|---|---|
| Report | `not_reviewed`, `under_review`, `completed` — at least one of each, to test visibility gating at every state |
| Coach subscription | not-subscribed, active, cancelled — mirroring the player-subscription state set |
| Referral | active, ended |
| Session pack, relative to `pack-auto-consume` | has room to draw down vs. exhausted (`sessions_used == total_sessions`) |
| Booking, relative to `booking-reminders` | inside the reminder window, outside it, already reminded (log row exists) |

## 11. Data required for integrations (new/changed this merge)

| Integration | Required test data / config |
|---|---|
| Stripe | All prior requirements, plus: a test-mode subscription product/price usable for the new Coach Pro coach-subscription flow |
| Currency resolution | At least one `plans` row with a real `pricesByCurrency` override, to distinguish "override applied" from "AUD fallback" in tests |
| The 3 new crons | Seeded bookings/packs/group-sessions positioned precisely inside and outside each cron's action window — this is genuinely new test-data engineering, not a variant of anything in the prior catalog |
| Email Templates | At least one customized template row per role, to distinguish "custom template used" from "hardcoded fallback used" (`ADMIN-TC-022`/`023`) |
