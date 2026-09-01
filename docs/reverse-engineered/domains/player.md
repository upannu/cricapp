# Player Domain — Reverse-Engineered Requirements

**Scope:** Players, Sessions (3-angle video upload + client-side pose/biomechanics AI pipeline), Reports (incl. AI report generation and the coach report-review workflow), Performance dashboard, Attendance, Action Plans, S&C log, video annotation/voice notes/assessments, badges/XP, and the new player-record API routes (last-payment, linked-names, notify-added, update-currency).

**Repo:** `c:\Development\Cricket\CricApp` (`web/` = Next.js 16 / React 19, Supabase, Stripe, Anthropic).

**Method:** This document supersedes a prior (now stale) analysis after a 120-commit merge from `origin/master` (~133 files changed) landed today. Every requirement below was re-derived by reading the CURRENT source files listed in each requirement's "Source"/"Component" field — not carried over from the old document without re-verification, and not inferred from existing test assertions (many are now failing against this new code and are cited only as historical-intent hints, never as current spec). The single most consequential change in this domain is documented first in §9 and referenced throughout: `lib/plan-features.ts`'s gating functions (`canGenerateAiReports`, `canUseMarketplace`, `sessionsLimitForPlan`, `chatMessagesLimitForPlan`, and their coach-side equivalents) now take a **second `plans: Plan[]` argument** and resolve limits from the admin-editable Plan Catalog (`plans` table) instead of hardcoded tier logic. The second major cross-cutting change is that every RBAC field this domain's server routes read (`role`, `approved`, `academy_id`, `coach_id`, `player_id`, `linkedIdentities`) now comes from Supabase `user.app_metadata` (server-only), not the old client-writable `user_metadata` — confirmed directly in `lib/server-auth.ts` and every new/changed API route in this domain.

Statements not directly observed in code are marked **INFERRED**; statements that could not be confirmed are marked **UNKNOWN**; behavior that changed materially since the prior analysis is marked **CHANGED**; behavior present before that could not be found in the current code is marked **REMOVED**.

---

## 1. Domain Overview

The Player domain is the operational core of CRIC HQ: it is where a coach (or academy/platform admin) logs a bowling session, uploads up to three camera-angle videos of a delivery, and turns that footage into an AI-generated biomechanics report — computed from real, client-side (in-browser) pose-tracking geometry, not an LLM guess. A report generated today is no longer immediately visible to the player/parent it's about, nor auto-emailed to them (**CHANGED** — see PLAYER-061/062): it now sits in a coach-review workspace (Not Reviewed → Under Review → Completed) until a coach explicitly completes review, at which point emailing and player/parent visibility unlock. From there the domain covers everything downstream of a session: performance trend dashboards (injury-risk trend, RPE training load), action plans (manually authored or AI-generated from a report's flagged issues), a strength & conditioning log, attendance for recurring group sessions (now gated on the player already holding an active session pack — **CHANGED**, see PLAYER-045), and lightweight coach workflow tools (video markup/annotation, voice notes, formal 1–5 assessments) plus gamification (XP, badges).

Also new this merge: a small independent-coach self-service slice (add a player to your own roster, capped by your Coach-Pro-vs-Free roster limit — PLAYER-056), a multi-currency layer for player-facing pricing (PLAYER-060), and three narrowly-scoped player-record API routes (`last-payment`, `linked-names`, `update-currency`) that back small UI affordances on the profile/edit/subscription pages.

**Actors:**
- **Coach** — owns a roster of players; full read/write on their own players' sessions, reports (incl. review), action plans, attendance, S&C logs. An independent coach (no academy) can now also add new players directly to their own roster, capped by their own plan (PLAYER-056).
- **Academy admin** — same as coach, scoped to all players in their academy (looked up via `academies.player_ids`, since players don't carry an `academy_id` column). Can also review reports.
- **Platform admin** — unrestricted access to all players; can reactivate any disabled player and set any player's currency.
- **Player / Parent** — still hard-redirected out of every coach-facing page in this domain **except** one new carve-out: their own `/players/[id]/subscription` page (**CHANGED**, see PLAYER-008/066). On that one page they can now also reach an academy player's version of the page to buy add-ons (Library, Assessment credits) — previously academy players were redirected away from it entirely. Player/parent viewers of `/players/[id]/reports` now only ever see reports whose coach review is `completed` (**NEW**, PLAYER-062).

**Boundaries:** Player identity/CRUD basics (name, contact, bowling style, subscription fields) live here, but bulk player creation (CSV import) is still implemented in `AcademyClient.tsx` (Academy domain), not here. Authorization primitives (`callerCanAccessPlayer`, `canAccessPlayerServer`, `getCaller`) are implemented in `lib/server-auth.ts` / `lib/supabase-server.ts` and documented in full by the Auth domain; this document only describes how Player-domain routes/pages consume them, and confirms (by direct read of every route below) that they now resolve exclusively from `user.app_metadata`.

---

## 2. Implemented Requirements

### Player identity, status, authorization

**PLAYER-001 — Player list view with role-scoped roster**
- Category: Functional / Security-Authorization
- Description: Coaches see only their own players; academy admins see their academy's roster; platform admins see everyone. Shows a stats strip (Active Players, Active Subscriptions, Expiring in 7 Days, Total Sessions), a sortable table, and bulk/individual messaging.
- Component: `web/components/PlayersClient.tsx`; data via `lib/db.ts:fetchPlayers(coachId?, academyId?)`.
- Business rule: `fetchPlayers` scopes by `coach_id` column when a coachId is given; for an academy it first reads `academies.player_ids` then does an `.in("id", playerIds)` lookup (players have no `academy_id` column). Unchanged from prior analysis.
- Status: IMPLEMENTED.

**PLAYER-002 — Player status derivation (Active / Expiring / Expired)**
- Category: Business Rule
- Description: A player's subscription status is a pure function of `subscription.endDate` versus today — not a stored field.
- Component: `lib/utils.ts:getPlayerStatus(endDate)`.
- Business rule: `daysLeft = (endDate - now) / 1 day`. `daysLeft < 0` → `Expired`; `daysLeft <= 7` → `Expiring`; else `Active`.
- Status: IMPLEMENTED. Unchanged.

**PLAYER-003 — Player profile view (CHANGED — new staff-only "Last payment date" card)**
- Category: Functional
- Description: Single-player dashboard: identity header, quick-action links (Reports, Action Plans, S&C Log, Manage Subscription [non-academy only], New Session), a 2×2+ info grid (Subscription [non-academy only], Latest Biomechanics snapshot, Academy Progress, Badges), Contact & Profile card (now including a staff-only "Last payment date" row — **NEW**), invoice history (academy players only), and a Performance Trends panel.
- Component: `web/components/PlayerProfileClient.tsx`; page: `web/app/(dashboard)/players/[id]/page.tsx`.
- New behavior: on mount (for any viewer whose role isn't `player`/`parent`), fetches `GET /api/players/{id}/last-payment` and renders the resolved date + source (`manual`/`pack`/`stripe`) in the Contact & Profile card; shows "Loading…" while `lastPayment === undefined`, "Not recorded" when `null`. See PLAYER-058.
- Status: IMPLEMENTED.

**PLAYER-004 — Edit player (profile + subscription) (CHANGED — plan picker narrowed, new payment-date field)**
- Category: Functional / Validation
- Description: Coach-editable form for profile fields (name, email, phone, bowling style, age group, club, batting hand, playing level, height/weight, guardian consent) and subscription fields (plan, total sessions, start/end date, and now a staff-only Last Payment Date field).
- Component: `web/components/EditPlayerForm.tsx`; page `web/app/(dashboard)/players/[id]/edit/page.tsx`; persists via `lib/db.ts:updatePlayer(id, edits)`.
- **CHANGED**: the Plan `<select>` now only offers `["Free", "Player Pro"]` — Coach Pro was removed from the player-plan picker entirely (code comment: "Coach Pro is now a coach's own plan (see CoachSubscriptionPage), not something a player picks").
- **NEW**: staff-only (`isStaff = role !== "player" && role !== "parent"`) "Last Payment Date" field, pre-populated from `player.subscription.lastPaymentDate`; a helper line under it fetches `GET /api/players/{id}/last-payment` and explains whether a pack/Stripe payment already takes priority over this manual value (see PLAYER-058). The manual value is only sent to `updatePlayer` when `isStaff` is true, even though the field is never rendered for a player/parent anyway.
- Validation: `name`/`email` HTML-required; height/weight parsed as float or `null` if blank; sessions limit parsed as int or `null` (unlimited) if blank. Unchanged.
- Status: IMPLEMENTED.

**PLAYER-005 — Auto-computed subscription end date**
- Category: Business Rule / UI
- Description: If a coach sets "Total Sessions" and picks a "Weekly Sessions" frequency, the end date auto-recomputes as `startDate + ceil(totalSessions / weeklySessions) weeks`, shown with a green "Auto" badge; the coach can still override the resulting date manually (immediately overwritten again if either dependency changes).
- Component: `EditPlayerForm.tsx` (`useEffect` on `[startDate, sessionsLimit, weeklySessionsPerWeek]`).
- Status: IMPLEMENTED. Unchanged.

**PLAYER-006 — Player account reactivation**
- Category: Security-Authorization / Business Rule
- Description: A player whose login was disabled (`loginDisabled`) can be re-enabled only by a platform admin or the academy admin owning that player.
- Component: `web/app/api/reactivate-player/route.ts`.
- Permissions: `caller.app_metadata.role !== "platform_admin" && !== "academy_admin"` → 403 (**CHANGED source field** — reads `app_metadata`, not `user_metadata`; confirmed by direct read). An academy admin is further restricted to players inside `academies.player_ids` for `caller.app_metadata.academy_id` → 403 otherwise.
- Effect: clears `login_disabled`, `disabled_at`, `disabled_reason`.
- Note: still no reactivate UI button found inside this domain's own components — entry point remains **UNKNOWN** from this domain's files (INFERRED: an admin/academy roster screen outside this domain's scope).
- Status: PARTIALLY_IMPLEMENTED (API confirmed and re-verified against the new auth source; UI entry point not located in this domain).

**PLAYER-007 — Server-side player-access authorization for every Player-domain page**
- Category: Security-Authorization
- Description: Every Player-domain server page (`players/[id]`, `.../edit`, `.../new-session`, `.../reports`, `.../action-plans`, `.../sc-log`, `.../subscription`) gates on `canAccessPlayerServer(id)` before rendering, returning Next's `notFound()` (404) rather than an authorization error page when denied.
- Component: `lib/supabase-server.ts:canAccessPlayerServer`. Re-verified directly against all 7 current `app/(dashboard)/players/[id]/**/page.tsx` files (including `academy/page.tsx`, not individually re-read in depth this pass but sharing the same import pattern).
- Status: IMPLEMENTED. Unchanged pattern.

**PLAYER-008 — Player/Parent roles are hard-redirected out of every coach-facing Player-domain route, with one new carve-out (CHANGED)**
- Category: Security-Authorization / Business Rule
- Description: `AuthGuard.tsx` still redirects any signed-in `player`/`parent` role to `/portal` for any path not starting with `/portal` — **except** their own subscription page.
- **CHANGED**: `AuthGuard.tsx` now has `const isOwnSubscriptionPage = !!user.playerId && pathname === \`/players/${user.playerId}/subscription\`;` and the redirect condition is `isPlayerOrParent && !pathname.startsWith("/portal") && !isOwnSubscriptionPage`. A player/parent can now load their own `/players/[id]/subscription` page directly (still redirected from every other coach-facing route: `/players`, `/players/[id]`, `/players/[id]/new-session`, `/sessions`, `/reports`, `/performance`, `/attendance`, `/players/[id]/action-plans`, `/players/[id]/sc-log`, any *other* player's subscription page).
- Component: `web/components/AuthGuard.tsx`.
- Status: IMPLEMENTED. See also PLAYER-066 for why (academy players' new ability to buy add-ons).

---

### Session creation, video upload, quality/transcode pipeline

**PLAYER-009 — New session form with 3 optional camera-angle video slots**
- Category: Functional
- Description: A coach records session metadata (date, type, notes, RPE 1–10) and may attach 0–3 videos (front/side/back). No angle is required.
- Component: `web/components/NewSessionForm.tsx`.
- Status: IMPLEMENTED. Unchanged.

**PLAYER-010 — Client-side video quality probe (non-blocking warning only)**
- Category: Validation / Business Rule
- Description: `probeVideoQuality` reads `<video>` metadata and estimates FPS. Resolution below 1920×1080 or FPS below 50 produces a warning but never blocks; only a genuinely unreadable file blocks.
- Component: `lib/video-quality.ts`; consumed by `NewSessionForm.tsx:qualityWarning()`.
- Status: IMPLEMENTED. Unchanged.

**PLAYER-011 — Client-side transcode to H.264 MP4, with silent fallback to the original file**
- Category: Functional / Error-Handling
- Description: Every selected video is transcoded via `ffmpeg.wasm` to H.264 MP4 (1920×1080 cap, `libx264 veryfast crf23`, AAC 128k, `+faststart`); a transcode failure falls back to uploading the original file, non-fatally.
- Component: `lib/transcode.ts:transcodeToH264`; caller `NewSessionForm.tsx:handleSubmit`.
- Status: IMPLEMENTED. Unchanged.

**PLAYER-012 — Signed-upload flow to Supabase Storage (CHANGED — no bucket-level size override)**
- Category: API / Security-Authorization
- Description: Each video is uploaded directly to the `session-videos` bucket via a short-lived signed URL, bypassing the Next.js/Vercel request-body size limit. Path convention: `<playerId>/<sessionId>/<angle>.<ext>`.
- Component: `web/app/api/storage/sign-upload/route.ts` + `NewSessionForm.tsx`.
- **CHANGED**: `createBucket` is now called with `{ public: true, allowedMimeTypes: [...] }` and **no `fileSizeLimit` override** (previously 500MB per the stale analysis). Code comment explains why: requesting a bucket-level limit *higher* than the Supabase project's own global storage cap (52,428,800 bytes / 50MB on the Free plan this project is on) made bucket creation itself silently fail, so every upload then failed downstream with an opaque "related resource does not exist" error. The bucket now simply inherits the project's global 50MB cap, and `NewSessionForm.tsx` enforces the same 50MB (`MAX_UPLOAD_BYTES = 50 * 1024 * 1024`) client-side *after* transcoding, throwing a clear `"…MB exceeds the 50MB upload limit…"` error instead of letting an oversized upload fail with a raw storage-API error. See BR-6b.
- Authorization: unchanged — the route derives the target player from `path.split("/")[0]` and calls `callerCanAccessPlayer` (403 if denied).
- Status: IMPLEMENTED.

**PLAYER-013 — Session save + XP award formula**
- Category: Business Rule
- Description: `xpEarned = 50 + videos.length * 20` (50–110 XP per session).
- Component: `NewSessionForm.tsx:handleSubmit` → `lib/db.ts:insertSession`, then `recordSessionCompletion`.
- Status: IMPLEMENTED. Unchanged.

**PLAYER-014 — Session-pack draw-down vs. Free-plan monthly session limit (CHANGED — plan cap now sourced from the Plan Catalog)**
- Category: Business Rule
- Description: A player on an active `SessionPack` can draw a session from it instead of counting against the Free plan's monthly cap.
- **CHANGED**: `sessionsLimit = sessionsLimitForPlan(player.subscription.plan, plans)` — the function now takes the caller's already-fetched `plans: Plan[]` (via `fetchActivePlans()`, called once on mount) as a second argument and resolves the Free-tier cap from the `plans` table row with `slug === "free"` (`plan.sessionsPerMonthLimit`), falling back to a hardcoded `4` only if that Plan Catalog row is missing. See PLAYER-055/§9 for the full signature change.
- `limitReached = sessionsLimit !== null && sessionsUsed >= sessionsLimit && !(canUsePack && drawFromPack)`. `packRemaining = pack.totalSessions - pack.sessionsUsed + pack.sessionCredits`.
- Status: IMPLEMENTED.

**PLAYER-015 — `recordSessionCompletion` ledger update**
- Category: Data / Business Rule
- Description: Always increments `players.xp` and `players.sessions_count`. Increments `players.sub_sessions_used` only when no `packId` is passed; if `packId` is passed, increments `session_packs.sessions_used` instead.
- Component: `lib/db.ts:recordSessionCompletion(playerId, xpEarned, packId?)`.
- Status: IMPLEMENTED. Re-read in full — unchanged signature and logic.

**PLAYER-016 — Sessions list, filtering and stats**
- Category: Functional
- Description: Cross-player session list (role-scoped) with a stats strip and filters by search text, coach, player, session type.
- Component: `web/components/SessionsClient.tsx`; page `web/app/(dashboard)/sessions/page.tsx`.
- Status: IMPLEMENTED. Filter/stat logic unchanged; see PLAYER-020/025 for the AI-report parts of this same file.

**PLAYER-017 — Session RPE logging/editing (post-hoc)**
- Category: Functional
- Description: RPE (1–10) settable at creation or edited inline from the expanded session row; save failure reverts the optimistic UI update.
- Component: `SessionsClient.tsx:handleSetRpe` → `lib/db.ts:updateSessionRpe`.
- Status: IMPLEMENTED. Unchanged.

**PLAYER-018 — Session deletion (cascading)**
- Category: API / Business Rule / Error-Handling
- Description: Deletes a session's uploaded videos from Storage, any AI reports generated from that session (and their PDFs), then the session row.
- Component: `web/app/api/sessions/delete/route.ts`.
- Status: IMPLEMENTED. Re-read in full — logic, sequencing and error-handling unchanged from prior analysis.

**PLAYER-019 — Attendance-driven pack draw-down (distinct mechanism from session-creation draw-down)**
- Category: Business Rule
- Description: The first time an occurrence date is recorded for a player (Present or Absent — both consume the slot), it draws one session from that player's Active `SessionPack` matching `sessionType` + `academyId`, if one exists with remaining capacity. Toggling Present↔Absent afterward does not re-consume or refund.
- Component: `lib/db.ts:saveAttendance`.
- Status: IMPLEMENTED. Re-read in full — unchanged. See also PLAYER-045/046.

---

### AI report generation pipeline

**PLAYER-020 — AI report generation, end-to-end happy path**
- Category: Integration / Functional
- Description: From an expanded session row with at least one uploaded video, a coach triggers pose extraction → biomechanics computation → skeleton-overlay rendering → (optional) ball tracking → server-side Claude narrative → saved report + PDF.
- Component: `SessionsClient.tsx:handleGenerateReport`, orchestrating `lib/pose.ts`, `lib/biomechanics.ts`, `lib/skeleton-overlay.ts`, `lib/ball-tracking.ts`, `lib/pitch-map.ts`, then `POST /api/ai-report`.
- Angle selection: `ANGLE_PRIORITY = ["side", "front", "back"]`, unchanged.
- **CHANGED downstream effect** (not the pipeline itself): the report saved by this pipeline is no longer auto-emailed and is not visible to a player/parent viewer until a coach completes review — see PLAYER-031 (REMOVED) and PLAYER-061/062.
- Status: IMPLEMENTED.

**PLAYER-021 — Pose-detection failure rejection path**
- Category: Error-Handling / Validation
- Description: If `extractPoseSequence` returns fewer than 6 successfully-detected frames, generation aborts with: *"Couldn't confidently detect a bowler in this clip — try a clearer, well-lit, unobstructed side-on video."*
- Component: `SessionsClient.tsx:handleGenerateReport`.
- Status: IMPLEMENTED. Unchanged; this remains the only pose-pipeline path with automated (E2E) coverage.

**PLAYER-022 — Biomechanics metric computation engine**
- Category: Functional / Business Rule
- Description: Computes ~19 geometric metrics from 3D pose-landmark trajectories across 4 zones (approach, delivery stride, release, follow-through).
- Component: `lib/biomechanics.ts:computeBiomechanics(frames, bowlingStyle)`.
- Status: IMPLEMENTED. `GUIDELINE_RANGES`, `scoreAgainstRange`, zone/overall scoring re-verified byte-for-byte against the prior analysis — unchanged.

**PLAYER-023 — Bowling action-type classification (Side-on / Front-on / Mixed)**
- Category: Business Rule
- Description: `classifyActionType(shoulderHipSepAtFFC, hipAngleFromApproachAtBFC)`: separation `> 35°` → `"Mixed"`; unknown hip angle → `"Mixed"`; else within 35° of 90° → `"Side-on"`, else `"Front-on"`.
- Component: `lib/biomechanics.ts:classifyActionType`. Re-read — formula byte-for-byte unchanged.
- Status: IMPLEMENTED.

**PLAYER-024 — Injury-risk-band classification (Low / Moderate / High)**
- Category: Business Rule
- Description: `breached` = count of 4 watched metrics with score `< 40`; `borderline` = count `< 60`. `breached >= 2` → `High`; `breached >= 1` OR `borderline >= 2` → `Moderate`; else `Low`.
- Component: `lib/biomechanics.ts:classifyInjuryRisk`. Re-read — unchanged.
- Status: IMPLEMENTED.

**PLAYER-025 — AI report generation gating (CHANGED SUBSTANTIALLY — now a 3-way eligibility check, not just plan-or-waiver)**
- Category: Business Rule / UI
- Description: The report-generation button in `SessionsClient.tsx` branches on `reportStatus`, `aiReportsIncludedForPlayer(player)`, and `player.assessmentCredits`.
- **CHANGED** `aiReportsIncludedForPlayer(player)` now returns `true` if **any** of:
  1. `canGenerateAiReports(player.subscription.plan, plans)` is true (Player Pro / Coach Pro on the player's own Plan Catalog row), **or**
  2. the player belongs to an academy whose active plan (`academy.planId`) has `waivesSessionFees: true`, **and** the plan is either unrestricted (`accessDurationMonths == null`) or the academy is still within its AI-monitoring window (`academy.accessExpiresAt` in the future) — **NEW**: a `waivesSessionFees` plan with `accessDurationMonths` set (e.g. a yearly-billed board license with a shorter software-access window) now only grants AI reports for that shorter window per cycle, even though the session-fee waiver and the subscription itself remain active the whole cycle, **or**
  3. **NEW**: the player's coach is an *independent* coach (no `academyId`) on a plan for which `canGenerateAiReportsForCoach(coach.subPlan, plans)` is true — i.e. an independent coach's own Coach Pro subscription now covers AI reports for every player on their roster, not just players who personally hold Player Pro.
- Component: `SessionsClient.tsx:aiReportsIncludedForPlayer`; `lib/plan-features.ts:canGenerateAiReports`, `canGenerateAiReportsForCoach`.
- The 4-way UI decision table itself (Already generated / no-access-has-credit / no-access-no-credit / has-access) is otherwise unchanged — see §4(b).
- Status: IMPLEMENTED.

**PLAYER-026 — Server-side assessment-credit re-validation and spend**
- Category: Security-Authorization / Business Rule
- Description: Spending a real purchased assessment credit is re-validated and decremented server-side before generation work happens.
- Component: `web/app/api/ai-report/route.ts` — `credits <= 0` → `402 Payment Required`.
- Status: IMPLEMENTED. Unchanged.

**PLAYER-027 — Ball tracking + pitch map (front-camera only, calibration-gated)**
- Category: Functional / Business Rule
- Description: Classical CV ball tracking; never fabricates a result (`confidence: "none"` below `MIN_TRAJECTORY_POINTS=6`); real-unit speed/length/line require a saved `CameraCalibration`.
- Component: `lib/ball-tracking.ts:trackBall`. Re-read — `MIN_TRAJECTORY_POINTS`, `"high"`/`"low"`/`"none"` confidence thresholds unchanged.
- Status: IMPLEMENTED.

**PLAYER-028 — One-time camera calibration per academy/angle**
- Category: Functional / Data
- Description: Coach marks two reference points (default 20.12m) once per academy/front-camera; reused automatically for future reports.
- Component: `web/components/CameraCalibrationModal.tsx`; `lib/db.ts:upsertCameraCalibration`.
- Status: IMPLEMENTED. Unchanged.

**PLAYER-029 — AI coaching narrative via Claude (grounded, not measurement-generating)**
- Category: Integration
- Description: `POST /api/ai-report` sends already-computed metrics/flags/zone-scores (plus skeleton-overlay JPEGs) to Claude for narrative summary, tags, highlight, and (if unmeasured) a visual speed estimate only.
- Component: `web/app/api/ai-report/route.ts`; model `claude-opus-4-8`, `thinking: { type: "adaptive" }`, `output_config.format: json_schema`.
- Status: IMPLEMENTED. Prompt, schema, and model unchanged from prior analysis.

**PLAYER-030 — Report PDF generation and storage**
- Category: Functional
- Description: Multi-page PDF (headline/zones/summary/flags/tags/drills/disclaimer, skeleton-overlay grid, pitch map) uploaded to `session-reports/<playerId>/<reportId>.pdf`. A PDF failure never turns an otherwise-successful report generation into a 500.
- Component: `web/app/api/ai-report/route.ts:buildReportPdf`.
- Status: IMPLEMENTED. Unchanged.

**PLAYER-031 — Automatic report email on generation (REMOVED)**
- Category: Integration / Error-Handling
- Description (prior behavior): immediately after generating a report, if Gmail credentials were configured and the player had an email on file, the PDF was auto-emailed via `nodemailer`, best-effort.
- **REMOVED**: `web/app/api/ai-report/route.ts` no longer contains any `nodemailer`/`transporter.sendMail` call. The route's own trailing comment states why: *"Reports now require a coach review before the player/parent ever sees them — the PDF is generated here so a coach can preview it while reviewing, but it's no longer auto-emailed. Sending happens explicitly via the 'Email Report' action once a coach marks it Completed."* Every newly-generated report is inserted with `review_status: "not_reviewed"`.
- Status: REMOVED. Replaced by the explicit, review-gated send described in PLAYER-034 and the review workflow in PLAYER-061.

**PLAYER-032 — Report regeneration**
- Category: Functional / Business Rule
- Description: The "🔄 Regenerate" button re-runs the entire pipeline and inserts a **new** report row (id) — the previous report is not replaced or deleted.
- Component: `SessionsClient.tsx`.
- Status: IMPLEMENTED. Unchanged. A regenerated report also starts at `review_status: "not_reviewed"` (same insert path as first generation).

**PLAYER-033 — Report deletion**
- Category: API
- Description: Best-effort removes the report's PDF from Storage, then deletes the `reports` row.
- Component: `web/app/api/reports/delete/route.ts`.
- Status: IMPLEMENTED. Re-read in full — unchanged.

**PLAYER-034 — Manual report email send (CHANGED — now gated on completed coach review)**
- Category: API / Integration
- Description: A coach can send a report's PDF (best-effort attach) at any time from `ReportActions` — but only once the report's coach review is `completed`.
- **CHANGED**: `web/app/api/reports/send-email/route.ts` now selects `review_status` alongside the report and, immediately after the "report not found" check, returns `400 "This report hasn't completed coach review yet."` if `report.review_status !== "completed"`. This check runs *before* the player-not-found/no-email checks.
- Component: `web/app/api/reports/send-email/route.ts`; `web/components/ReportActions.tsx` — the "Email Report" button itself is now `disabled={emailing || reviewStatus !== "completed"}`, with a `title` tooltip explaining why when disabled, so a coach cannot even trigger the now-guaranteed-to-fail request from the UI in the first place.
- Full validation order (re-verified): missing `reportId`/`playerId` → 400; not signed in → 401; Gmail not configured → 500; `callerCanAccessPlayer` fails → 403; report not found → 404; **review not completed → 400 (NEW)**; player not found → 404; player has no email → 400; `sendMail` throws → 502.
- Status: IMPLEMENTED.

**PLAYER-035 — Reports list, filter, and coach→player grouping (CHANGED — review-status badge + inline review editor)**
- Category: Functional
- Description: Cross-player reports list with a stats strip, player quick-filter chips, type/search filters, and a collapsible coach→player→report hierarchy.
- **CHANGED**: each report row now shows a `ReportStatusBadge` (Not Reviewed / Under Review / Completed) next to its type badge, and the expanded card's "Full Analysis" panel is now the interactive `ReportReview` component (editable summary/highlight + status transitions) rather than a static summary paragraph — see PLAYER-061.
- Component: `web/components/ReportsClient.tsx`; page `web/app/(dashboard)/reports/page.tsx`.
- Status: IMPLEMENTED.

**PLAYER-036 — Speed leaderboard**
- Category: Functional
- Description: Derived ranking of players by peak `speedKmh` across their reports, with report counts.
- Component: `ReportsClient.tsx`.
- Status: IMPLEMENTED. Unchanged.

**PLAYER-037 — Player biomechanics snapshot refresh after report generation**
- Category: Business Rule / Data
- Description: Every successful report generation overwrites the player's "Latest Biomechanics" snapshot fields and back-fills `sessions.ball_speed_kmh`/`front_knee_angle_deg`.
- Component: `web/app/api/ai-report/route.ts`.
- Status: IMPLEMENTED. Unchanged.

---

### Report review workflow (NEW)

**PLAYER-061 — Coach report-review workflow: Not Reviewed → Under Review → Completed, with reopen (NEW)**
- Category: Functional / Business Rule / Security-Authorization
- Description: Every report now carries a `reviewStatus` (`not_reviewed` | `under_review` | `completed`), `reviewedAt`, `reviewedBy`. A coach/academy_admin/platform_admin (`canReview`) sees an editable workspace: draft `summary`/`highlight` textareas plus two buttons — "Save & Mark Under Review" and "Save & Complete" — each of which `POST`s the draft text and the target status to `/api/reports/review` together (so the status transition and any content edit are one atomic save). Once `status === "completed"`, the editor is replaced by a read-only rendering of the saved summary/highlight, with a "Reopen for Edits" link (`canReview` only) that saves status back to `under_review` (keeping the current summary/highlight text unchanged). A non-review-capable viewer (player/parent) always sees the read-only rendering, never the editor, regardless of status.
- Component: `web/components/ReportReview.tsx` (`ReportReview`, `ReportStatusBadge`); consumed by `ReportsClient.tsx`'s `ReportCard` (`canReview` always `true` there — coach/admin-only page) and `app/(dashboard)/players/[id]/reports/page.tsx` (`canReview` = server-computed viewer role).
- API: `POST /api/reports/review/route.ts` — validates `reportId`/`playerId`/`reviewStatus` present and `reviewStatus` is one of the 3 valid values (400 otherwise); requires sign-in (401) and `role` in `["coach","academy_admin","platform_admin"]` (403 — a player/parent cannot call this route even directly); re-checks `callerCanAccessPlayer` (403); updates `reports` row with `review_status`, `reviewed_at: now()`, `reviewed_by: caller.userId`, and `summary`/`highlight` only if explicitly present in the request body.
- Status: IMPLEMENTED.

**PLAYER-062 — Report visibility gating for player/parent viewers (NEW)**
- Category: Security-Authorization / Business Rule
- Description: On the player-scoped reports page, a player/parent viewer only ever sees reports whose `reviewStatus === "completed"` — a report sitting at `not_reviewed` or `under_review` is invisible to them, even though the underlying `fetchReportsServer` call itself returns all reports for the player (the filter is applied client-side of the server component, not at the query).
- Component: `app/(dashboard)/players/[id]/reports/page.tsx` — `const canReview = viewerRole === "coach" || "academy_admin" || "platform_admin"; const reports = canReview ? allReports : allReports.filter(r => r.reviewStatus === "completed");`. `getViewerRoleServer()` sourced from `lib/supabase-server.ts` (itself reading `app_metadata`, per the Auth-domain migration).
- Coach/admin viewers (reached via `ReportsClient.tsx`'s "All Reports for {player}" link, which lands on this same page) see every report regardless of status, since they need to review the unreviewed ones.
- Status: IMPLEMENTED. `REQUIRES VALIDATION`: `ReportsClient.tsx` itself (the cross-player Reports page) is coach/admin-only in practice today via `AuthGuard`'s player/parent redirect (PLAYER-008), so this page-level filter is currently the *only* enforcement point for review-gated visibility — there is no server-side RLS-level confirmation in this domain's own files that a player/parent could not fetch an unreviewed report through some other read path (e.g. a direct Supabase client query bypassing this page). Not confirmed either way from the files read for this domain.

---

### Action plans

**PLAYER-038 — Manual action plan CRUD**
- Category: Functional / Validation
- Description: Coach can add/edit/delete action plans: title (required, trimmed), priority, status, due date, dynamic drill list, coach notes.
- Component: `web/components/ActionPlansClient.tsx`; `lib/db.ts:upsertActionPlan`/`deleteActionPlan`.
- Status: IMPLEMENTED. Re-read in full — byte-for-byte unchanged from prior analysis.

**PLAYER-039 — AI-generated action plan from a report's flagged issues**
- Category: Integration / Business Rule
- Description: Given the most recent report with at least one drill-matched flagged issue, generates a plan title + notes via Claude, pre-populated with the already-matched drills.
- Component: `web/app/api/generate-action-plan/route.ts`; UI trigger `ActionPlansClient.tsx:generateAiPlan`.
- Status: IMPLEMENTED. Re-read in full — unchanged (model `claude-opus-4-8`, same `PLAN_SCHEMA`, same 400 on no-flags).

**PLAYER-040 — Action-plan priority derived from injury-risk band**
- Category: Business Rule
- Description: `High → High`, `Moderate → Medium`, `Low → Low` (default `Medium`); `dueDate = today + 14 days`.
- Component: `web/app/api/generate-action-plan/route.ts:PRIORITY_BY_RISK`.
- Status: IMPLEMENTED. Unchanged.

---

### Performance dashboard / trend analytics

**PLAYER-041 — Injury-risk trend computation and alerting**
- Category: Business Rule
- Description: Reconstructs injury-risk history from reports, computes `direction` (worsening/improving/stable/unknown), raises `alert` with a reason.
- Component: `lib/performance-trends.ts:computeInjuryRiskTrend`. Re-read in full — formulas byte-for-byte unchanged (most-recent-High, worsening-direction, or ≥2-of-last-3-non-Low alert triggers).
- Status: IMPLEMENTED.

**PLAYER-042 — RPE weekly training-load summary**
- Category: Business Rule
- Description: `weeklyLoad` = simple 7-day sum of session RPE; `recentAvg` = average of last 5.
- Component: `lib/performance-trends.ts:computeRpeSummary`. Unchanged.
- Status: IMPLEMENTED.

**PLAYER-043 — S&C weekly training load + ACWR-style spike alert**
- Category: Business Rule
- Description: Weekly load = Σ(duration × RPE) per Monday-start week; `acwr = currentWeekLoad / avg(last 3 completed weeks)`; alert when `acwr >= 1.5` with ≥2 prior weeks of history.
- Component: `lib/performance-trends.ts:computeSCLoadSummary`. Unchanged.
- Status: IMPLEMENTED.

**PLAYER-044 — Performance dashboard "Needs Attention" surfacing**
- Category: Functional / UI
- Description: Players with `riskTrend.alert === true` float to a dedicated section above the alphabetical main list.
- Component: `web/components/PerformanceClient.tsx`.
- Status: IMPLEMENTED. Unchanged.

---

### Attendance (recurring group sessions)

**PLAYER-045 — Recurring group session CRUD + roster (CHANGED SUBSTANTIALLY — roster now gated on an active pack; CSV roster import added)**
- Category: Functional / Business Rule / Validation
- Description: Coach/academy admin defines a weekly recurring group session and edits its roster (`setGroupSessionRoster` fully replaces the roster rows each save — delete-then-insert).
- **CHANGED**: adding a player to the roster (`toggleDraftPlayer`) is now blocked unless `hasActivePackFor(playerId)` is true — the player must already hold an Active `SessionPack` matching the group's own `sessionType` and the resolved `academyId` with remaining capacity (`totalSessions - sessionsUsed + sessionCredits > 0`). Attempting to add a player without one shows an inline error (*"{name} has no active session pack for {type} — create one first."*) and the toggle is refused (the player is **not** added). In the roster picker list, a player without a qualifying pack is rendered dimmed with a "No active pack" badge and a `title` tooltip, but is still clickable (the click just gets refused with the same error) — removing an already-selected player is always allowed regardless of pack status.
- **NEW**: "Import CSV" inside the create/edit group modal — a `name,email` CSV is parsed (PapaParse), each row matched against the coach/academy's players via `matchPlayerByNameOrEmail` (email preferred, falls back to name), and `handleRosterCsvMerge` adds only the matched players who **also** pass the same `hasActivePackFor` check, reporting how many were skipped and why.
- Component: `web/components/AttendanceClient.tsx`; `lib/db.ts:upsertGroupSession`, `setGroupSessionRoster`, `fetchGroupSessions`.
- Validation: name and coach still required client-side; academy resolution unchanged (`academyId` from scope / existing group / selected coach, unless `platform_admin`).
- Status: IMPLEMENTED.

**PLAYER-046 — Attendance recording per occurrence date, with pack draw-down**
- Category: Functional / Business Rule
- Description: For a given group + date, the coach marks each rostered player Present/Absent; saving upserts one `attendance_records` row per player and applies the pack-consumption rule from PLAYER-019.
- Component: `AttendanceClient.tsx` + `lib/db.ts:saveAttendance`, `fetchAttendanceForDate`.
- Status: IMPLEMENTED. Underlying mechanism unchanged; see PLAYER-064 for the new bulk-CSV alternative to this manual per-date flow.

**PLAYER-047 — Weekly occurrence-date generation window**
- Category: Business Rule
- Description: Upcoming attendance dates generated client-side for a fixed 8-week look-ahead (`WEEKS_AHEAD = 8`) via `occurrenceDatesInRange`.
- Component: `AttendanceClient.tsx`.
- Status: IMPLEMENTED. Unchanged.

**PLAYER-064 — Bulk attendance-history CSV import per group (NEW)**
- Category: Functional / Validation / Business Rule
- Description: From an expanded group's panel, a coach can import a `date,player,status` CSV covering any number of past dates/players in one action, instead of using the one-date-at-a-time "Take Attendance" modal (PLAYER-046) for historical backfill.
- Component: `web/components/AttendanceClient.tsx` (`handleAttendanceCsvFile`, `handleAttendanceCsvImport`).
- Business rules:
  - Date accepts either the app's own `YYYY-MM-DD` or `DD/MM/YYYY` (`normalizeCsvDate`); anything else is `csvStatus: "skipped"` with reason *"Invalid date — use YYYY-MM-DD or DD/MM/YYYY"*.
  - Player is matched only against the **importing group's own roster** (`matchPlayerByNameOrEmail` over `group.playerIds`, not the full player list) — a name/email not on this group's roster is skipped with *"Player not found in this group's roster"*.
  - Status must case-insensitively be "present" or "absent"; anything else is skipped with *"Unrecognized status ... — expected Present or Absent"*.
  - A duplicate `(playerId, date)` pair within the same file is flagged `csvStatus: "duplicate"` and **only the first occurrence is kept** for import (later duplicate rows are excluded from the actual write, though still shown in the preview table).
  - Only rows outside the roster for that date are left untouched — the import is additive per (player, date), not a full-roster replace for the imported dates.
  - Import calls are **sequential, not `Promise.all`**, keyed by date — explicit code comment: *"concurrent saveAttendance calls for the same player would race on session_packs.sessions_used (read-then-write, no row lock)"*. This means a large CSV import can be slow (one round-trip per distinct date, awaited in series) but is deliberately not parallelized to avoid a lost-update race on pack consumption.
  - Each imported row goes through the exact same `saveAttendance` / pack-draw-down logic as manual entry (PLAYER-019/046) — first-time-recorded consumes a pack slot regardless of Present/Absent, matching the group's `sessionType`+`academyId`.
- Status: IMPLEMENTED.

---

### S&C log

**PLAYER-048 — S&C workout CRUD + load summary**
- Category: Functional
- Description: Per-player log of strength & conditioning workouts, with a weekly load summary card (`computeSCLoadSummary`).
- Component: `web/components/SCLogClient.tsx`; `lib/db.ts:fetchSCWorkouts`, `upsertSCWorkout`, `deleteSCWorkout`.
- Status: IMPLEMENTED. Spot-checked against the prior analysis (imports, RPE clamp behavior) — unchanged.

---

### Video annotation / voice notes / assessments

**PLAYER-049 — Video markup/annotation**
- Category: Functional
- Description: Coach pauses an uploaded session video, freehand-draws (pen/arrow/circle, 5 fixed colors) on an overlay canvas, saves a flattened composite JPEG as a `VideoAnnotation`.
- Component: `web/components/VideoAnnotator.tsx`.
- Status: IMPLEMENTED. Spot-checked (props, colors, upload path pattern) — unchanged.

**PLAYER-050 — Voice note recording with optional live transcription**
- Category: Functional / Integration
- Description: Records audio via `MediaRecorder`; live-transcribes via the Web Speech API where supported, otherwise manual summary; uploads audio + saves a `VoiceNote` row.
- Component: `web/components/VoiceNoteRecorder.tsx`.
- Status: IMPLEMENTED. Spot-checked (`SpeechRecognition`-shim interfaces present, unchanged) — unchanged.

**PLAYER-051 — Formal assessment form**
- Category: Functional / Validation
- Description: Fixed 5-category rubric (`ASSESSMENT_CATEGORIES`), each 1–5 with optional comment, plus free-text recommendation; save blocked until all 5 rated.
- Component: `web/components/AssessmentForm.tsx`; `lib/types.ts:ASSESSMENT_CATEGORIES`.
- Status: IMPLEMENTED. `ASSESSMENT_CATEGORIES` confirmed still present in `lib/types.ts` — unchanged.

---

### Badges / XP / gamification

**PLAYER-052 — Badge computation (derived, not event-sourced)**
- Category: Business Rule
- Description: Every badge's earned/progress state is recomputed fresh on each render — no persisted "badge awarded" event table.
- Component: `lib/badges.ts:computeBadges(player, reportCount)`.
- Business rule (re-verified, byte-for-byte unchanged): session milestones `[1,5,10,25,50,100]`; XP milestones `[100,500,1000,2500,5000]`; "First Analysis" `reportCount >= 1`; "Data Driven" `reportCount >= 5`; streak/academy-article badges from `academy-content.ts`.
- Status: IMPLEMENTED.

**PLAYER-053 — Badge strip display (earned + next-up)**
- Category: UI
- Description: Shows earned badges as icons and a single "Next: …" hint for the closest-to-completion unearned badge.
- Component: `web/components/BadgeStrip.tsx`.
- Status: IMPLEMENTED. Unchanged.

**PLAYER-054 — Academy-progress display and curriculum-stage unlock gating**
- Category: Functional / Business Rule (boundary note)
- Description: `PlayerProfileClient.tsx`'s "Academy Progress" card and the `/players/[id]/academy` curriculum page show `player.academy.*` and per-stage unlock gating.
- Component: `web/app/(dashboard)/players/[id]/academy/page.tsx`; unlock logic in `lib/academy-content.ts` (out of scope, not re-analyzed this pass).
- Status: IMPLEMENTED (boundary-adjacent; not independently re-verified this pass — carried forward from prior analysis with `REQUIRES VALIDATION` on any internal-logic claim beyond "the page still exists and is still gated the same way").

---

### New player-record capabilities and self-service additions

**PLAYER-055 — Plan Catalog-driven feature gating (2-argument `plan-features.ts` signature) (NEW mechanism, affects PLAYER-014/025 and others)**
- Category: Business Rule / Architecture
- Description: Every gating/limit function in `lib/plan-features.ts` now takes the caller's already-fetched `plans: Plan[]` as an explicit second argument and resolves against admin-editable Plan Catalog rows (`plans` table, editable at `/admin/plans`) instead of a hardcoded tier switch. A player's "Free" and a coach's "Free" are deliberately two separate Plan Catalog rows (`slug: "free"` vs `"coach-free"`) even though both display as "Free," so that tightening one doesn't silently affect the other; `"coach-pro"` is shared since it only ever means one thing.
- Component: `web/lib/plan-features.ts` — see §9 for the exhaustive signature/behavior list; every caller (`NewSessionForm.tsx`, `SessionsClient.tsx`, `PlayersClient.tsx`, `SubscriptionPage.tsx`, `CoachSubscriptionPage.tsx` [not read this pass]) now fetches `plans` via `lib/db.ts:fetchActivePlans()` once and threads it through.
- Fallback behavior: if the relevant Plan Catalog row is missing entirely, each function falls back to a hardcoded default (Free session cap 4, Free chat cap 3, roster cap 5, `aiReportsEnabled`/`marketplaceEnabled` default to `tier !== "Free"`) — the app degrades gracefully rather than throwing if `/admin/plans` data is incomplete, **provided a non-empty `plans` array is passed**. A call site that (like the now-stale `plan-features.test.ts`) omits the `plans` argument entirely gets `undefined` for `plans`, and every function immediately does `plans.find(...)` on it — which throws a `TypeError: Cannot read properties of undefined` rather than silently falling back. See §8's stale-test flag.
- Status: IMPLEMENTED.

**PLAYER-056 — Independent-coach self-service "+ Add Player" with roster-cap enforcement (NEW)**
- Category: Functional / Business Rule / Validation
- Description: On the Players list, a coach with **no academy** (`isIndependentCoach = role === "coach" && !!coachId && !ownCoach.academyId`) sees a "+ Add Player" button (an academy-employed coach still only adds players through the Academy page's own CSV-import/single-add flow, unchanged). Clicking it opens an inline form (name*, email, age group, bowling style, club); on save, a full client-side `Player` object plus its `DbPlayer` insert row are constructed and written via `lib/db.ts:insertPlayer`, defaulting to the Free plan, `sessionsLimit = sessionsLimitForPlan("Free", plans)`, and `currency = ownCoach.currency ?? DEFAULT_CURRENCY`.
- Component: `web/components/PlayersClient.tsx` (`handleAddPlayer`).
- Business rules:
  - Roster cap: `rosterCap = rosterCapForCoachPlan(ownCoach.subPlan, plans)`; if `players.length >= rosterCap`, the "+ Add Player" button is replaced with a "Roster full ({cap}) — Upgrade" link to `/coach/subscription`, and `handleAddPlayer` itself also re-checks the cap and refuses with an inline error if called anyway (defense in depth against a stale button state).
  - Name required (trimmed, non-empty) — inline error otherwise.
  - Email, if provided, must not already belong to another player in the same scoped list (`players.some(p => p.email.toLowerCase() === email.toLowerCase())`) — inline error *"Another player already uses {email} — each player needs a unique email."* otherwise. An email is not required at all (a blank email is allowed and skips both this check and the notify email below).
  - On success, if an email was given, fires `POST /api/players/notify-added` best-effort (`.catch(() => {})` — a failed invite email never blocks or rolls back player creation) — see PLAYER-057.
- Status: IMPLEMENTED.

**PLAYER-057 — Best-effort "you've been added" invite email (NEW)**
- Category: Integration / Error-Handling
- Description: Fires right after a player is created (both the new independent-coach self-service add in PLAYER-056, and academy staff's own single-add/CSV-import flow in `AcademyClient.tsx`, outside this domain), inviting the new player to self-serve create an account using the same email address — pre-filled and pre-approved-on-signup (per its own code comment referencing `/api/complete-signup`, an Auth-domain route not analyzed here).
- Component: `web/app/api/players/notify-added/route.ts`.
- Authorization: requires sign-in and `caller.app_metadata.role` in `["platform_admin","academy_admin","coach"]` (403 otherwise) — confirmed reading from `app_metadata`.
- Validation/error-handling (all best-effort, never a hard failure since the player row is already created either way): missing `playerId` → 400; player has no email or email fails `EMAIL_RE` → `200 { success: true, skipped: "no valid email" }`; Gmail env vars not configured → `200 { success: true, skipped: "email not configured" }`; `sendMail` throws → swallowed (`.catch(() => {})`).
- Email content: signup link is `${appUrl}/signup?role=player&email=...&name=...` (role pre-selected, email/name pre-filled); body copy differs slightly if an `academyId` was passed (names the academy) vs. not.
- Status: IMPLEMENTED.

**PLAYER-058 — Multi-source "last payment date" resolution (NEW)**
- Category: Business Rule / API
- Description: Resolves what a player's genuinely most-recent payment date is by checking three independent sources and taking whichever is most recent — never trusting a stale manually-typed date over an actual payment record when one exists. Sources, in the order checked (all included as candidates, then sorted by date descending): (1) `players.sub_last_payment_date` (the old manual staff-entered field, now a fallback of last resort — labelled `source: "manual"`), (2) any `session_packs` row for the player with `payment_status = "Paid"` and a non-null `paid_date` (`source: "pack"` — covers cash/bank-transfer packs marked paid manually, and Stripe-paid packs), (3) the player's Stripe customer's invoice history via `listInvoicesForCustomer`, taking the most recent `status === "paid"` invoice (`source: "stripe"`; a Stripe API failure here is caught and silently ignored, falling back to whatever DB-derived candidates exist).
- Component: `web/app/api/players/[id]/last-payment/route.ts` (`GET`); `lib/stripe-invoices.ts:listInvoicesForCustomer` (not analyzed in depth — Payments domain).
- Authorization: requires sign-in (401) and `callerCanAccessPlayer` (403).
- Response: `{ lastPaymentDate: "YYYY-MM-DD", source: "manual"|"pack"|"stripe" }` or `{ lastPaymentDate: null, source: null }` if no candidate exists at all.
- Consumers: `PlayerProfileClient.tsx` (read-only display, staff viewers only — the fetch itself is skipped entirely for `player`/`parent` viewers) and `EditPlayerForm.tsx` (staff-only, shown alongside the still-editable manual `sub_last_payment_date` field with contextual copy explaining whether the detected value already supersedes it). See PLAYER-003/004.
- Status: IMPLEMENTED.

**PLAYER-059 — Per-player currency self-service (NEW)**
- Category: Business Rule / API / Security-Authorization
- Description: A player/parent (or a platform admin, for any player) can set which of the 5 supported currencies (`aud`/`usd`/`gbp`/`nzd`/`inr`) that player buys their own individual Player Pro / Library / Assessment-credit purchases in. Ordinary staff (coach/academy_admin) cannot call this route for a player they otherwise have full access to — the route comment explains this is deliberate: the `players_update` RLS policy doesn't let a player/parent touch their own row directly at all (every other column is staff-managed), so this is a narrowly-scoped, purpose-built exception, not a general player-editable-field mechanism.
- Component: `web/app/api/players/update-currency/route.ts`; UI: `web/components/SubscriptionPage.tsx`'s currency `<select>` (`handleCurrencyChange`, best-effort — a failed save doesn't block checkout, since checkout resolves the price for whatever's currently selected regardless of whether the preference persisted).
- Authorization: requires sign-in (401); `isOwnPlayer = (role === "player" || role === "parent") && ownPlayerId === playerId`; allowed if `isOwnPlayer || role === "platform_admin"`, else 403 *"You can only set the currency for your own profile."*
- Validation: `playerId` and a currency passing `isSupportedCurrency` both required (400 otherwise).
- Status: IMPLEMENTED.

**PLAYER-060 — Multi-currency plan pricing display (NEW)**
- Category: Business Rule / UI
- Description: `lib/currency.ts` defines 5 supported currencies (AUD default, USD, GBP, NZD, INR) and `resolvePlanPrice(priceAud, pricesByCurrency, preferred)`: returns the admin-set per-currency override price for the player's `preferred` currency if one exists on that Plan Catalog row (`plan.pricesByCurrency`), otherwise always falls back to `priceAud`/AUD (a plan missing a given currency's override is simply not offered in that currency — it silently shows the AUD price instead, it does not hide the plan). `formatMoney` is the single shared `Intl.NumberFormat` money formatter (falls back to a manual `${symbol}${amount.toFixed(2)}` string if `Intl` throws on an unrecognized code). `sumMoneyByCurrency` groups a mixed-currency list of amounts into per-currency subtotals rather than incorrectly summing raw numbers across currencies.
- Component: `web/lib/currency.ts`; consumed by `web/components/SubscriptionPage.tsx` for the Player Pro/Library/Assessment-credit price displays, keyed off the player's own `currency` field (PLAYER-059) with a local `<select>` to preview other currencies before saving.
- Business rule (country → currency, Stripe Connect constraint): `COUNTRY_OPTIONS` lists only 4 countries an academy can be created in (AU/NZ/GB/US) with currency always *derived* from country, never chosen independently — because a Stripe Connect Express account's payout currency is fixed by its country. India (`inr`) is deliberately **not** in `COUNTRY_OPTIONS` even though `inr` is a supported currency, because Stripe Connect Express doesn't support India as a connected-account country; `inr` is documented as usable only for individual (non-Connect) purchases (Player Pro/Coach Pro/Library/assessments) until/unless that changes.
- Status: IMPLEMENTED. `REQUIRES VALIDATION`: whether every Stripe checkout route in the codebase actually consistently uses `resolvePlanPrice` (the doc comment claims this, but only `SubscriptionPage.tsx`'s *display* logic was directly read for this domain — the actual checkout-session-creation routes are Payments-domain files not read here).

**PLAYER-066 — Player/parent and academy-player access to their own Subscription page for add-on purchases (NEW)**
- Category: Security-Authorization / Business Rule
- Description: Two related, previously-absent access paths now both work: (1) a signed-in player/parent can load their own `/players/[id]/subscription` page directly without being redirected to `/portal` (PLAYER-008's carve-out), and (2) that page no longer 404s for an **academy** player — previously an academy player (whose plan access comes from the academy, not an individual subscription) was redirected/blocked from this page entirely. The page's own code comment: *"Academy players' access comes from the academy's own plan — no main plan to choose or manage billing for here, but they can still buy optional add-ons (Library, Assessment credits), so unlike before they're no longer redirected away from this page entirely."*
- Component: `app/(dashboard)/players/[id]/subscription/page.tsx` (`isAcademyPlayerServer(id)` passed to `SubscriptionPage` as a prop instead of gating render); `web/components/AuthGuard.tsx`.
- Note: `PlayerProfileClient.tsx`'s own "Manage Subscription" quick-action link is still hidden for academy players (`{!isAcademyPlayer && <Link .../>}`) — so a staff viewer browsing a normal academy player's profile still won't see a link to this page; this change is specifically about the page itself no longer refusing to render if reached (e.g. by the player/parent themselves, who has no such profile page to click from in the first place since they're redirected to `/portal`).
- Status: IMPLEMENTED.

**PLAYER-067 — Linked-player display-name resolution for the role switcher (boundary-adjacent, NEW)**
- Category: Functional / Security-Authorization (boundary note)
- Description: `POST /api/players/linked-names` resolves display names (and academy name, if any) for player ids drawn **only** from the caller's own `app_metadata.linkedIdentities` (plus their own `player_id`) — never an arbitrary id a client might pass in, even though the request body nominally accepts any `playerIds[]` array (server-side intersects it against the caller's own linked set before querying). Used by the NavBar's role-switcher (Auth-domain UI, not read in this pass) so that two linked child-player accounts under one parent login show distinct real names instead of "Player ×2".
- Component: `web/app/api/players/linked-names/route.ts`.
- Status: IMPLEMENTED (boundary: this route's own logic was read in full for this domain's angle — what it returns and its own-linked-only guarantee — but its actual UI consumer is Auth-domain scope and not analyzed here).

---

## 3. Business Rules (consolidated)

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

## 4. Key Workflows (Decision Logic)

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

## 5. Requirement-to-Code Traceability

| Req ID | Requirement | Component | File | Method/Class | Evidence |
|---|---|---|---|---|---|
| PLAYER-001 | Role-scoped player list | PlayersClient | `web/components/PlayersClient.tsx`, `web/lib/db.ts` | `fetchPlayers` | file re-read in full |
| PLAYER-002 | Player status derivation | utils | `web/lib/utils.ts` | `getPlayerStatus` | grep-confirmed unchanged |
| PLAYER-003 | Player profile view + last-payment card | PlayerProfileClient | `web/components/PlayerProfileClient.tsx` | component body | file re-read in full |
| PLAYER-004 | Edit player form, narrowed plan picker | EditPlayerForm | `web/components/EditPlayerForm.tsx` | `handleSave` | file re-read in full |
| PLAYER-005 | Auto end-date computation | EditPlayerForm | `web/components/EditPlayerForm.tsx` | `useEffect` | file re-read in full |
| PLAYER-006 | Player reactivation (app_metadata) | API route | `web/app/api/reactivate-player/route.ts` | `POST` | file re-read in full |
| PLAYER-007 | Server-side player access gate | pages | `app/(dashboard)/players/[id]/**/page.tsx` | `canAccessPlayerServer` | 6 page files re-read |
| PLAYER-008 | Player/parent redirect + subscription carve-out | AuthGuard | `web/components/AuthGuard.tsx` | redirect effect | grep-confirmed `isOwnSubscriptionPage` |
| PLAYER-009 | 3 optional video slots | NewSessionForm | `web/components/NewSessionForm.tsx` | `CAMERA_ANGLES` | file re-read in full |
| PLAYER-010 | Video quality probe (warn-only) | video-quality | `web/lib/video-quality.ts` | `probeVideoQuality` | referenced from NewSessionForm read |
| PLAYER-011 | Transcode w/ fallback | transcode | `web/lib/transcode.ts` | `transcodeToH264` | referenced from NewSessionForm read |
| PLAYER-012 | Signed-upload flow, no size override | API route | `web/app/api/storage/sign-upload/route.ts` | `POST` | file re-read in full |
| PLAYER-013 | Session XP formula | NewSessionForm | `web/components/NewSessionForm.tsx` | `handleSubmit` | file re-read in full |
| PLAYER-014 | Pack vs. Free-cap, 2-arg plan lookup | NewSessionForm | `web/components/NewSessionForm.tsx` | `sessionsLimit`, `limitReached` | file re-read in full |
| PLAYER-015 | Ledger update | db | `web/lib/db.ts` | `recordSessionCompletion` | full function re-read |
| PLAYER-016 | Sessions list/filter | SessionsClient | `web/components/SessionsClient.tsx` | component body | file re-read in full |
| PLAYER-017 | RPE editing | SessionsClient | `web/components/SessionsClient.tsx` | `handleSetRpe` | file re-read in full |
| PLAYER-018 | Session deletion cascade | API route | `web/app/api/sessions/delete/route.ts` | `POST` | file re-read in full |
| PLAYER-019 | Attendance pack draw-down | db | `web/lib/db.ts` | `saveAttendance` | full function re-read |
| PLAYER-020 | Full pipeline orchestration | SessionsClient | `web/components/SessionsClient.tsx` | `handleGenerateReport` | file re-read in full |
| PLAYER-021 | Pose-failure rejection | SessionsClient | `web/components/SessionsClient.tsx` | `handleGenerateReport` | string match re-confirmed |
| PLAYER-022 | Biomechanics metrics | biomechanics | `web/lib/biomechanics.ts` | `computeBiomechanics` | grep-confirmed unchanged |
| PLAYER-023 | Action-type classification | biomechanics | `web/lib/biomechanics.ts` | `classifyActionType` | grep-confirmed unchanged |
| PLAYER-024 | Injury-risk classification | biomechanics | `web/lib/biomechanics.ts` | `classifyInjuryRisk` | grep-confirmed unchanged |
| PLAYER-025 | AI report gating, 3-way eligibility | SessionsClient | `web/components/SessionsClient.tsx` | `aiReportsIncludedForPlayer` | file re-read in full |
| PLAYER-026 | Server-side credit spend | API route | `web/app/api/ai-report/route.ts` | `POST` | file re-read in full |
| PLAYER-027 | Ball tracking | ball-tracking | `web/lib/ball-tracking.ts` | `trackBall` | grep-confirmed unchanged |
| PLAYER-028 | Camera calibration | CameraCalibrationModal | `web/components/CameraCalibrationModal.tsx` | component body | spot-read, first 40 lines |
| PLAYER-029 | Claude narrative | API route | `web/app/api/ai-report/route.ts` | `anthropic.messages.create` | file re-read in full |
| PLAYER-030 | PDF generation | API route | `web/app/api/ai-report/route.ts` | `buildReportPdf` | file re-read in full |
| PLAYER-031 | Auto-email (REMOVED) | API route | `web/app/api/ai-report/route.ts` | n/a | absence confirmed by full file read |
| PLAYER-032 | Regeneration | SessionsClient | `web/components/SessionsClient.tsx` | button title/handler | file re-read in full |
| PLAYER-033 | Report deletion | API route | `web/app/api/reports/delete/route.ts` | `POST` | file re-read in full |
| PLAYER-034 | Manual email, review-gated | API route, ReportActions | `web/app/api/reports/send-email/route.ts`, `web/components/ReportActions.tsx` | `POST`, button `disabled` | both files re-read in full |
| PLAYER-035 | Reports list/grouping, review badge | ReportsClient | `web/components/ReportsClient.tsx` | `ReportCard` | file re-read in full |
| PLAYER-036 | Speed leaderboard | ReportsClient | `web/components/ReportsClient.tsx` | render block | file re-read in full |
| PLAYER-037 | Biomechanics snapshot refresh | API route | `web/app/api/ai-report/route.ts` | `.update()` calls | file re-read in full |
| PLAYER-038 | Action plan CRUD | ActionPlansClient | `web/components/ActionPlansClient.tsx` | `saveEdit`/`saveNew`/`deletePlan` | file re-read in full |
| PLAYER-039 | AI action plan | API route | `web/app/api/generate-action-plan/route.ts` | `POST` | file re-read in full |
| PLAYER-040 | Priority derivation | API route | `web/app/api/generate-action-plan/route.ts` | `PRIORITY_BY_RISK` | file re-read in full |
| PLAYER-041 | Injury-risk trend | performance-trends | `web/lib/performance-trends.ts` | `computeInjuryRiskTrend` | file re-read in full |
| PLAYER-042 | RPE weekly load | performance-trends | `web/lib/performance-trends.ts` | `computeRpeSummary` | file re-read in full |
| PLAYER-043 | S&C weekly load / ACWR | performance-trends | `web/lib/performance-trends.ts` | `computeSCLoadSummary` | file re-read in full |
| PLAYER-044 | Needs-Attention sort | PerformanceClient | `web/components/PerformanceClient.tsx` | `.sort(...)` | not re-read this pass; carried forward |
| PLAYER-045 | Group session CRUD, pack-gated roster, CSV import | AttendanceClient | `web/components/AttendanceClient.tsx` | `hasActivePackFor`, `handleRosterCsvMerge` | file re-read in full |
| PLAYER-046 | Attendance recording | AttendanceClient, db | `web/components/AttendanceClient.tsx`, `web/lib/db.ts` | `handleSaveAttendance`, `saveAttendance` | file re-read in full |
| PLAYER-047 | Occurrence-date window | AttendanceClient | `web/components/AttendanceClient.tsx` | `occurrenceDatesInRange` | file re-read in full |
| PLAYER-048 | S&C workout CRUD | SCLogClient | `web/components/SCLogClient.tsx` | `saveNew`/`saveEdit`/`removeWorkout` | spot-read, first 60 lines + grep |
| PLAYER-049 | Video markup | VideoAnnotator | `web/components/VideoAnnotator.tsx` | `handleSave` | spot-read, first 40 lines |
| PLAYER-050 | Voice notes | VoiceNoteRecorder | `web/components/VoiceNoteRecorder.tsx` | `startRecording` | grep-confirmed unchanged interfaces |
| PLAYER-051 | Assessment form | AssessmentForm | `web/components/AssessmentForm.tsx` | `handleSave` | grep-confirmed `ASSESSMENT_CATEGORIES` present |
| PLAYER-052 | Badge computation | badges | `web/lib/badges.ts` | `computeBadges` | grep-confirmed unchanged |
| PLAYER-053 | Badge strip UI | BadgeStrip | `web/components/BadgeStrip.tsx` | component body | not re-read this pass; carried forward |
| PLAYER-054 | Academy progress display | academy page | `app/(dashboard)/players/[id]/academy/page.tsx` | component body | not re-read this pass; carried forward |
| PLAYER-055 | Plan Catalog gating architecture | plan-features | `web/lib/plan-features.ts` | every exported function | file read in full |
| PLAYER-056 | Independent-coach self-add player | PlayersClient | `web/components/PlayersClient.tsx` | `handleAddPlayer` | file re-read in full |
| PLAYER-057 | Notify-added invite email | API route | `web/app/api/players/notify-added/route.ts` | `POST` | file read in full |
| PLAYER-058 | Last-payment resolution | API route | `web/app/api/players/[id]/last-payment/route.ts` | `GET` | file read in full |
| PLAYER-059 | Currency self-service | API route | `web/app/api/players/update-currency/route.ts` | `POST` | file read in full |
| PLAYER-060 | Multi-currency pricing | currency lib | `web/lib/currency.ts` | `resolvePlanPrice`, `formatMoney` | file read in full |
| PLAYER-061 | Report review workflow | ReportReview, API route | `web/components/ReportReview.tsx`, `web/app/api/reports/review/route.ts` | `save()`, `POST` | both files read in full |
| PLAYER-062 | Player/parent report visibility gate | server page | `app/(dashboard)/players/[id]/reports/page.tsx` | filter on `reviewStatus` | file read in full |
| PLAYER-064 | Bulk attendance CSV import | AttendanceClient | `web/components/AttendanceClient.tsx` | `handleAttendanceCsvImport` | file re-read in full |
| PLAYER-066 | Subscription page access carve-out | subscription page | `app/(dashboard)/players/[id]/subscription/page.tsx` | `isAcademyPlayerServer` | file read in full |
| PLAYER-067 | Linked-player name resolution | API route | `web/app/api/players/linked-names/route.ts` | `POST` | file read in full |

---

## 6. Test Cases

> IDs `PLAYER-TC-###`. Automation column cites an exact existing test only when truly covering the scenario **as the code behaves today** — several existing tests assert the *old* (now-incorrect) behavior and are flagged `STALE` here rather than cited as passing coverage; see §8 for the full stale-test analysis.

| TC ID | Req ID | Scenario | Preconditions | Test Data | Steps | Expected Result | Type | Priority | Automation | Component |
|---|---|---|---|---|---|---|---|---|---|---|
| PLAYER-TC-001 | PLAYER-002 | Status = Active | endDate 30 days out | player w/ future endDate | call `getPlayerStatus(endDate)` | `"Active"` | UNIT | P2 | AUTOMATION_CANDIDATE | `lib/utils.ts` |
| PLAYER-TC-002 | PLAYER-002 | Status = Expiring boundary | endDate exactly 7 days out | endDate=`now+7d` | call `getPlayerStatus` | `"Expiring"` | BOUNDARY | P2 | AUTOMATION_CANDIDATE | `lib/utils.ts` |
| PLAYER-TC-003 | PLAYER-002 | Status = Expired | endDate 1 day in the past | endDate=`now-1d` | call `getPlayerStatus` | `"Expired"` | BOUNDARY | P2 | AUTOMATION_CANDIDATE | `lib/utils.ts` |
| PLAYER-TC-004 | PLAYER-055 | `sessionsLimitForPlan` resolves from Plan Catalog row | `plans` includes a `slug:"free"` row with `sessionsPerMonthLimit: 6` | tier="Free" | call `sessionsLimitForPlan("Free", plans)` | returns `6`, not the hardcoded `4` | UNIT | P1 | AUTOMATION_CANDIDATE | `lib/plan-features.ts` |
| PLAYER-TC-005 | PLAYER-055 | `sessionsLimitForPlan` falls back when row missing | `plans` has no `slug:"free"` row | tier="Free" | call `sessionsLimitForPlan("Free", [])` | returns hardcoded `4` | UNIT | P1 | AUTOMATION_CANDIDATE | `lib/plan-features.ts` |
| PLAYER-TC-006 | PLAYER-055 | `sessionsLimitForPlan` called with only 1 arg throws | none | tier="Free", no `plans` arg | call `sessionsLimitForPlan("Free")` | throws `TypeError` (undefined.find) | UNIT | P1 | STALE-TEST-EXISTS (see §8) | `lib/plan-features.ts` |
| PLAYER-TC-007 | PLAYER-025 | Academy AI-monitoring window expired blocks eligibility | academy plan `waivesSessionFees: true`, `accessDurationMonths: 3`, `accessExpiresAt` in the past | player on academy, Free own-plan | call `aiReportsIncludedForPlayer(player)` | returns `false` despite the waiver still being "active" for fee purposes | UNIT/INTEGRATION | P1 | NEW_CANDIDATE | `SessionsClient.tsx` |
| PLAYER-TC-008 | PLAYER-025 | Independent coach's Coach Pro covers all roster players | coach has no academyId, `subPlan: "Coach Pro"` | player on Free, coached by this coach | call `aiReportsIncludedForPlayer(player)` | returns `true` | UNIT/INTEGRATION | P1 | NEW_CANDIDATE | `SessionsClient.tsx` |
| PLAYER-TC-009 | PLAYER-031/061 | Report generation no longer sends email | Gmail env vars configured, player has email | generate a report via `POST /api/ai-report` | `nodemailer.createTransport`/`sendMail` never called; response has no email-sent indication | API | P1 | STALE-TEST-EXISTS (`ai-report.test.ts` asserts the old auto-email — see §8) | `web/app/api/ai-report/route.ts` |
| PLAYER-TC-010 | PLAYER-061 | Report inserted at `not_reviewed` | valid session/player | generate a report | inserted row has `review_status: "not_reviewed"` | API | P1 | AUTOMATION_CANDIDATE | `web/app/api/ai-report/route.ts` |
| PLAYER-TC-011 | PLAYER-061 | Coach marks report Under Review | existing `not_reviewed` report, caller is coach with access | `POST /api/reports/review { reviewStatus: "under_review", summary, highlight }` | 200; row updated, `reviewed_at`/`reviewed_by` set | API | P1 | AUTOMATION_CANDIDATE | `web/app/api/reports/review/route.ts` |
| PLAYER-TC-012 | PLAYER-061 | Player cannot call the review route | caller role = player | `POST /api/reports/review {...}` | 403 "Only coaches can review reports." | API/SECURITY | P0 | AUTOMATION_CANDIDATE | `web/app/api/reports/review/route.ts` |
| PLAYER-TC-013 | PLAYER-061 | Invalid `reviewStatus` value rejected | any caller | `reviewStatus: "bogus"` | 400 "Invalid reviewStatus." | API/VALIDATION | P2 | AUTOMATION_CANDIDATE | `web/app/api/reports/review/route.ts` |
| PLAYER-TC-014 | PLAYER-034 | Email send blocked before completed review | report at `under_review` | `POST /api/reports/send-email` | 400 "This report hasn't completed coach review yet." | API | P0 | AUTOMATION_CANDIDATE (existing test likely stale — see §8) | `web/app/api/reports/send-email/route.ts` |
| PLAYER-TC-015 | PLAYER-034 | Email send succeeds once completed | report at `completed`, player has email, Gmail configured | `POST /api/reports/send-email` | 200, `sendMail` invoked | API | P1 | AUTOMATION_CANDIDATE | `web/app/api/reports/send-email/route.ts` |
| PLAYER-TC-016 | PLAYER-062 | Player/parent viewer sees only completed reports | player has 1 `not_reviewed`, 1 `under_review`, 1 `completed` report | render `players/[id]/reports` as player/parent | only the `completed` report renders | INTEGRATION/E2E | P0 | NEW_CANDIDATE (page.tsx → E2E only, per AGENTS.md) | `app/(dashboard)/players/[id]/reports/page.tsx` |
| PLAYER-TC-017 | PLAYER-062 | Coach viewer sees all reports regardless of status | same 3 reports as TC-016 | render same page as coach | all 3 render, editor shown for non-completed ones | INTEGRATION/E2E | P1 | NEW_CANDIDATE | `app/(dashboard)/players/[id]/reports/page.tsx` |
| PLAYER-TC-018 | PLAYER-045 | Roster add blocked without an active matching pack | player has no Active pack for the group's sessionType | attempt `toggleDraftPlayer(playerId)` | player NOT added; inline error shown | COMPONENT | P0 | AUTOMATION_CANDIDATE (existing `AttendanceClient.test.tsx` likely stale — see §8) | `web/components/AttendanceClient.tsx` |
| PLAYER-TC-019 | PLAYER-045 | Roster add succeeds with a qualifying pack | player has Active pack, sessionType+academyId match, remaining capacity > 0 | `toggleDraftPlayer(playerId)` | player added to `draft.playerIds` | COMPONENT | P1 | AUTOMATION_CANDIDATE | `web/components/AttendanceClient.tsx` |
| PLAYER-TC-020 | PLAYER-045 | Roster CSV import skips no-pack matches | CSV has 3 matched players, 1 lacks an active pack | `handleRosterCsvMerge()` | 2 players added; error message names the skipped 1 | COMPONENT | P2 | NEW_CANDIDATE | `web/components/AttendanceClient.tsx` |
| PLAYER-TC-021 | PLAYER-064 | Attendance CSV: invalid date format skipped | row date = "13/13/2026" (invalid) | `handleAttendanceCsvFile` | row `csvStatus: "skipped"`, issue mentions date format | COMPONENT | P2 | NEW_CANDIDATE | `web/components/AttendanceClient.tsx` |
| PLAYER-TC-022 | PLAYER-064 | Attendance CSV: duplicate player+date in file | two rows same player, same date | `handleAttendanceCsvFile` | second row `csvStatus: "duplicate"`, only first imported | COMPONENT | P1 | NEW_CANDIDATE | `web/components/AttendanceClient.tsx` |
| PLAYER-TC-023 | PLAYER-064 | Attendance CSV: player not on this group's roster | player exists but not in `group.playerIds` | `handleAttendanceCsvFile` | row skipped, "Player not found in this group's roster" | COMPONENT | P2 | NEW_CANDIDATE | `web/components/AttendanceClient.tsx` |
| PLAYER-TC-024 | PLAYER-012 | Upload over 50MB rejected client-side with clear message | transcoded file > 50MB | submit session with that video | submit aborts, message names the size and 50MB limit | COMPONENT/E2E | P1 | NEW_CANDIDATE | `web/components/NewSessionForm.tsx` |
| PLAYER-TC-025 | PLAYER-012 | Bucket created without a size override | fresh bucket, first upload of the session | `POST /api/storage/sign-upload` | `createBucket` called with no `fileSizeLimit` key | API | P2 | AUTOMATION_CANDIDATE (existing `sign-upload.test.ts` may assert old 500MB — see §8) | `web/app/api/storage/sign-upload/route.ts` |
| PLAYER-TC-026 | PLAYER-004 | Player plan picker excludes Coach Pro | render EditPlayerForm for any player | inspect `<select>` options | only "Free"/"Player Pro" present | COMPONENT | P2 | AUTOMATION_CANDIDATE (existing `EditPlayerForm.test.tsx` may assert old 3-option list — see §8) | `web/components/EditPlayerForm.tsx` |
| PLAYER-TC-027 | PLAYER-058 | Last-payment prefers Stripe over manual date | manual date older than a paid Stripe invoice | `GET /api/players/{id}/last-payment` | `source: "stripe"`, most recent date returned | API | P2 | NEW_CANDIDATE | `web/app/api/players/[id]/last-payment/route.ts` |
| PLAYER-TC-028 | PLAYER-058 | Last-payment falls back to manual when no other record | no packs paid, no Stripe customer | `GET /api/players/{id}/last-payment` | `source: "manual"` (or `null` if that's also unset) | API | P2 | NEW_CANDIDATE | `web/app/api/players/[id]/last-payment/route.ts` |
| PLAYER-TC-029 | PLAYER-056 | Independent coach blocked from adding past roster cap | Free-plan independent coach already at 5 players | attempt `handleAddPlayer()` | inline error, no insert attempted | COMPONENT | P1 | NEW_CANDIDATE (existing `PlayersClient.test.tsx` may not cover this new path — see §8) | `web/components/PlayersClient.tsx` |
| PLAYER-TC-030 | PLAYER-056 | Add-player rejects a duplicate email in scope | another player in the same scoped list already has that email | attempt `handleAddPlayer()` | inline error, no insert attempted | COMPONENT | P2 | NEW_CANDIDATE | `web/components/PlayersClient.tsx` |
| PLAYER-TC-031 | PLAYER-057 | Notify-added skipped for invalid email | player.email = "not-an-email" | `POST /api/players/notify-added` | `200 { success: true, skipped: "no valid email" }`, no send attempted | API | P2 | NEW_CANDIDATE | `web/app/api/players/notify-added/route.ts` |
| PLAYER-TC-032 | PLAYER-059 | Coach cannot set another player's currency | caller role = coach, has full player access otherwise | `POST /api/players/update-currency` | 403 "You can only set the currency for your own profile." | API/SECURITY | P0 | NEW_CANDIDATE | `web/app/api/players/update-currency/route.ts` |
| PLAYER-TC-033 | PLAYER-059 | Player sets own currency successfully | caller role = player, `ownPlayerId === playerId`, currency="gbp" | `POST /api/players/update-currency` | 200, `players.currency = "gbp"` | API | P1 | NEW_CANDIDATE | `web/app/api/players/update-currency/route.ts` |
| PLAYER-TC-034 | PLAYER-008/066 | Player can reach own subscription page directly | signed in as player | navigate to `/players/{ownId}/subscription` | page renders, NOT redirected to `/portal` | E2E | P1 | NEW_CANDIDATE | `web/components/AuthGuard.tsx` |
| PLAYER-TC-035 | PLAYER-008 | Player still redirected from every other player-domain route | signed in as player | navigate to `/players/{ownId}` (profile, not subscription) | redirected to `/portal` | E2E | P0 | AUTOMATION_CANDIDATE | `web/components/AuthGuard.tsx` |
| PLAYER-TC-036 | PLAYER-014/025 | plan-features 2-arg gating end-to-end via NewSessionForm | Free plan, Catalog `sessionsPerMonthLimit: 2`, `sessionsUsed: 2` | open new-session form | "Monthly session limit reached" shown, form replaced | COMPONENT/E2E | P1 | NEW_CANDIDATE | `web/components/NewSessionForm.tsx` |
| PLAYER-TC-037 | PLAYER-021 | Pose-detection failure message unchanged | fixture clip with no person | run report generation | exact rejection string surfaces | E2E `@slow` | P0 | AUTOMATED (`video-pipeline.spec.ts`) | `web/components/SessionsClient.tsx` |
| PLAYER-TC-038 | PLAYER-045 | Removing an already-selected roster player is always allowed | player selected, no pack (hypothetically added before their pack expired) | `toggleDraftPlayer(playerId)` to deselect | player removed regardless of current pack status | COMPONENT | P2 | NEW_CANDIDATE | `web/components/AttendanceClient.tsx` |
| PLAYER-TC-039 | PLAYER-019/046/064 | CSV-imported attendance draws pack the same as manual entry | player has 1 remaining pack session, first-ever occurrence for that date | import CSV row for that player+date, status=Present | `session_packs.sessions_used` incremented by 1 | INTEGRATION | P1 | NEW_CANDIDATE | `lib/db.ts:saveAttendance` |
| PLAYER-TC-040 | PLAYER-060 | `resolvePlanPrice` returns AUD when no override for preferred currency | plan has `pricesByCurrency: { usd: 35 }`, preferred = "gbp" | call `resolvePlanPrice(priceAud, pricesByCurrency, "gbp")` | returns `{ amount: priceAud, currency: "aud" }` | UNIT | P2 | NEW_CANDIDATE | `lib/currency.ts` |

---

## 7. Test Case Tags

- `@security` — PLAYER-TC-012, 014, 018, 032, 035
- `@business-rule` — PLAYER-TC-004, 005, 007, 008, 018, 025, 029, 036, 039, 040
- `@regression` — PLAYER-TC-006, 009, 025, 026 (all cover behavior that changed and could silently regress back, or whose existing test asserts the wrong thing)
- `@new-feature` — PLAYER-TC-016 through 024, 027 through 034, 038, 039, 040
- `@slow` / `@e2e` — PLAYER-TC-016, 017, 024, 034, 035, 036, 037 (page.tsx-backed flows per `AGENTS.md`'s "New page → E2E only" rule; PLAYER-TC-037 is the one already-automated `@slow` spec)
- `@boundary` — PLAYER-TC-002, 003
- `@integration` — PLAYER-TC-007, 008, 016, 017, 039

---

## 8. Existing Test Coverage vs. Recommended (incl. stale-test flags)

**Cross-cutting staleness note (applies broadly):** per this session's briefing, `web/tests/mocks/*.ts` and `web/tests/seed/fixtures.ts` construct fake authenticated users via `user_metadata`, and `web/lib/server-auth.ts` (confirmed by direct read) now resolves `role`/`academyId`/`coachId`/`playerId` exclusively from `app_metadata`. Every API-route test in this domain that relies on those shared mocks/fixtures to represent a signed-in coach/academy_admin/platform_admin is therefore likely to see `caller.role` resolve to `undefined` and fail on a wrong-status-code assertion (typically expecting 200/403-for-a-different-reason and getting 401/403-for-no-role-at-all instead) — this is a **mock/fixture problem, not a route-logic problem**; the routes themselves were re-read in full for this domain and correctly implement `app_metadata`-based auth. Confirmed present: `tests/mocks/caller.ts`, `tests/seed/fixtures.ts`, `tests/seed/seed.ts` all matched a `user_metadata` grep.

| Existing Test File | Covers | Status Against Current Code | Notes |
|---|---|---|---|
| `web/tests/unit/lib/plan-features.test.ts` | `canGenerateAiReports`, `canUseMarketplace`, `sessionsLimitForPlan`, `chatMessagesLimitForPlan`, `isUnlimited` | **STALE — will fail/throw** | Every call in this file passes only the tier string, e.g. `canGenerateAiReports("Free")` — the function now requires a second `plans: Plan[]` argument and does `plans.find(...)` on it unconditionally, so calling with `plans === undefined` throws a `TypeError`, not just asserts a wrong value. This is the single highest-value test to rewrite: it needs a `plans` fixture array (with `slug: "free"/"player-pro"/"coach-pro"` rows carrying `sessionsPerMonthLimit`/`chatMessagesPerDayLimit`/`aiReportsEnabled`/`marketplaceEnabled`) passed to every call, plus new cases for the fallback-when-row-missing path and the coach-side functions (`canUseMarketplaceForCoach`, `canGenerateAiReportsForCoach`, `rosterCapForCoachPlan`, `coachPlanFeatureLines`) which have **zero** existing coverage even under the old signature. |
| `web/tests/api/ai-report.test.ts` | 402 on no credits, credit spend, Anthropic 502, PDF/email best-effort, snapshot refresh | **PARTIALLY STALE** | Whatever assertions this file makes about an email being sent on generation (per the old PLAYER-031 behavior the prior analysis documented as tested — "saves the report, updates player/session snapshots, uploads a PDF, and emails it") are now **wrong**: the route no longer calls `nodemailer` at all. The 402-credit, credit-spend, and 502-on-Anthropic-failure assertions likely still hold since that logic is unchanged. Needs: remove/rewrite the email-on-generation assertion; add a new assertion that the inserted report row has `review_status: "not_reviewed"`. |
| `web/tests/api/reports/send-email.test.ts` | 400/401/403/404/502 validation order | **LIKELY STALE for the happy path** | The route now short-circuits with a **new** `400 "This report hasn't completed coach review yet."` immediately after the report-lookup step — any existing "happy path" or "player has no email" test case that seeds a report *without* `review_status: "completed"` will now get 400 for the wrong reason before ever reaching the assertion it intended to test. Needs: every non-400-review-status test case must seed `review_status: "completed"` on its report fixture; add a dedicated new test for the review-not-completed 400. |
| `web/tests/api/reports/delete.test.ts` | 400/401/403, happy path, 500 on delete failure | Likely still accurate | Route re-read in full this pass — logic unchanged from the prior analysis. Only at risk via the cross-cutting `user_metadata` mock staleness noted above. |
| `web/tests/api/sessions/delete.test.ts` | 400/401/403, happy path, 500 on final delete failure | Likely still accurate | Route re-read in full — unchanged. Same cross-cutting mock-staleness risk. |
| `web/tests/api/generate-action-plan.test.ts` | 400/401/403/404×2/400-no-flags/502/500/happy-path | Likely still accurate | Route re-read in full — unchanged. Same cross-cutting mock-staleness risk. |
| `web/tests/api/storage/sign-upload.test.ts` | bucket creation, signed URL, 403 on cross-player path | **POSSIBLY STALE** | If this test asserts a specific `fileSizeLimit` value (the prior analysis's own documented expectation was 500MB), that assertion is now wrong — the route no longer passes `fileSizeLimit` to `createBucket` at all. Not read directly this pass to confirm the exact assertion; flagged for verification. |
| `web/tests/components/SessionsClient.test.tsx` | empty state, stats computation, type filtering | Likely still accurate for the parts tested (list/filter/stats), but the file's fixtures almost certainly construct `Player`/`Coach` objects without the new required `currency` field and without the new `aiReportsIncludedForPlayer` 3-way branches — if any test exercises the AI-report button states, it needs a `plans` fixture threaded through (`fetchActivePlans` is now mocked-and-awaited on mount) or the component's `_sessPlans` module-level state stays empty and every `canGenerateAiReports(..., [])` call falls through to the hardcoded `tier !== "Free"` default, which may or may not match what the test expects. |
| `web/tests/components/PlayersClient.test.tsx` | (pre-merge scope, per file name) | **LIKELY MISSING NEW COVERAGE** | No indication this file was updated for the new "+ Add Player" independent-coach flow (PLAYER-056), the roster-cap button-swap, or the `notify-added` fetch call — these are new render branches (`isIndependentCoach`) with no confirmed test presence. |
| `web/tests/components/AttendanceClient.test.tsx` | group CRUD, "taking attendance marks a player present and saves it" | **LIKELY MISSING NEW COVERAGE, and existing roster-add cases may now fail** | Any existing test that adds a player to a draft roster without first seeding an Active `SessionPack` for that player/sessionType/academyId will now hit the new `hasActivePackFor` refusal and the player won't be added — silently breaking any assertion downstream that expects them to be. No confirmed coverage exists for either CSV-import flow (roster or attendance-history), both entirely new. |
| `web/tests/components/EditPlayerForm.test.tsx` | (pre-merge scope) | **POSSIBLY STALE** | If this file asserts the plan `<select>` has 3 options (Free/Player Pro/Coach Pro, per the prior analysis's documented `PLANS` constant), it will now fail — the constant is `["Free", "Player Pro"]` only. No confirmed coverage for the new Last Payment Date field or its `/last-payment` fetch. |
| `web/tests/components/ActionPlansClient.test.tsx`, `PerformanceClient.test.tsx`, `SCLogClient.test.tsx`, `PlayerProfileClient.test.tsx` | render/add/delete, Needs-Attention surfacing, S&C log CRUD, profile render | Likely still largely accurate for what they test (these components' core logic was confirmed unchanged), but `PlayerProfileClient.test.tsx` needs a new case for the `/last-payment` fetch and its 3 display states (loading/found/not-recorded), which is new render behavior with no confirmed coverage. |
| **No test file found** for `ReportsClient.tsx`, `ReportActions.tsx`, or `ReportReview.tsx` | — | **GAP** | `web/tests/components/` was directly listed for this domain and contains no `ReportsClient.test.tsx`, `ReportActions.test.tsx`, or `ReportReview.test.tsx`. The entire review workflow (PLAYER-061/062), the review-gated email button (PLAYER-034), and the review-status badge/leaderboard/grouping logic in `ReportsClient.tsx` (PLAYER-035/036) have **zero** component-level test coverage, old or new. This is the single largest coverage gap in the domain — see `PLAYER-GAP-01`. |
| `web/tests/e2e/roles/*/players.spec.ts`, `web/tests/e2e/roles/coach/video-pipeline.spec.ts` | role-scoped player views, full video pipeline incl. pose-failure message | Pose-failure-message assertion re-confirmed still accurate (PLAYER-021). The rest of these specs were not re-read line-by-line this pass; any assertion about report visibility/emailing immediately after generation would now be stale per PLAYER-031's removal — flagged for verification, not confirmed either way. |

---

## 9. Gaps, and the domain's NEW / CHANGED / REMOVED inventory

### Top-line: the single most consequential change

**`lib/plan-features.ts`'s gating functions now require a `plans: Plan[]` second argument, sourced from the admin-editable Plan Catalog (`plans` table) rather than hardcoded tier logic.** Exact new signatures (all confirmed by direct read of the current file):

```ts
canGenerateAiReports(tier: PlanTier, plans: Plan[]): boolean
canUseMarketplace(tier: PlanTier, plans: Plan[]): boolean
sessionsLimitForPlan(tier: PlanTier, plans: Plan[]): number | null
chatMessagesLimitForPlan(tier: PlanTier, plans: Plan[]): number | null
planFeatureLines(tier: PlanTier, plans: Plan[]): string[]
canUseMarketplaceForCoach(tier: "Free" | "Coach Pro", plans: Plan[]): boolean         // new function
canGenerateAiReportsForCoach(tier: "Free" | "Coach Pro", plans: Plan[]): boolean      // new function
rosterCapForCoachPlan(tier: "Free" | "Coach Pro", plans: Plan[]): number | null       // new function
coachPlanFeatureLines(tier: "Free" | "Coach Pro", plans: Plan[]): string[]            // new function
```
Each resolves its Plan Catalog row by fixed `slug` (`free`/`player-pro`/`coach-pro` for the player-side functions; `coach-free`/`coach-pro` for the coach-side ones — two *separate* Free rows so a platform admin tightening one doesn't silently affect the other), then reads the matching field off that row (`aiReportsEnabled`, `marketplaceEnabled`, `sessionsPerMonthLimit`, `chatMessagesPerDayLimit`, `seatCap`). If the row is missing, each falls back to a hardcoded default (`tier !== "Free"` for booleans; `4`/`3`/`5`/`null` for the numeric caps). Callers now fetch `plans` once via `lib/db.ts:fetchActivePlans()` and thread it through — confirmed consumers in this domain: `NewSessionForm.tsx`, `SessionsClient.tsx`, `PlayersClient.tsx`, `SubscriptionPage.tsx`. **A caller that omits the second argument (like the current `plan-features.test.ts`) does not silently get old behavior — it throws**, because every function unconditionally calls `.find()` on `plans`.

### NEW (this merge)

- `lib/plan-features.ts` — 2-arg signature across all existing functions, plus 4 brand-new coach-side functions (`canUseMarketplaceForCoach`, `canGenerateAiReportsForCoach`, `rosterCapForCoachPlan`, `coachPlanFeatureLines`).
- `lib/currency.ts` — entire new module (Currency type, 5 supported currencies, `resolvePlanPrice`, `formatMoney`, `sumMoneyByCurrency`, `currencyForCountry`, `isSupportedCurrency`, `COUNTRY_OPTIONS`). See PLAYER-060.
- `web/components/ReportReview.tsx` — entire new component; report review-status workflow. See PLAYER-061.
- `web/app/api/reports/review/route.ts` — entire new API route backing the above. See PLAYER-061.
- `web/app/api/players/[id]/last-payment/route.ts` — new route, 3-source payment-date resolution. See PLAYER-058.
- `web/app/api/players/linked-names/route.ts` — new route, linked-player display-name resolution. See PLAYER-067.
- `web/app/api/players/notify-added/route.ts` — new route, best-effort invite email on player creation. See PLAYER-057.
- `web/app/api/players/update-currency/route.ts` — new route, player/parent-own or platform-admin currency write. See PLAYER-059.
- `Player.currency` / `Coach.currency` required fields (type `Currency`) — new on both interfaces in `lib/types.ts`.
- `Plan.pricesByCurrency`, `Plan.sessionsPerMonthLimit`, `Plan.chatMessagesPerDayLimit`, `Plan.aiReportsEnabled`, `Plan.marketplaceEnabled`, `Plan.seatCap`, `Plan.waivesSessionFees`, `Plan.platformAdminOnly`, `Plan.platformFeePercent`, `Plan.locked`, `Plan.accessDurationMonths`, `Plan.includedNotes` — new fields on `Plan` in `lib/types.ts` (the whole admin-editable Plan Catalog shape).
- `Report.reviewStatus` (`ReportReviewStatus` = `'not_reviewed' | 'under_review' | 'completed'`), `Report.reviewedAt`, `Report.reviewedBy` — new fields on `Report` in `lib/types.ts`.
- Independent-coach self-service "+ Add Player" with roster-cap enforcement — `PlayersClient.tsx`. See PLAYER-056.
- Attendance roster active-pack requirement (`hasActivePackFor`) blocking roster additions — `AttendanceClient.tsx`. See PLAYER-045.
- Attendance roster CSV import (name/email match) — `AttendanceClient.tsx`. See PLAYER-045.
- Attendance history bulk CSV import (date/player/status, per group) — `AttendanceClient.tsx`. See PLAYER-064.
- `AuthGuard.tsx`'s player/parent subscription-page carve-out (`isOwnSubscriptionPage`). See PLAYER-008/066.
- Academy players no longer blocked from their own Subscription page (add-on purchases). See PLAYER-066.
- Client-side 50MB hard upload cap with a clear error message (`MAX_UPLOAD_BYTES` in `NewSessionForm.tsx`). See PLAYER-012.
- Staff-only "Last Payment Date" detected-vs-manual UI in both `PlayerProfileClient.tsx` and `EditPlayerForm.tsx`. See PLAYER-003/004/058.
- `waivesSessionFees` + `accessDurationMonths`/`academy.accessExpiresAt` "AI monitoring window" narrower-than-fee-waiver eligibility clause. See PLAYER-025/BR-29.
- Independent coach's own Coach Pro plan covering AI reports for every roster player. See PLAYER-025.

### CHANGED (this merge)

- `SessionsClient.tsx:aiReportsIncludedForPlayer` — was a 2-way check (own plan OR academy fee-waiver), now 3-way (own plan OR time-boxed academy waiver OR independent coach's own plan). See PLAYER-025.
- `web/app/api/ai-report/route.ts` — no longer auto-emails on generation; inserts `review_status: "not_reviewed"`. See PLAYER-031 (REMOVED) / PLAYER-061.
- `web/app/api/reports/send-email/route.ts` — new `400` gate requiring `review_status === "completed"` before it will send. See PLAYER-034.
- `web/components/ReportActions.tsx` — "Email Report" button now `disabled` unless `reviewStatus === "completed"`, with an explanatory tooltip. See PLAYER-034.
- `web/app/api/storage/sign-upload/route.ts` — bucket created with no `fileSizeLimit` override (was 500MB), now inherits the project's global 50MB cap; paired with a new explicit 50MB client-side check. See PLAYER-012/BR-6b.
- `EditPlayerForm.tsx` — player-facing Plan picker narrowed from 3 options to `["Free", "Player Pro"]` (Coach Pro removed — now purely a coach's own plan); new staff-only Last Payment Date field + detected-payment context line. See PLAYER-004.
- `PlayersClient.tsx` — added the independent-coach "+ Add Player" flow entirely (roster cap, duplicate-email check, notify-added trigger). See PLAYER-056.
- `PlayerProfileClient.tsx` — added the staff-only "Last payment date" row (fetched from the new API route). See PLAYER-003.
- `AttendanceClient.tsx` — roster-add now pack-gated (`hasActivePackFor`); added roster CSV import and attendance-history CSV import. See PLAYER-045/064.
- `AuthGuard.tsx` — added the `isOwnSubscriptionPage` redirect carve-out. See PLAYER-008.
- `app/(dashboard)/players/[id]/subscription/page.tsx` — no longer refuses to render for an academy player; passes `isAcademyPlayerServer(id)` down as a prop instead. See PLAYER-066.
- `app/(dashboard)/players/[id]/reports/page.tsx` — now filters to `reviewStatus === "completed"` for non-staff viewers, and renders the interactive `ReportReview` component instead of a static summary for staff viewers. See PLAYER-062/061.
- `ReportsClient.tsx` — report cards now show a `ReportStatusBadge` and embed the interactive `ReportReview` editor instead of a plain summary paragraph. See PLAYER-035.
- `NewSessionForm.tsx` — `sessionsLimitForPlan` call site updated to the new 2-arg signature (fetches `plans` via `fetchActivePlans()` on mount); added the 50MB post-transcode size check. See PLAYER-014/012.
- Every server-side RBAC read in this domain's API routes (`reactivate-player`, `notify-added`, `update-currency`, `linked-names`, `reports/review`, and (via `server-auth.ts`) every other route using `getCaller`/`callerCanAccessPlayer`) — now reads `user.app_metadata` instead of `user.user_metadata`. This is an Auth-domain-owned change but was independently re-confirmed against every Player-domain route file read this pass.

### REMOVED (this merge)

- **Automatic report email on generation** (old PLAYER-031) — no `nodemailer` call remains anywhere in `web/app/api/ai-report/route.ts`. Fully replaced by the explicit, review-gated send in PLAYER-034, itself only reachable once a report reaches `completed` review status.
- **Coach Pro as a player-selectable plan** in `EditPlayerForm.tsx`'s subscription-plan picker — the `PLANS` constant dropped from `["Free", "Player Pro", "Coach Pro"]`-shaped (per the prior analysis) to `["Free", "Player Pro"]`. Coach Pro is now exclusively a coach's own plan (see `Coach.subPlan`), never assignable to an individual player record through this form.
- **500MB bucket-level upload size override** on the `session-videos` bucket — the bucket now simply inherits whatever the Supabase project's own global storage cap is (50MB on the project's current Free tier), with the actual enforcement point moved to an explicit, clearly-messaged client-side check in `NewSessionForm.tsx` instead of an opaque storage-API failure.
- **Unconditional read-only Reports page for a player-scoped view** — the old `players/[id]/reports` page (per the prior analysis: "server component, read-only list, no filters") is gone; it's replaced by a page that both filters (for player/parent) and offers an interactive review editor (for staff), described in PLAYER-061/062.

### Gaps

**PLAYER-GAP-01 — Zero test coverage for the entire report-review workflow**
- Category: Test Coverage
- Description: No test file exists for `ReportReview.tsx`, `ReportActions.tsx` (its new `disabled` gating specifically), or `ReportsClient.tsx`'s new status-badge/embedded-review rendering, confirmed by directly listing `web/tests/components/`. The `/api/reports/review` route also has no dedicated test file under `web/tests/api/reports/`. This is new, business-critical, security-relevant logic (a player/parent's ability to see a report at all now depends entirely on this workflow functioning correctly) shipped with no automated coverage at all — not even stale coverage to fix, just absent.
- Recommendation: add `tests/api/reports/review.test.ts` (all branches: 400 missing fields, 400 invalid status, 401, 403 wrong role, 403 no player access, 500 no service key, happy path for each of the 3 statuses, reopen-from-completed) and `tests/components/ReportReview.test.tsx` / extend `ReportsClient`/`ReportActions` tests for the new gating.

**PLAYER-GAP-02 — `plan-features.test.ts` is actively broken, not just outdated**
- Category: Test Coverage / Regression Risk
- Description: As documented in §8, this file will throw (not just assert incorrectly) against the current 2-arg signature. Because it's the *only* existing unit-test coverage for the single most consequential change in this merge, there is currently no working automated signal at all for the Plan Catalog gating mechanism that the whole plan/pricing/eligibility surface of this domain now depends on.
- Recommendation: rewrite immediately with a `plans` fixture array; treat as the highest-priority test debt in the domain.

**PLAYER-GAP-03 — Pose-pipeline success path remains untested (carried forward, unchanged)**
- Category: Test Coverage
- Description: As in the prior analysis, `PLAYER-021`'s pose-*failure* message is the only automated coverage of the pose/biomechanics pipeline; the success path (real pose extraction → biomechanics computation → report save) still has no confirmed non-`@slow` coverage, and `lib/biomechanics.ts`/`lib/ball-tracking.ts` still have zero direct unit tests (`web/tests/unit/lib/` contains only `plan-features.test.ts` and `server-auth.test.ts`, confirmed this pass).
- Status: carried forward, re-confirmed still true.

**PLAYER-GAP-04 — Session-deletion / report-deletion asymmetric cleanup (carried forward, unchanged)**
- Category: Data Integrity
- Description: Deleting a report does not roll back the session's `ball_speed_kmh`/`front_knee_angle_deg` snapshot or the player's `bio_*` snapshot fields written at generation time (PLAYER-037) — both are left stale. Session deletion does cascade to its reports (PLAYER-018), but the reverse relationship remains asymmetric. Not re-verified line-by-line this pass but no code in either delete route (both re-read in full) touches those snapshot fields.
- Status: carried forward from prior analysis, consistent with the current `reports/delete/route.ts` and `sessions/delete/route.ts` re-reads.

**PLAYER-GAP-05 — `players/[id]/reports`'s review-visibility filter has no server-side (RLS) backstop confirmed in this domain**
- Category: Security-Authorization / REQUIRES VALIDATION
- Description: As noted in PLAYER-062, the completed-only filter for player/parent viewers is applied in the server *page component* (`allReports.filter(...)`), after `fetchReportsServer(id)` has already returned every report for that player regardless of review status. Whether Supabase RLS on the `reports` table would also block a player/parent's own direct query for a non-completed report (defense in depth) was not confirmed from any file read in this domain's scope.
- Recommendation: confirm (likely in a Data/RLS-focused domain document, or by reading `schema-notes.md`/live RLS policies) whether `reports` RLS itself also enforces `review_status = 'completed'` for player/parent roles, independent of this page's own filter.

**PLAYER-GAP-06 — Dead/unused localStorage utility modules**
- Category: Dead Code
- Description: `lib/session-store.ts` (`getStoredSessions`/`addStoredSession`) and `lib/player-store.ts` (`savePlayerEdits`/`getPlayerEdits`/`applyEdits`) both exist and are fully implemented, but a repo-wide grep for their exported function names across every `.tsx` file in `web/` returned zero matches — neither module is imported or called anywhere in the current UI. Both appear to be leftover from an earlier (pre-Supabase?) local-storage-backed prototype of this domain.
- Status: UNKNOWN whether these are intentionally kept for a future feature or should be deleted; flagged as dead code, not a functional gap.

**PLAYER-GAP-07 — Action-type/injury-risk classification thresholds vs. any external ground-truth documentation (carried forward, unchanged)**
- Category: Business Rule / REQUIRES VALIDATION
- Description: The prior analysis flagged that `classifyActionType`/`classifyInjuryRisk`'s exact thresholds diverge from an external project-documentation file (`PACE_HQ_Complete_Project_Documentation.md`, not re-read this pass). The formulas themselves are confirmed byte-for-byte unchanged in this merge (PLAYER-023/024), so this gap is carried forward unchanged and unresolved — still worth a product/coaching-SME review of whether the current thresholds (e.g. "35° from 90°" for side-on/front-on) are the intended ones.
- Status: carried forward, not re-investigated this pass (out of budget/scope for a re-verification of an external doc this session did not have access to).

**PLAYER-GAP-08 — Camera-calibration-per-academy-not-per-session divergence (carried forward, unchanged)**
- Category: Business Rule / REQUIRES VALIDATION
- Description: As in the prior analysis, calibration is reused per academy/angle rather than redone per session; not re-investigated against any external doc this pass, but the mechanism itself (`CameraCalibrationModal.tsx`, `upsertCameraCalibration` with `onConflict: "academy_id,angle"`) was spot-checked and confirmed unchanged.
- Status: carried forward.

**PLAYER-GAP-09 — Reactivation UI entry point still not located (carried forward, unchanged)**
- Category: UI / REQUIRES VALIDATION
- Description: As in PLAYER-006, no button/link triggering `POST /api/reactivate-player` was found in any of this domain's own components. Still unresolved.
- Status: carried forward.

**PLAYER-GAP-10 — `resolvePlanPrice` consistency across checkout routes unverified**
- Category: REQUIRES VALIDATION
- Description: Per PLAYER-060, `SubscriptionPage.tsx`'s *display* logic was confirmed to use `resolvePlanPrice` consistently for Player Pro/Library/Assessment pricing, but the actual Stripe checkout-session-creation routes that charge the buyer (Payments-domain files, e.g. whatever backs the "Upgrade" button's redirect) were not read in this pass — it is not confirmed from this domain's own files whether the amount actually charged always matches what's displayed here, only that the currency-lib doc comment claims it does ("Shared by every plan-based Stripe checkout route so 'does this plan support the buyer's currency' is decided in exactly one place").
- Status: REQUIRES VALIDATION by a Payments-domain-focused pass.
