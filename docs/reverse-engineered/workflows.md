# Detailed Workflows (Decision Logic)

For each domain's key workflows: Input → Validation → Authorization → Business rules → State changes → DB/external calls → Response → Error handling. Covers happy paths, alternative paths, failure paths, boundary/null/invalid input, and unauthorized access, with decision tables for branchy logic.

---

## AUTH — Auth & RBAC — Authentication, Sessions, Account Lifecycle

*Source: [`domains/auth.md`](./domains/auth.md)*


### (a) Login

```
1. Client trims email, calls supabase.auth.signInWithPassword(email, password)
   ├─ Error message contains "email not confirmed" → return "EMAIL_NOT_CONFIRMED" (NEW)
   │    Login page shows resend-confirmation UI (AUTH-052)
   ├─ Other error → return error.message → login page shows generic
   │    "Invalid email or password."
   └─ Success → data.user, data.session
2. If data.user.app_metadata.player_id is set (CHANGED: was user_metadata):
   a. Self-read players.login_disabled, disabled_reason for that player_id
   b. login_disabled === true → signOut() → "ACCOUNT_DISABLED::<reason>"
   c. Else continue
3. Return null → router.push("/players")
4. AuthGuard: approved === false (from app_metadata, CHANGED) → "Awaiting Approval"
5. AuthGuard: role player/parent and path not under /portal → replace("/portal")
```

### (b) Signup (role-dependent branching — CHANGED)

| Role | Path | Outcome |
|---|---|---|
| `academy_admin` | `signUp()` (name only) → `complete-signup` | Duplicate academy name → 409 (NEW, AUTH-048). Else `app_metadata:{role,approved:false}` + `user_requests` insert + admin email — **unchanged from before this merge**, per the route's own comment. |
| `coach` | same | Same as academy_admin — always queued, never auto-approved. |
| `player` / `parent` | same | **NEW:** `playerLookupEmail` resolves to ≥1 `players` row → `app_metadata:{role,approved:true,player_id,...linkedIdentities if >1 match}` — **no `user_requests` row, no admin review, immediately usable** once email is confirmed. No match → 400, signup fails outright (not queued either). |
| Any role, email already has an account | `check-existing-account` → true → `request-additional-role` | Unchanged: password-ownership-proof, 409 if already held (academy_admin/coach only), else queues a "link" request. |

```
Decision inside signup():
1. POST /api/check-existing-account { email }
2. exists → POST /api/request-additional-role (unchanged, AUTH-019)
   else:
     supabase.auth.signUp({ email, password, options: { data: { name } } })  // CHANGED: name only
       error → surfaced verbatim
     POST /api/complete-signup { userId, name, email, role, playerLookupEmail?, academyName?, academyLocation? }
       400 missing fields / invalid role
       400 signup-verification failure (userId/email mismatch)
       409 account already has a role (AUTH-049, NEW idempotency backstop)
       role in {player, parent}:
         400 no playerLookupEmail
         400 no player match
         else: app_metadata { role, approved:true, player_id, linkedIdentities? } → { approved:true }
       role === academy_admin:
         409 if academyName already exists (NEW, AUTH-048)
         else: app_metadata { role, approved:false } + user_requests insert + notify-admin → { approved:false }
       role === coach:
         app_metadata { role, approved:false } + user_requests insert + notify-admin → { approved:false }
```

### (c) NEW — Public player self-registration (/register)

```
1. Visitor enters a shared code → POST /api/public-register-player { code, validateOnly:true }
     invalid/missing code → 403, stays locked
     valid → unlocked, GET /api/public-register-player?code=... fetches
       { players: [completed, name+ageGroup only], pending: [pre-entered names, no email yet] }
2a. If `pending` has entries and none selected yet → "Find your child" list screen
      pick a pending entry → pre-fill name, remember playerId
      or "My child isn't listed" → register fresh (playerId = "")
2b. If `pending` is empty → skip straight to the form (playerId = "")
3. Fill form: name, email, phone, ageGroup (fixed list), bowlingStyle (fixed list), club?
4. POST /api/public-register-player { code, playerId?, name, email, phone, ageGroup, bowlingStyle, club }
     403 invalid code (re-checked server-side)
     400 any required field missing/invalid
     playerId present → must match a players row with the SAME code (404 otherwise) → UPDATE that row
     playerId absent → INSERT new players row into the one hardcoded TARGET_ACADEMY_ID's roster
5. "Registered!" screen — no Supabase Auth account was created at any point in this flow.
   Separately, "use this same email at /signup" to actually get a login later (per the form's own hint text).
```

### (d) Admin approval of a pending user (CHANGED in two sub-branches, order otherwise unchanged)

```
Auth: caller must be platform_admin, resolved from app_metadata (CHANGED) — else 403
1. Load user_requests row by id → 404 if not found
2. role in {player, parent}: resolve player_lookup_email → players.id (400s as before)
   role === coach: match coaches by email, OR CREATE a new coaches row if none matches (NEW, AUTH-024)
3. request_type === "link":
     resolve existing_user_id → 404 + auto-dequeue if gone
     seed linkedIdentities from existing array or current single identity
     dedup: (role, playerId) pair for player/parent, role-only for academy_admin/coach (CHANGED, AUTH-025)
     updateUserById(..., { app_metadata: {...meta, linkedIdentities} })  // CHANGED: was user_metadata
     delete user_requests row → { success: true }  (no email, no email_confirm touch)
   request_type !== "link" ("new"):
     find real Auth user by email → 404 + auto-dequeue if none
     updateUserById(authUser.id, { app_metadata: extraMeta, email_confirm: true })  // CHANGED
     delete user_requests row
     best-effort approval email (unchanged)
```

### (e) Password reset — unchanged from before this merge (see AUTH-033/034)

### (f) Role switching — unchanged mechanism, `app_metadata` data source (see AUTH-030)

### (g) The "order of checks" pattern — verified per route (the specific ask for this session)

| Route | Check 1 | Check 2 | Check 3 | Check 4 | Check 5 |
|---|---|---|---|---|---|
| `complete-signup` | 400 fields missing | 400 invalid role | 500 no service key | 400 identity mismatch | 409 already has role → role branch |
| `public-register-player` GET | 403 invalid code | 500 no service key | — | — | — |
| `public-register-player` POST | 403 invalid code | (early-return if `validateOnly`) | 400 fields missing/invalid | 500 no service key | 404 (playerId branch) / 500 (fresh branch) |
| `check-existing-account` | 400 email missing | 500 no service key | 500 listUsers error | — | — |
| `lookup-player` | 400 email missing | 500 no service key | — | — | — |
| `request-additional-role` | 400 fields missing | 500 no service key | 404 no existing account | 403 wrong password | 409 already has role |
| `confirm-consent` | 401 not signed in | 403 wrong role | 400 no player_id | 500 no service key | 403 age-gate (player only) |
| `switch-role` | 400 role missing | 401 not signed in | 403 identity not linked | 500 no service key | 500 update error |
| `approve-user` | 400 userId missing | 403 not platform_admin | 500 no service key | 404 request not found | role/request-type branches |
| `reject-user` | 400 userId missing | 403 not platform_admin | 500 no service key | (fetch, no explicit 404) | 400 delete error |
| `pending-approvals` | 403 not platform_admin | 500 no service key | 500 query error | — | — |
| `reactivate-player` | 400 playerId missing | 403 wrong role | 500 no service key | 404 player not found | 403 academy scoping |
| `invite-coach` | 400 fields missing | 403 wrong role (incl. not-signed-in) | 500 no service key | 400 invite error | 400 metadata error |
| `players/linked-names` | 400 playerIds missing | 401 not signed in | (filter to own ids) | 500 no service key | — |

**Finding:** In every route above, a *role/permission* check either comes first or immediately after the most basic "is a required field even present" check, and always **before** any resource-existence (404) or deeper-validation check. This ordering is consistent with the prior analysis's description of the same routes — i.e., **the order itself did not change in this merge.** What changed is the field each permission check reads (`app_metadata` vs `user_metadata`, AUTH-051), which is why a stale test fixture that only sets `user_metadata` now makes these same routes *appear* to return "403 in a new place" — the route's role resolves to `undefined` against such a fixture and 403s where the test expected a 200. See §8 for concrete evidence.

---


---

## PLAYER — Player — Players, Sessions, Video/Pose Pipeline, Reports, Performance

*Source: [`domains/player.md`](./domains/player.md)*


### (a) New session video upload, end to end (CHANGED steps marked)

```
Coach opens /players/[id]/new-session
  → canAccessPlayerServer(id) fails → 404 (page never renders)
  → fetchSessionPacks([playerId]) → activePack (if any Active pack exists)
  → fetchActivePlans() → plans[]                                   [CHANGED — new fetch]
Coach fills date/type/notes/RPE, selects 0–3 video files
  For each selected file: probeVideoQuality → "ready" (warnings non-blocking) or "invalid" (blocks)
Coach clicks "Save Session"
  Blocked if: any angle "invalid", OR any angle still "checking"
  sessionsLimit = sessionsLimitForPlan(player.subscription.plan, plans)        [CHANGED — 2-arg]
  limitReached check:
    sessionsLimit !== null AND sessionsUsed >= sessionsLimit
      AND NOT (canUsePack AND drawFromPack checked)
    → true: form replaced by "Monthly session limit reached" + upgrade link — NOTHING saved
    → false: proceed
  For each selected video (front, side, back in that order):
    transcodeToH264(file) → success: transcoded MP4 | failure: original file, transcoded=false
    if uploadFile.size > 50MB → throw "…MB exceeds the 50MB upload limit…" — submit aborts   [NEW check]
    POST /api/storage/sign-upload { path } — bucket created with NO size override (global 50MB cap)  [CHANGED]
      caller cannot access player → 403 → whole submit aborts
    supabase.storage.uploadToSignedUrl(...) — failure aborts, earlier-uploaded angles orphaned
  xpEarned = 50 + videos.length * 20
  insertSession(...) — ball_speed_kmh/front_knee_angle_deg start null
  recordSessionCompletion(playerId, xpEarned, packId if canUsePack && drawFromPack)
  Success → "✓ Session Saved" → redirect to /players/[id] after 1.2s
```

### (b) AI report generation — eligibility gating (CHANGED — now 3-way eligibility, still 4-way UI)

| State | Condition | Button shown | Action on click |
|---|---|---|---|
| 1. Already generated | `reportStatus[session.id] === "success"` | "✓ View Report" (link) + "🔄 Regenerate" | Regenerate re-runs the full pipeline, inserts a **new** report row (`review_status: "not_reviewed"`) |
| 2. Not eligible, has credit | `!aiReportsIncludedForPlayer(player) && player.assessmentCredits > 0` | "🎫 Use Assessment Credit (N left)" | Runs pipeline with `useAssessmentCredit: true`; server re-validates & decrements credit |
| 3. Not eligible, no credit | `!aiReportsIncludedForPlayer(player)` and credits `<= 0` | "🔒 AI Report (Upgrade)" (link to subscription) | Navigates away — no generation attempted |
| 4. Eligible | `aiReportsIncludedForPlayer(player)` true | "✨ Generate AI Report" | Runs pipeline with `useAssessmentCredit: false` |

`aiReportsIncludedForPlayer(player)` (CHANGED, §PLAYER-025):
```
canGenerateAiReports(player.subscription.plan, plans)                          → true?  eligible
  OR (academy owning player has waivesSessionFees plan
      AND (plan.accessDurationMonths == null OR academy.accessExpiresAt > now)) → true?  eligible   [NEW clause]
  OR (player.coachId is an independent coach (no academyId)
      AND canGenerateAiReportsForCoach(coach.subPlan, plans))                   → true?  eligible   [NEW clause]
  else                                                                                    not eligible
```

### (c) AI report generation → coach review → email (CHANGED — review step is new; auto-email removed)

```
Coach clicks Generate/Regenerate/Use-Credit  (pipeline itself: unchanged, see old §4c mechanics)
  ...pose extraction / biomechanics / skeleton overlay / ball tracking / calibration (unchanged)...
  POST /api/ai-report { ... }
    success → reports.insert with review_status: "not_reviewed"     [CHANGED — was auto-emailed here]
             → player/session biomechanics snapshot refreshed (unchanged)
             → PDF generated + uploaded to session-reports (unchanged), but NOT emailed
             → reportStatus[session.id] = "success"

Coach later opens the report (Reports page or player's Reports tab) and reviews it:
  ReportReview shows "Not Reviewed" badge, editable summary/highlight
  Coach clicks "Save & Mark Under Review" → POST /api/reports/review { reviewStatus: "under_review", ... }
    → review_status = "under_review", reviewed_at/reviewed_by set        (still invisible to player/parent)
  Coach clicks "Save & Complete" (from either state) → POST /api/reports/review { reviewStatus: "completed", ... }
    → review_status = "completed", reviewed_at/reviewed_by set
    → report now visible to the player/parent on players/[id]/reports
    → "Email Report" button in ReportActions becomes enabled
Coach clicks "Email Report" (ReportActions)
  POST /api/reports/send-email { reportId, playerId }
    review_status !== "completed" → 400 "This report hasn't completed coach review yet."   [NEW gate]
    (all other validation unchanged: 400/401/403/404/400-no-email/502)
    success → PDF (if one exists) attached and sent
Coach can "Reopen for Edits" on a completed report → back to "under_review", summary/highlight text unchanged
```

### (d) AI action-plan generation — unchanged from prior analysis (see PLAYER-039/040)

### (e) Report deletion / regeneration interaction — unchanged from prior analysis (see PLAYER-018/032/033); deleting a report does not touch review-status history since the row itself is gone

### (f) Attendance roster + recording (CHANGED — pack gate + CSV import added)

```
Coach opens a group's edit modal, tries to add player P to the roster
  hasActivePackFor(P.id)?
    false → inline error "P has no active session pack for {type} — create one first." — P NOT added
    true  → P added to draft.playerIds
Coach imports a roster CSV (name,email)
  each row matched to a player (email preferred, else name)
  matched players filtered again by hasActivePackFor → only those merged into draft.playerIds
  players skipped for no-pack are reported by name in an inline message
Coach saves the group → upsertGroupSession + setGroupSessionRoster (full replace) — unchanged

Coach takes attendance for one date (manual) → unchanged pack-draw-down mechanism (PLAYER-019/046)

Coach imports an attendance-history CSV (date,player,status) for one group
  each row: normalize date → match player against THIS GROUP'S roster only → parse status
  duplicate (player,date) within the file → first kept, rest marked "duplicate", not written twice
  invalid rows marked "skipped" with a reason, excluded from import
  ready rows grouped by date, saveAttendance() called SEQUENTIALLY per date (not parallel)
    — avoids a read-then-write race on session_packs.sessions_used
  each row applies the same first-time-consumes-a-pack-slot rule as manual entry
```

---


---

## MKT — Marketplace — Coach Discovery, Bookings, Session Packs, B2C Stripe Commerce

*Source: [`domains/marketplace.md`](./domains/marketplace.md)*


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


---

## ADMIN — Academy & Platform Admin — Org Management, B2B Billing, Admin Surfaces

*Source: [`domains/academy_admin.md`](./domains/academy_admin.md)*


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


---

## PORTAL — Portal & Content — Player/Parent Portal, Academy Curriculum, Messaging

*Source: [`domains/portal_content.md`](./domains/portal_content.md)*


### 4a. Article unlock gate evaluation (unchanged from prior analysis)

```
isArticleUnlocked(article, plan, readCountByStage, hasLibraryAccess):
  → isStageUnlocked(article.stage, plan, readCountByStage, hasLibraryAccess)

isStageUnlocked(stage, plan, readCountByStage, hasLibraryAccess):
  IF stage == "Foundation": RETURN true
  IF NOT isPaidPlan(plan) AND NOT hasLibraryAccess: RETURN false
  req = UNLOCK_REQUIREMENT[stage]
  IF req is undefined: RETURN true
  RETURN readCountByStage[req.afterStage] >= req.count
```

### 4b. Reading an article → XP → badge → stage progression (unchanged)

```
1. INSERT article_reads (id = playerId_articleId)
   ├─ 23505 → return {alreadyRead:true, xpAwarded:0}
   └─ other error → throw
2. Fetch player row + full article_reads for player
3. xp = XP_PER_ARTICLE[article.stage]
4. IF stageReadCount(article.stage) == stageTotal(article.stage): xp += 500
5. IF total distinct reads == 29: xp += 1000
6. newStage = currentUnlockedStage(plan, readCountByStage, hasLibraryAccess)
7. UPDATE players: xp, acad_xp, acad_articles_read, acad_completion_percent, acad_stage
8. Return {alreadyRead:false, xpAwarded}
```

### 4c. Sending a message to a player/parent (individual, via `MessageModal`) — unchanged

```
1. Client validation: body non-empty; subject non-empty IF channel==email
2. POST /api/send-message or /api/send-sms → delivery
3. On success: insertMessage(...) — awaited, no try/catch; a log-write failure here throws
   unhandled and leaves the UI stuck (PORTAL-GAP-008)
4. Show "sent" confirmation
```

### 4d. Portal home data load (player vs parent role) — unchanged

```
1. IF !user.playerId: render "No player linked to this account" (both roles, identical)
2. Parallel fetch: player, sessions, reports, todaysTip, sessionPacks (role-agnostic)
3. recordTipView(playerId) fired identically for BOTH roles — a parent viewing the dashboard
   advances the child's tip streak (PORTAL-GAP-009)
4. Consent card is the only role-branched UI element
```

### 4e. Public Contact form submission (NEW)

```
Input: name, email, message (all required client-side via HTML5 `required`)
1. Client: preventDefault, setSending(true), clear error
2. POST /api/contact {name, email, message}
   Server:
     a. 400 if any of name/email/message falsy
     b. 500 "Contact form isn't configured on this deployment." if GMAIL_USER,
        GMAIL_APP_PASSWORD, or PLATFORM_ADMIN_EMAIL unset
     c. build transporter (Gmail/nodemailer)
     d. sendMail({from: CRIC HQ shared mailbox, to: "support@crichq.com.au" (hardcoded),
        cc: PLATFORM_ADMIN_EMAIL, replyTo: <submitted email, unverified>,
        subject: `Contact form — ${name}`, text: plain fallback,
        html: buildContactFormEmailHtml(...) from lib/email-templates.ts})
     e. 500 with error message on sendMail() rejection; 200 {success:true} otherwise
3. Client: on !res.ok || data.error → inline error, form remains editable, NOT sent
   on success → replace form with a permanent "✓ Thanks…" confirmation (no reset/retry path,
   no "submit another message" option)
4. No DB write occurs at any point in this flow — nothing to look up or audit later if the
   email never arrives (spam-filtered, bounced, etc.)
```

---


---

## PAY — Payments Core — Stripe Webhook, Cron, Invoicing, AI Coach Chat

*Source: [`domains/payments_core.md`](./domains/payments_core.md)*


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


---

