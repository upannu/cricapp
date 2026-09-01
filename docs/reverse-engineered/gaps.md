# Requirements Gaps and Ambiguities

Cross-domain table of ambiguous, inconsistent, or risky behavior found while reverse-engineering this codebase. Nothing here is silently resolved — each row states what was observed and why it's worth a human decision. See the end of this file for a cross-domain synthesis of the highest-risk items.

---

## AUTH — Auth & RBAC — Authentication, Sessions, Account Lifecycle

*Source: [`domains/auth.md`](./domains/auth.md)*


### 9a. Summary of what's NEW / CHANGED / REMOVED since the prior analysis

**NEW (did not exist before this merge):**
- `/register` public, code-gated player self-registration page and its two backing API routes (`GET`/`POST /api/public-register-player`) — AUTH-041–045.
- `/api/complete-signup` — the entire server-side signup-finalization step (AUTH-046–049).
- `/api/players/linked-names` — role-switcher display-name resolution (AUTH-050).
- The `app_metadata`-over-`user_metadata` security migration, cross-cutting the whole domain (AUTH-051).
- Login page unconfirmed-email detection + resend flow (AUTH-052).
- Signup page live duplicate-account warning on the account-email field (AUTH-053).
- `players.registration_code` column (undocumented in `schema-notes.md` — see gap below).
- `isAlwaysPublicPage` middleware category (`/about`, `/contact`, `/terms`, `/privacy`, `/register`).
- `/api/complete-signup`, `/api/contact`, `/api/public-register-player`, and the broadened `/api/cron/` prefix in the middleware's `isAuthApi` allowlist.
- Auto-CC to a hardcoded `support@crichq.com.au` on every admin-signup notification email.

**CHANGED (existed before, behavior or data source is different now):**
- **Every** privileged route's authorization check now reads `app_metadata` instead of `user_metadata` (AUTH-007, 019, 023, 026, 027, 028, 029, 030, 032, 035, 037, 039 — 12 requirements touched by the same underlying migration).
- Signup no longer writes `role`/`approved` client-side at `signUp()` time — that decision moved entirely server-side into `/api/complete-signup` (AUTH-011).
- `player`/`parent` self-signups now **auto-approve** instead of always queuing for admin review (AUTH-012, AUTH-047) — a genuine new business rule, not just a refactor.
- An independent (non-invited) coach approved via `approve-user` now gets a `coaches` row **auto-created** instead of silently ending up with no `coach_id` (AUTH-024).
- Link-request approval now dedupes `player`/`parent` identities per-child instead of per-role, fixing a real bug where a second child's link request was silently swallowed (AUTH-025).
- `lookup-player` now also reports `additionalCount` (sibling count) (AUTH-017).
- `notify-admin-signup` now always CCs a hardcoded support address (AUTH-013).
- NavBar role switcher now resolves and shows real per-child names instead of a repeated generic role label (AUTH-031).

**REMOVED:** None identified. No requirement from the prior analysis was found to have been eliminated outright — every prior `AUTH-0xx` still has a directly corresponding current behavior (even where the underlying data source or a sub-rule changed). The demo-account dead code (AUTH-040) remains present and still dead, neither removed nor reactivated.

### 9b. Gaps and ambiguities table

| Gap ID | Area | Observed Behavior | Why It's Risky | Status |
|---|---|---|---|---|
| AUTH-GAP-001 | Approval gate never checked server-side | No privileged route checks `app_metadata.approved` — only `role`. `complete-signup` sets `role` immediately (before human review) for `academy_admin`/`coach`. An unapproved self-signed-up `academy_admin`/`coach` can still successfully call `invite-coach` and similar role-gated routes. | Same real risk as before this merge — an unapproved account with a self-selected privileged role can act on the system before any human ever reviews the request. The migration to `app_metadata` closed the *client-can-forge-its-own-role* vector but did **not** close this one. | UNCHANGED (carried forward, now against `app_metadata`) |
| AUTH-GAP-002 | Duplicated authorization logic | `callerCanAccessPlayer()` and `canAccessPlayerServer()` still implement the identical 5-branch logic independently. | A future rule change made in one and not the other silently diverges; only one has direct unit coverage. | UNCHANGED |
| AUTH-GAP-003 | Trust boundary on `invite-coach`'s `coachId` | Still accepts a client-supplied `coachId` with no verification it belongs to the caller's own academy. | An `academy_admin` could invite someone and link them to any coach ID in the system. | UNCHANGED |
| AUTH-GAP-004 | `listUsers({ perPage: 1000 })` pagination | `check-existing-account`, `request-additional-role`, `approve-user`, `reject-user` still list-and-scan rather than paginate/targeted-lookup. | Silently breaks past 1000 total users. | UNCHANGED |
| AUTH-GAP-005 | Test fixtures/mocks still write `user_metadata` | See §8 in full — `tests/mocks/caller.ts`, `tests/seed/fixtures.ts`, `tests/seed/seed.ts` all construct auth users via `user_metadata`, which the current production code no longer reads for authorization. | This is the concrete, verified explanation for why a large share of this domain's existing tests will now fail, and why some may *appear* to show routes returning 403 in new places — it's fixture staleness, not a source-code reordering. **High confidence, directly quoted evidence.** | NEW (this merge introduced the mismatch) |
| AUTH-GAP-006 | `players.registration_code` undocumented | `/api/public-register-player` reads/writes this column; it does not appear anywhere in `tests/seed/schema-notes.md`, violating the project's own `AGENTS.md` convention. | Anyone relying on `schema-notes.md` as the schema source of truth (per `AGENTS.md`, "the DB schema lives entirely in the hosted dev Supabase project... `schema-notes.md` is the only source of truth for it here") will not know this column exists. | NEW |
| AUTH-GAP-007 | `/register`'s hardcoded single-academy + code list | `TARGET_ACADEMY_ID` and `VALID_CODES` are both hardcoded constants scoped to one specific academy ("Maz Sheik"), explicitly noted in-code as a known limitation. | Doesn't generalize to any other academy without a code change; no admin UI to manage codes/target academy. | NEW (explicitly self-documented as a known limitation in the source) |
| AUTH-GAP-008 | Reset-password stuck state | Still no timeout/error state on an invalid/expired token — infinite "Verifying your link…" spinner. | Unchanged UX dead-end. | UNCHANGED |
| AUTH-GAP-009 | Inconsistent error-message specificity | Login is deliberately generic; forgot/reset-password still surface Supabase's raw `err.message`. | Unchanged inconsistency. | UNCHANGED |
| AUTH-GAP-010 | Guardian-consent parent/player asymmetry undocumented | A `parent` can confirm consent for a player of any age, including `Senior`, with no equivalent restriction. | Unchanged, still undocumented as intentional-or-not. | UNCHANGED |
| AUTH-GAP-011 | Client-only role confinement | `AuthGuard`'s `/portal` confinement and approval gate are still React `useEffect`s, not enforced in middleware (which now has less excuse, since `app_metadata` is available in the JWT it already decodes via `getUser()`). | Possible flash-of-unauthorized-content window unchanged. | UNCHANGED |
| AUTH-GAP-012 | `/players` as universal landing page | Middleware still always lands everyone on `/players`, even though player/parent are immediately bounced to `/portal` client-side — a redundant double navigation. | Minor UX/perf inefficiency, unchanged. | UNCHANGED |
| AUTH-GAP-013 | `approve-user` "new" path metadata replacement shape | Still calls `updateUserById(authUser.id, { app_metadata: extraMeta, email_confirm: true })` with a **fresh** object (`{approved, academy_id?, player_id?, coach_id?}`), not spread against the account's existing `app_metadata` — unlike the "link" branch's explicit `{...meta, linkedIdentities}`. Since `role` now lives in `app_metadata` too (post-migration) and is **not** included in `extraMeta`, this is a materially higher-stakes version of the old gap: if Supabase's Admin API ever replaces rather than merges `app_metadata`, approval would silently wipe the very `role` value `complete-signup` set at signup time. | Whether Supabase's Admin API merges or replaces `app_metadata` on `updateUserById` was not verified against the SDK directly — same open question as before, now with a bigger blast radius since `role` itself lives in the field being partially overwritten. `REQUIRES VALIDATION`. | CHANGED (same shape, higher stakes post-migration) |
| AUTH-GAP-014 | `TARGET_ACADEMY_ID`/`VALID_CODES` hardcoding | See AUTH-GAP-007 — listed again here for traceability under the gap-table format. | — | NEW (duplicate cross-reference of AUTH-GAP-007) |
| AUTH-GAP-015 | `/register` → `/signup` identity linkage is by email match only | The registration flow's own hint text says "use this same email at /signup" to later get a login; `complete-signup`'s player/parent auto-approval (AUTH-047) then trusts that email match alone as sufficient proof the signer-upper is the actual parent/player, with **no additional verification** (no confirmation link to the registered email specifically for this purpose, no code re-entry, nothing beyond "an email matches a `players.email` row"). | Anyone who learns (or guesses) a registered player's email could self-signup as that player's `parent` and gain `approved:true` immediate access to their data — same general trust model as the pre-existing `lookup-player`/`complete-signup` player-linking flow (not new in kind), but the new `/register` page is a much lower-friction way to get a real, coach-blessed-looking `players` row into the system in the first place (no coach involvement required for a fresh registration under a valid code), which somewhat lowers the bar for the email in that row to be attacker-controlled from the start. `REQUIRES VALIDATION` — whether this composed risk was considered. | NEW (composed risk from two features interacting) |

---

## PLAYER — Player — Players, Sessions, Video/Pose Pipeline, Reports, Performance

*Source: [`domains/player.md`](./domains/player.md)*


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

---

## MKT — Marketplace — Coach Discovery, Bookings, Session Packs, B2C Stripe Commerce

*Source: [`domains/marketplace.md`](./domains/marketplace.md)*


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

---

## ADMIN — Academy & Platform Admin — Org Management, B2B Billing, Admin Surfaces

*Source: [`domains/academy_admin.md`](./domains/academy_admin.md)*


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

---

## PORTAL — Portal & Content — Player/Parent Portal, Academy Curriculum, Messaging

*Source: [`domains/portal_content.md`](./domains/portal_content.md)*


### 9.0 Change inventory for this domain (as required by task scope)

**NEW**:
- `web/app/about/page.tsx` — public About page (PORTAL-018)
- `web/app/contact/page.tsx` — public Contact form (PORTAL-019)
- `web/app/api/contact/route.ts` — Contact form API (PORTAL-020)
- `web/app/privacy/page.tsx` — public Privacy Policy (PORTAL-021)
- `web/app/terms/page.tsx` — public Terms & Conditions (PORTAL-022)
- `web/components/LegalPageShell.tsx` — shared layout for the four pages above (PORTAL-023)
- `web/components/Footer.tsx` — global authenticated-app footer (PORTAL-024)
- `web/lib/email-templates.ts`'s `buildContactFormEmailHtml()` — new template function feeding
  PORTAL-020 (the rest of `email-templates.ts` belongs to other domains, not re-documented here)
- `middleware.ts`'s `isAlwaysPublicPage` set and the `/api/contact` entry in `isAuthApi`
  (PORTAL-025)

**CHANGED**:
- `web/components/PortalClient.tsx` (confirmed 48-line diff area) — re-read in full; no
  business-rule change found in this domain's logic (consent, XP display, unpaid-pack banner
  all match prior behavior exactly). The diff appears concentrated in styling/structure rather
  than logic, based on full re-verification against current source; PORTAL-001/002 requirement
  text updated only to reflect re-confirmation, not a behavior change.
- `web/components/NavBar.tsx` (confirmed 39-line diff area) — player/parent nav links are
  **unchanged** (`Academy` + `Find a Coach`, unaffected by the new public pages, which live
  entirely outside NavBar's reach). The diff is attributable to unrelated NavBar features
  (role-switcher dropdown, linked-identity display, admin-tools dropdown) that are outside this
  domain's scope — noted here only to confirm no portal-relevant nav change occurred.
- `web/app/api/notify-new-article/route.ts` (confirmed 2-line diff) — admin-role check migrated
  from `user_metadata` to `app_metadata` (PORTAL-014, BR-17).
- `web/middleware.ts` (confirmed 28-line diff area) — new `isAlwaysPublicPage` allowlist and
  `/api/contact` exemption (PORTAL-025); the AUTH-domain-owned entries
  (`/api/public-register-player`, `/api/complete-signup`, `/register`) are noted only for
  completeness per task instructions, not re-documented in depth here.
- `web/lib/types.ts` (+140 lines) and `web/lib/db.ts` (+225 lines) — grepped specifically for
  this domain's types/functions (`Article`, `ArticleCategory`, `DailyTip`, `ArticleRead`,
  `Message`, `MessageChannel`, and every `db.ts` function this domain calls); **all found
  unchanged in shape and logic**. The bulk of both files' growth is attributable to other
  domains (plans/billing, action plans, S&C workouts, video annotation, etc.) not in this
  domain's scope. One concrete confirmed improvement: `fetchMessages` now has an explicit
  `.order("date", desc)` clause (BR-16) that the prior analysis could not confirm.

**REMOVED**: none found. Every requirement, business rule, and gap from the prior analysis was
re-verified present and unchanged in current source; nothing in this domain's scope was deleted
by the merge.

---

| Gap ID | Area | Observed Behavior | Why It's Ambiguous/Risky | Suggested Requirement/Question |
|---|---|---|---|---|
| PORTAL-GAP-001 | Academy unlock gate | Undocumented "Library" standalone subscription unlocks paid Academy stages exactly like Player Pro. Unchanged from prior analysis. | Product-doc completeness risk, not a code defect. | Confirm whether any external product doc has since been updated to describe this path. |
| PORTAL-GAP-002 | XP/completion-percent | `ACADEMY_TOTAL_ARTICLES` is a hardcoded `29`; now explicitly commented as intentional. | If fewer than 29 articles are currently published, 100%/the all-articles bonus is unreachable through reading alone — the code comment acknowledges the tradeoff but doesn't change the risk. | Confirm current live published-article count against 29 in the dev/prod DB. |
| PORTAL-GAP-003 | Daily tip system | No push notifications; `fetchTipArchive` still only called from the admin tool, no player-facing archive UI. Unchanged. | Aspirational-only feature if a product doc still promises it. | Confirm current scope/priority. |
| PORTAL-GAP-004 | Completion certificate | No certificate generation anywhere (re-confirmed via fresh grep). Unchanged. | Same category as GAP-003. | Confirm certificate generation is still wanted. |
| PORTAL-GAP-005 | AcademyLearnClient loading state | Infinite spinner for accounts with no linked `playerId` — **re-confirmed present, byte-identical to pre-merge**, untouched by the 120-commit merge despite `PortalClient`'s equivalent fix existing in the same codebase as a working reference pattern. | A known, already-diagnosed, easily-fixable bug shipped unfixed across a substantial merge. | Fix the loading guard to mirror `PortalClient`'s `loading && user?.playerId` pattern; add PORTAL-TC-042 as an enforced regression test. |
| PORTAL-GAP-006 | Bulk messaging | `BulkMessageModal` still never calls `/api/send-message`/`/api/send-sms` — re-confirmed byte-identical to pre-merge. | Coaches using "Bulk Message" likely still believe messages are being delivered when they are not; the UI's own "Sent to N players" copy actively claims delivery. | Same as before: confirm intent with product; either wire real delivery or change the UI copy to stop claiming "Sent." |
| PORTAL-GAP-007 | New-article broadcast email | Fully implemented, tested-in-name (see GAP-017), admin-only bulk-email broadcast; still absent from any external product doc found in the repo. | Undocumented production behavior with real user-facing consequences, unchanged category from before. | Document formally; confirm no opt-out mechanism is desired for players. |
| PORTAL-GAP-008 | MessageModal send/log atomicity | `insertMessage()` still un-guarded (`await` with no try/catch) after a successful send. Unchanged. | A log-write failure after a real send leaves the UI indefinitely stuck with no confirmation and no error. | Wrap the logging call in its own try/catch. |
| PORTAL-GAP-009 | Tip-streak attribution for parent accounts | `recordTipView(playerId)` still fires identically for `player` and `parent` roles. Unchanged. | A parent checking the portal "farms" the streak/XP on the child's behalf with no attribution distinction. | Decide/document whether this proxy behavior is intended. |
| PORTAL-GAP-010 | Parent vs player portal experience | Still byte-for-byte identical except the consent card. Unchanged. | A parent can still trigger Stripe checkout (`OverduePackBanner`) or accumulate tip-streak XP on the child's behalf. | Confirm whether full functional parity is the deliberate design. |
| PORTAL-GAP-011 | `lib/messages-store.ts` orphaned code | Still zero importers anywhere (re-confirmed via fresh grep). Unchanged. | Dead code risk of confusing a future engineer. | Confirm safe to delete. |
| PORTAL-GAP-012 | SMS/word-count content policies unenforced | Daily tips still have no word-count enforcement; SMS still UI-only 160-char cap. Unchanged. | Content-policy compliance remains admin/coach-discipline-only. | Decide whether worth server-side enforcement. |
| PORTAL-GAP-013 | Coach-assigned articles entirely absent | Re-confirmed zero code presence (fresh grep for `assignArticle`/etc.). Unchanged. | Coaches still have no way to direct a specific player to a specific article. | Confirm roadmap status. |
| PORTAL-GAP-014 | `/api/contact` has no spam/abuse protection | The route is public, unauthenticated, and has no CAPTCHA, no per-IP/per-email rate limiting, and no honeypot field, in either the route or the client form. | A publicly POST-able mail-sending endpoint with no throttling is a straightforward spam/abuse vector once discovered, and every submission burns a Gmail send against the shared account's sending limits/reputation. | Confirm whether rate limiting or a CAPTCHA (e.g. reCAPTCHA/Turnstile) is planned before this goes to production traffic. |
| PORTAL-GAP-015 | `/api/contact` submissions are never persisted | Unlike coach→player messaging (`messages` table), a contact form submission's only trace is the outbound email itself — if `sendMail()` fails after the 400/500 config checks pass (e.g. Gmail transient error, SMTP throttling), the visitor sees an inline error and there is no database row, log table, or retry queue recording that the attempt happened at all. | Support/product has no way to audit "who tried to contact us and failed" independent of email-server logs, and no way to retry a failed send without asking the visitor to resubmit. | Confirm whether a lightweight audit table (or at minimum server-side logging) is wanted for failed/successful contact submissions. |
| PORTAL-GAP-016 | Zero automated test coverage for the entire new public-pages surface | No test of any kind (unit/component/API/e2e) exists for `/about`, `/contact` (page or API), `/privacy`, `/terms`, `Footer`, or `LegalPageShell` — confirmed via repo-wide filename search finding no matches. | A brand-new, publicly-reachable, unauthenticated surface — including a mail-sending API endpoint — shipped with no regression protection at all. | See RECOMMENDED_TEST items 1–4 in §8; this is the single largest coverage gap introduced by this merge in this domain. |
| PORTAL-GAP-017 | `notify-new-article` test suite likely gives false results post-RBAC-migration | `tests/api/notify-new-article.test.ts`'s admin-caller fixture, built via `tests/mocks/caller.ts`'s `rawUser()`, constructs `{ user_metadata: { role: "platform_admin" } }`, but the route now reads `caller?.app_metadata?.role`, so `caller?.app_metadata?.role !== "platform_admin"` evaluates `undefined !== "platform_admin"` → `true` → 403, for every test in the file that intends to simulate a platform-admin caller. Traced directly by reading both the route and the mock helper, not inferred. | Anyone running this suite today would see the "admin-authorized" test cases fail with a 403-related assertion error and could misread that as a route regression, when the actual issue is a stale test fixture — exactly the class of false signal this whole documentation pass was warned to discount. | Update `tests/mocks/caller.ts`'s `rawUser()` (or add a new `appUser()` helper) to place `metadata` under `app_metadata` instead of/in addition to `user_metadata`, matching the migrated route code, then re-run this suite to get a trustworthy signal. |
| PORTAL-GAP-018 | `LegalPageShell` and the global `Footer` are visually/content inconsistent | `LegalPageShell`'s own footer (About/Contact/Terms/Privacy links + copyright) has no AI-disclaimer line; the separate `Footer` component mounted in `(dashboard)/layout.tsx` has the AI-disclaimer but no cross-links to the legal pages. A user moving from a public legal page into the authenticated app sees two differently-composed footers. | Minor UX inconsistency, not a functional bug, but worth flagging since both were introduced in the same merge and a single shared footer component seems like the more likely original intent. | Confirm whether unifying into one footer component (or explicitly keeping them separate, with a documented reason) is intended. |

### Summary: domain state after this merge

| Area | Implementation status |
|---|---|
| 4-stage curriculum, unlock gates, XP table, stage/all-articles bonuses, tip streak, badges | IMPLEMENTED, unchanged, re-verified line-by-line — this merge touched none of the core gamified reading loop's logic |
| Coach messaging (email/SMS individual send + logging) | IMPLEMENTED, unchanged |
| Bulk messaging actual delivery | NOT_IMPLEMENTED, unchanged (still logs-only, PORTAL-GAP-006) |
| AcademyLearnClient no-player infinite spinner | Confirmed still-present bug, unchanged (PORTAL-GAP-005) |
| New-article broadcast email | IMPLEMENTED; its admin-role check correctly migrated to `app_metadata`, but its test suite was not updated to match (PORTAL-GAP-017) |
| Public About/Privacy/Terms pages | IMPLEMENTED — static, hardcoded content, correctly public per `middleware.ts`, zero test coverage |
| Public Contact page + API | IMPLEMENTED — functional happy path, but no spam protection, no persistence of submissions, and zero test coverage (PORTAL-GAP-014/015/016) |
| Global authenticated-app Footer | IMPLEMENTED — correctly scoped to `(dashboard)` only, mild content/consistency mismatch with `LegalPageShell`'s own footer (PORTAL-GAP-018) |
| Middleware public-page routing for the new pages | IMPLEMENTED and correct — verified directly, not merely asserted |

**Bottom line**: this merge left the Academy/gamification/messaging core of this domain
completely untouched at the logic level (every number, every bug, every gap from the prior
analysis reproduces exactly), made exactly one targeted RBAC-migration edit inside this
domain's own route code (`notify-new-article`, 2 lines), and added a self-contained new public
marketing/legal surface (4 static pages + a mailer API + two new shared UI components) that is
functionally complete for its happy path but currently has zero automated test coverage and two
concrete production-readiness gaps (no spam protection, no submission persistence) worth a
product decision before real traffic hits `/contact`.

---

## PAY — Payments Core — Stripe Webhook, Cron, Invoicing, AI Coach Chat

*Source: [`domains/payments_core.md`](./domains/payments_core.md)*


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

---

## Cross-Domain Synthesis — Highest-Risk Items (Fresh Pass)

This synthesis reflects the codebase as it exists **after** the 120-commit merge, not the prior analysis. 77 gaps were logged across the six fresh domain passes (counted precisely by ID, across the mixed table/bold-header formats different agents used). One meta-finding cuts across five of the six domains and explains most of this session's test-suite breakage; the rest are itemized by severity below.

### Root cause, found independently by 5 of 6 agents (not 5 separate bugs)

`web/tests/mocks/caller.ts`'s shared `rawUser()` fixture helper still constructs fake authenticated users via `{ user_metadata: { role, ... } }`. Every route in the app now reads `role`/`approved`/`academy_id`/`coach_id`/`player_id` from `app_metadata` instead (§1 of `architecture.md`). Against this stale fixture, every role check resolves to `undefined` and the route falls through to a 403 — which is exactly the "wrong status code" pattern that triggered this whole fresh-analysis phase. Confirmed by direct source-and-test reads in **Auth** (`AUTH-GAP-005`), **Marketplace** (`MKT-GAP-25`), **Academy/Admin** (`ADMIN-GAP-011`), **Portal/Content** (`PORTAL-GAP-017`), and implicitly in Payments Core's own test-staleness notes. **The fix is one change to one shared helper file, not 42 individual test rewrites** — but per this phase's explicit instructions, no test file was modified to fix it; this is a documented finding, not an applied fix.

### Tier 1 — confirmed, severe, money/security/data-integrity-affecting

| Rank | Gap ID | Summary | Status vs. prior analysis |
|---|---|---|---|
| 1 | `MKT-GAP-20` | **NEW.** The monthly referral-commission cron sums booking/pack revenue across academies with different currencies (AUD/GBP/USD/NZD) with **no currency conversion**, then stores and displays the result as a flat AUD figure. Any referred academy/coach/player operating in a non-AUD currency with an active ongoing-commission referral produces a silently wrong commission amount. | New defect — the referral system itself is new this merge. |
| 2 | `PAY-GAP-016` | **NEW.** The daily `pack-auto-consume` cron automatically records attendance as `"Absent"` and draws down one session-pack credit for any agreed recurring-session day nobody logged attendance for — a real money/entitlement debit happening automatically, ahead of and without any human confirmation that the session didn't happen. | New defect — this cron is new this merge. |
| 3 | `AUTH-GAP-001` | Several privileged routes still do not check the `approved` flag server-side, only `role` — the same unapproved-account privilege-escalation class of bug identified in the prior analysis. Re-flagged, not confirmed fixed by this pass. | Carried forward from prior analysis, unresolved. |
| 4 | `MKT-GAP-17` | Stripe Connect Express account creation for a new coach is still confirmed broken against the live Stripe test account (`502`, per the test suite's own "KNOWN LIMITATION" comment) — the product's marketed marketplace-payout differentiator still cannot onboard a single new coach. | Carried forward, unresolved. |
| 5 | `MKT-GAP-10` | The "Credit to Pack" button on the Bookings page is still a confirmed silent no-op — `sessionCredits` never actually increments despite a success message. | Carried forward, unresolved — re-verified against current source this pass. |
| 6 | `PORTAL-GAP-006` | `BulkMessageModal` still never actually calls `/api/send-message`/`/api/send-sms` — logs a message row and claims success without delivering anything. Re-verified line-by-line against current source this pass; reproduces identically. | Carried forward, unresolved. |
| 7 | `PAY-GAP-002` | Stripe webhook still has no `event.id` deduplication — a redelivered `assessment_payment` event still double-grants a credit. | Carried forward, unresolved. |
| 8 | (root cause above) | The stale `user_metadata` test-mock helper — not itself a production defect, but the single highest-leverage fix available: one file change would likely resolve the majority of this session's ~118 failing Vitest tests. | New this pass (a consequence of the `app_metadata` migration). |

### Tier 2 — real defects, narrower blast radius or newly-shipped-untested

| Gap ID | Summary |
|---|---|
| `PAY-GAP-011` / `PAY-GAP-012` | The three brand-new cron jobs (`booking-reminders`, `pack-auto-consume`, `session-reminders`) and the three new `coach_subscription` webhook branches have **zero test coverage** of any kind. |
| `PORTAL-GAP-014` / `PORTAL-GAP-015` | The new public `/api/contact` endpoint has no spam/rate-limit protection and persists nothing to the database — a submission's only trace is the recipient's inbox. |
| `ADMIN-GAP-013` / `ADMIN-GAP-014` | The new Email Templates admin subsystem and the new plan-email resend route both shipped with zero test coverage, in violation of the repo's own `AGENTS.md` testing convention. |
| `MKT-GAP-14` | `create-checkout-session` (the player-facing subscription route) still silently accepts `plan: "Coach Pro"` for a `playerId`, even though the player-facing `SubscriptionPage` UI no longer offers that option — a dead-but-reachable, confusing code path. |
| `MKT-GAP-07` / `MKT-GAP-24` | The marketplace paywall (`canUseMarketplace`) and its new Coach-Pro-gated independent-coach visibility variant are both still enforced client-side only, with no confirmed server-side check. |
| `PAY-GAP-013` | The new `booking-reminders` cron depends on a `booking_reminder_log` table that is not documented anywhere in this repo's `schema-notes.md` or `seed.ts` — its existence in the live database cannot be confirmed from source. |
| `PAY-GAP-014` | Coach-chat's daily message-limit day boundary is UTC-based, while the four reminder/consumption crons in the same domain are Sydney-local — an inconsistency worth a deliberate decision, not necessarily a bug. |
| `MKT-GAP-23` | Marketplace-sourced booking requests never trigger the new `bookings/notify-created` confirmation email/SMS — only staff-created bookings do, an inconsistency between two creation paths for the same entity. |

### Tier 3 — architecture/documentation mismatches

- **The two root-level planning documents are now even further from current reality.** They already described a materially different, partly-unbuilt system before this merge (Python/FastAPI backend, 6-tier pricing, a quote-based B2B model — see the prior analysis). None of the genuinely new functionality landed this merge (referrals, coach subscriptions, multi-currency, report review, the cron expansion) is described in either document. The recommendation from the prior analysis — relabel or archive these documents rather than let them keep looking like current documentation — applies with even more force now.
- `ADMIN-GAP-007` — the quote-based B2B model remains entirely unbuilt (re-confirmed this pass).
- `ADMIN-GAP-010` — a stale competitor-comparison claim in the planning docs was independently re-flagged this pass.
- `ADMIN-GAP-015` — the inference that Plan Catalog fully replaced platform-pricing management is documented as the most likely explanation, but was not confirmed by tracing every player/coach checkout route's price-resolution path — flagged `REQUIRES_VALIDATION`, not asserted as fact.

**Recommendation, unchanged from the prior analysis and now more urgent:** these two documents should be updated, clearly relabeled as historical/aspirational, or retired — they will actively mislead anyone who reads them without also reading this audit, and that gap has only grown.

