# Business Rules

Consolidated business-rule tables per domain — the decision logic that governs pricing, gating, permissions, and state transitions, distinct from the per-requirement detail in [`requirements.md`](./requirements.md).

---

## AUTH — Auth & RBAC — Authentication, Sessions, Account Lifecycle

*Source: [`domains/auth.md`](./domains/auth.md)*


| # | Rule | Status | Source |
|---|---|---|---|
| BR-1 | Role/approval/scope/linkedIdentities live entirely in Supabase Auth `app_metadata` (server-only) — no `roles` DB table. `user_metadata` carries only display-only `name`. | CHANGED (was `user_metadata` for everything) | AUTH-051, every route |
| BR-2 | Role hierarchy for player-resource access unchanged: `platform_admin` > `academy_admin` (own roster) ≈ `coach` (own players) > `player`/`parent` (own linked player only). No cross-rank inheritance. | UNCHANGED | AUTH-036, AUTH-037 |
| BR-3 | `platform_admin` is never self-selectable at signup or via `complete-signup`'s `SELF_SERVE_ROLES` allowlist. | UNCHANGED | `web/app/signup/page.tsx`, `web/app/api/complete-signup/route.ts` |
| BR-4 | `academy_admin`/`coach` self-signups are still unapproved by default and queued in `user_requests`. **`player`/`parent` self-signups now auto-approve immediately** when their player-lookup email matches an existing player. | CHANGED (was universal `approved:false` for every role) | AUTH-011, AUTH-012, AUTH-047 |
| BR-5 | `role` is now written server-side, after signUp() returns, by a dedicated route (`complete-signup`) — never client-side at signup time. The role check gate and the approval gate are still two independent checks; most privileged routes still check only the former (AUTH-GAP-001 persists). | CHANGED (was client-side, same-call) | AUTH-011, AUTH-046 |
| BR-6 | An additional role for an existing account always goes through `user_requests` (`request_type:"link"`) + platform-admin approval + a real-password ownership proof. | UNCHANGED | `request-additional-role` |
| BR-7 | A "link" request never creates/deletes the underlying Auth account on reject; only a "new" signup's rejection deletes it. | UNCHANGED | `reject-user` |
| BR-8 | `linkedIdentities` is the sole mechanism for multi-role accounts; `switch-role` only allows targets already present in that array. `player`/`parent` identities now dedupe per-child rather than per-role. | CHANGED (dedup granularity) | AUTH-025, AUTH-030 |
| BR-9 | Player/parent accounts are hard-confined to `/portal` client-side, with one carve-out for their own subscription page. | UNCHANGED | `AuthGuard.tsx` |
| BR-10 | Guardian consent: a `player` may self-confirm only if `age_group === "Senior"`; a `parent` faces no age restriction. | UNCHANGED | `confirm-consent` |
| BR-11 | A player's login can be independently disabled from their Auth credentials; only `platform_admin`/`academy_admin` (scoped) can lift the lock. | UNCHANGED (data source moved to `app_metadata`) | `AuthProvider.login()`, `reactivate-player` |
| BR-12 | Coach invites and password reset funnel through the same `/reset-password` completion page. | UNCHANGED | `invite-coach`, `reset-password` |
| BR-13 | `/api/stripe/webhook` and `/api/cron/*` (broadened from a single job) are authenticated by their own out-of-band secret, not a session cookie; `/api/contact` and `/api/public-register-player` are now also session-independent for their own reasons (public forms). | CHANGED (allowlist grew) | AUTH-003 |
| BR-14 | **NEW:** A public, code-gated `/register` page can create a `players` row with **no** Supabase Auth account at all — registration (lead capture) and account creation (login) are two entirely separate flows that happen to share the same email field. | NEW | AUTH-042–045 |
| BR-15 | **NEW:** An independent (non-academy-invited) self-signed-up coach now gets a `coaches` row auto-created at approval time if none matched by email, instead of silently ending up with no `coach_id`. | NEW | AUTH-024 |
| BR-16 | **NEW:** No privileged route checks `approved` — only `role` — so an unapproved `academy_admin`/`coach` whose `app_metadata.role` is already set (true from the moment `complete-signup` runs, before any human review) can still successfully call role-gated routes like `invite-coach`. This is the same gap as before the merge, just now sitting on `app_metadata` instead of `user_metadata`. | UNCHANGED (relocated, not fixed) | AUTH-GAP-001 |

---


---

## PLAYER — Player — Players, Sessions, Video/Pose Pipeline, Reports, Performance

*Source: [`domains/player.md`](./domains/player.md)*


| # | Rule | Value / Formula | Source |
|---|---|---|---|
| BR-1 | Free-plan monthly session cap | Player Catalog row `slug="free"`.`sessionsPerMonthLimit`, else hardcoded `4`; paid tiers default `null` (unlimited) | `lib/plan-features.ts:sessionsLimitForPlan(tier, plans)` **(CHANGED — 2-arg)** |
| BR-2 | AI report generation requires | player's own plan (`aiReportsEnabled` on Catalog row) **OR** academy plan `waivesSessionFees` (subject to `accessDurationMonths`/`accessExpiresAt` monitoring window if set) **OR** independent coach's own Coach Pro **OR** spending 1 `assessmentCredits` | `lib/plan-features.ts:canGenerateAiReports/canGenerateAiReportsForCoach`; `SessionsClient.tsx:aiReportsIncludedForPlayer` **(CHANGED)** |
| BR-3 | Session XP formula | `50 + (videos uploaded × 20)` → 50–110 XP | `NewSessionForm.tsx` |
| BR-4 | Pack-drawn session doesn't count against Free cap | if `packId` passed to `recordSessionCompletion`, `sub_sessions_used` is not incremented | `lib/db.ts:recordSessionCompletion` |
| BR-5 | Attendance draws a pack session once per occurrence | first Present/Absent record for an occurrence consumes 1 pack session; later toggles don't | `lib/db.ts:saveAttendance` |
| BR-6a | Video quality is advisory only | <1920×1080 or <50fps → warning, never blocks upload; only a corrupt/unreadable file blocks | `lib/video-quality.ts`, `NewSessionForm.tsx` |
| BR-6b | Video upload hard size cap | 50MB, checked client-side post-transcode (`MAX_UPLOAD_BYTES`) **and** enforced by the storage bucket's inherited global 50MB Supabase-project cap (no bucket-level override) | `NewSessionForm.tsx`, `web/app/api/storage/sign-upload/route.ts` **(CHANGED — was a 500MB bucket override)** |
| BR-7 | Transcode failure falls back silently | original file uploaded, `transcoded: false`, no user-facing error | `lib/transcode.ts`, `NewSessionForm.tsx` |
| BR-8 | Pose-detection minimum confidence | `< 6` successfully-detected frames → hard rejection with a specific user-facing message | `SessionsClient.tsx:handleGenerateReport` |
| BR-9 | Ball-tracking never fabricates | `speedKmh`/`lengthZone`/`lineApprox` stay `null` without both a sufficient trajectory (`>=6` linked points) and a saved `CameraCalibration` | `lib/ball-tracking.ts` |
| BR-10 | Report speed preference | measured ball-tracking speed always overrides Claude's visual estimate | `web/app/api/ai-report/route.ts` |
| BR-11 | Front-knee angle DB rounding | computed metric rounded to nearest integer before insert (`integer` column) | `web/app/api/ai-report/route.ts` |
| BR-12 | Action-plan priority = f(injury risk) | `High→High, Moderate→Medium, Low→Low` (default `Medium`) | `web/app/api/generate-action-plan/route.ts:PRIORITY_BY_RISK` |
| BR-13 | Action-plan default due date | `today + 14 days` | `web/app/api/generate-action-plan/route.ts` |
| BR-14 | Injury-risk classification | `>=2` breached metrics (score `<40`) → `High`; `>=1` breached or `>=2` borderline (score `<60`) → `Moderate`; else `Low` | `lib/biomechanics.ts:classifyInjuryRisk` |
| BR-15 | Action-type classification | shoulder-hip separation at FFC `>35°` → `Mixed`; else hip-vs-approach angle at BFC within 35° of 90° → `Side-on`, else `Front-on`; unknown angle → `Mixed` | `lib/biomechanics.ts:classifyActionType` |
| BR-16 | Injury-risk trend alert | most-recent report `High`, OR direction `worsening`, OR `>=2` of last-3 non-`Low` | `lib/performance-trends.ts:computeInjuryRiskTrend` |
| BR-17 | S&C load spike alert | `acwr = currentWeekLoad / avg(last 3 completed weeks) >= 1.5` with `>=2` prior weeks of history | `lib/performance-trends.ts:computeSCLoadSummary` |
| BR-18 | RPE weekly load | simple sum of RPE over the trailing 7 days | `lib/performance-trends.ts:computeRpeSummary` |
| BR-19 | Badge milestones | Sessions `[1,5,10,25,50,100]`; XP `[100,500,1000,2500,5000]`; reports `1`/`5`; tip streak / academy articles thresholds from `academy-content.ts` | `lib/badges.ts` |
| BR-20 | Assessment must rate all 5 categories | save blocked until every `ASSESSMENT_CATEGORIES` entry has a rating | `web/components/AssessmentForm.tsx` |
| BR-21 | Player status derivation | `<0` days to `endDate` → `Expired`; `<=7` days → `Expiring`; else `Active` | `lib/utils.ts:getPlayerStatus` |
| BR-22 | Assessment credit spend is server-validated | client gate is cosmetic; server re-checks `credits > 0` and decrements before generating | `web/app/api/ai-report/route.ts` |
| BR-23 | **NEW** — Report emailing requires completed review | manual "Email Report" send returns 400 unless `report.review_status === "completed"`; auto-email on generation removed entirely | `web/app/api/reports/send-email/route.ts`, `web/app/api/ai-report/route.ts` |
| BR-24 | **NEW** — Player/parent report visibility requires completed review | `players/[id]/reports` page filters to `reviewStatus === "completed"` for non-staff viewers | `app/(dashboard)/players/[id]/reports/page.tsx` |
| BR-25 | **NEW** — Attendance roster entry requires an active matching pack | a player can only be added to a recurring group's roster if they hold an Active `SessionPack` for that group's `sessionType`+`academyId` with remaining capacity | `web/components/AttendanceClient.tsx:hasActivePackFor` |
| BR-26 | **NEW** — Independent-coach roster cap | `rosterCapForCoachPlan(coach.subPlan, plans)`: Free default `5`, Coach Pro `null` (unlimited), overridable via the coach's own Plan Catalog row's `seatCap` | `lib/plan-features.ts:rosterCapForCoachPlan` |
| BR-27 | **NEW** — Currency self-service is player/parent-own-row or platform-admin only | `players.currency` cannot be set by a coach/academy_admin, even one with full player access, via `/api/players/update-currency` | `web/app/api/players/update-currency/route.ts` |
| BR-28 | **NEW** — Plan price resolution | admin per-currency override price if set on the Plan Catalog row for the buyer's preferred (non-AUD) currency, else always AUD | `lib/currency.ts:resolvePlanPrice` |
| BR-29 | **NEW** — AI-monitoring window narrower than fee waiver | a `waivesSessionFees` academy plan with `accessDurationMonths` set only grants AI reports while `academy.accessExpiresAt` is still in the future, even though the fee waiver itself is not time-limited within the billing cycle | `SessionsClient.tsx:aiReportsIncludedForPlayer` |
| BR-30 | **NEW** — Last-payment source precedence | most-recent of (manual date, paid pack's `paid_date`, latest paid Stripe invoice) wins, by raw string date comparison, never the manual field by default | `web/app/api/players/[id]/last-payment/route.ts` |

---


---

## MKT — Marketplace — Coach Discovery, Bookings, Session Packs, B2C Stripe Commerce

*Source: [`domains/marketplace.md`](./domains/marketplace.md)*


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


---

## ADMIN — Academy & Platform Admin — Org Management, B2B Billing, Admin Surfaces

*Source: [`domains/academy_admin.md`](./domains/academy_admin.md)*


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


---

## PORTAL — Portal & Content — Player/Parent Portal, Academy Curriculum, Messaging

*Source: [`domains/portal_content.md`](./domains/portal_content.md)*


| # | Rule | Source | Notes |
|---|---|---|---|
| BR-1 | Foundation stage is always unlocked, regardless of plan. | `academy-content.ts` | Unchanged |
| BR-2 | Mechanics/Velocity/Elite require `Player Pro`/`Coach Pro` **or** an active/trialing Library subscription. | `academy-content.ts` | Unchanged |
| BR-3 | Mechanics unlocks at ≥5 Foundation reads; Velocity at ≥6 Mechanics reads; Elite at ≥6 Velocity reads. | `academy-content.ts` | Unchanged |
| BR-4 | Article XP by stage: Foundation 50, Mechanics 100, Velocity 150, Elite 200. | `academy-content.ts` | Unchanged |
| BR-5 | Reading every currently-published article in a stage awards a 500 XP stage-completion bonus. | `db.ts:recordArticleRead` | Unchanged |
| BR-6 | Reading a 29th distinct article ever awards a 1,000 XP bonus (constant `ACADEMY_TOTAL_ARTICLES`, now explicitly commented as intentional, not `articles.length`-derived). | `db.ts:recordArticleRead`, `academy-content.ts` | Comment added; behavior unchanged |
| BR-7 | An article read is idempotent, enforced by a DB unique-constraint catch (`23505`), not an app-level pre-check. | `db.ts:recordArticleRead` | Unchanged |
| BR-8 | A daily-tip view only advances the streak once per calendar day (server clock); ≥2-day gap resets to 1. | `db.ts:recordTipView` | Unchanged |
| BR-9 | Every 7th consecutive day awards 200 XP, re-firing every multiple. | `db.ts:recordTipView` | Unchanged |
| BR-10 | A locked article's XP/read-tracking is never triggered by direct URL navigation. | `ArticleReaderClient.tsx` | Unchanged |
| BR-11 | Badges are always recomputed from live data, never stored as "awarded." | `badges.ts` | Unchanged |
| BR-12 | A minor player cannot self-confirm consent; only a linked `parent` account can, enforced server-side via `app_metadata`. | `confirm-consent/route.ts` | Confirmed still on `app_metadata` (pre-existing, not a migration artifact) |
| BR-13 | Messaging always targets `player.email`/`player.phone` — no distinct guardian contact field. | `MessageModal.tsx`, `Player` type | Unchanged |
| BR-14 | SMS body is soft-capped at 160 characters in the UI only; not re-validated server-side. | `MessageModal.tsx`, `sms.ts` | Unchanged |
| BR-15 | Bulk messages are logged to the `messages` table but never actually sent via email/SMS. | `BulkMessageModal.tsx` | Unchanged — re-confirmed against current source |
| BR-16 | `fetchMessages` returns rows ordered newest-first by an explicit DB `.order("date", desc)`. | `db.ts:fetchMessages` | **New confirmation** — previously only inferred |
| BR-17 | Only a `platform_admin` (per `app_metadata.role`) may trigger the new-article broadcast email. | `notify-new-article/route.ts` | **Changed field**: was `user_metadata`, now `app_metadata` |
| BR-18 | `/about`, `/contact`, `/privacy`, `/terms` require no authentication and remain visible to signed-in users (no redirect either way). | `middleware.ts` | New |
| BR-19 | `/api/contact` requires no authentication; sends to a hardcoded `support@crichq.com.au`, cc's `PLATFORM_ADMIN_EMAIL`, sets `replyTo` to the visitor-submitted (unverified) email. | `api/contact/route.ts` | New |
| BR-20 | A contact-form submission is never persisted to any database table — its only record is the outbound email itself. | `api/contact/route.ts` | New |
| BR-21 | Privacy and Terms pages compute their "Last updated" date at render time (`new Date()`), so it always shows today's date rather than a true last-revision date. | `privacy/page.tsx`, `terms/page.tsx` | New |

---


---

## PAY — Payments Core — Stripe Webhook, Cron, Invoicing, AI Coach Chat

*Source: [`domains/payments_core.md`](./domains/payments_core.md)*


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


---

