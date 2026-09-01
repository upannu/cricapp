# Requirement-to-Code and Requirement-to-Test Traceability

Part 1 (per domain, below): Requirement → Component → File → Method/Class → Implementation Evidence.
Part 2 (end of file): a cross-domain coverage-matrix synthesis (Requirement ID | Coverage status | Gaps) — see the methodology note in [`test-cases.md`](./test-cases.md) about ID-precision differing by domain.

---

## AUTH — Auth & RBAC — Authentication, Sessions, Account Lifecycle

*Source: [`domains/auth.md`](./domains/auth.md)*


| Req ID | Requirement | File | Evidence |
|---|---|---|---|
| AUTH-001 | Block unauth'd access | `web/middleware.ts` | `if (!user && !isPublicPage && !isAlwaysPublicPage && !isAuthApi) return NextResponse.redirect(...)` |
| AUTH-002 | Public auth pages | `web/middleware.ts` | `isPublicPage = pathname.startsWith("/login") \|\| ...` |
| AUTH-003 | Auth-exempt API allowlist (CHANGED) | `web/middleware.ts` | `isAuthApi` — 9 prefixes, incl. new `complete-signup`, `contact`, `public-register-player`, broadened `cron/` |
| AUTH-004 | Logged-in bounced off public pages | `web/middleware.ts` | `if (user && isPublicPage && pathname !== "/signup") redirect("/players")` |
| AUTH-005 | `/signup` exception | `web/middleware.ts` | `pathname !== "/signup"` guard |
| AUTH-006 | Email/password login | `web/lib/auth.tsx` | `AuthProvider.login()` |
| AUTH-007 | Disabled-player lockout (CHANGED) | `web/lib/auth.tsx` | `data.user?.app_metadata?.player_id` |
| AUTH-008 | Generic error message | `web/app/login/page.tsx` | `handleSubmit()` |
| AUTH-009 | Redirect to /players | `web/app/login/page.tsx` | `router.push("/players")` |
| AUTH-010 | Existing-email → link flow | `web/lib/auth.tsx` | `check-existing-account` branch |
| AUTH-011 | New account creation (CHANGED) | `web/lib/auth.tsx` | `signUp({ options: { data: { name } } })` then `/api/complete-signup` |
| AUTH-012 | Pending-approval queued (CHANGED) | `web/app/api/complete-signup/route.ts` | `user_requests` insert only for academy_admin/coach branch |
| AUTH-013 | Admin notification (CHANGED) | `web/app/api/complete-signup/route.ts` | fire-and-forget `notify-admin-signup` call moved server-side |
| AUTH-014 | Password validation | `web/app/signup/page.tsx` | `handleSubmit()` |
| AUTH-015 | Role-specific required fields | `web/app/signup/page.tsx` | `handleSubmit()` |
| AUTH-016 | Debounced player lookup | `web/app/signup/page.tsx` | `useEffect` |
| AUTH-017 | GET /api/lookup-player (CHANGED) | `web/app/api/lookup-player/route.ts` | `additionalCount` field added |
| AUTH-018 | POST /api/check-existing-account | `web/app/api/check-existing-account/route.ts` | `POST()` |
| AUTH-019 | POST /api/request-additional-role (CHANGED) | `web/app/api/request-additional-role/route.ts` | `existingUser.app_metadata` |
| AUTH-020 | Player/parent → /portal | `web/components/AuthGuard.tsx` | `useEffect` |
| AUTH-021 | Approval-pending gate | `web/components/AuthGuard.tsx` | render branch |
| AUTH-022 | Client unauth redirect | `web/components/AuthGuard.tsx` | `useEffect` |
| AUTH-023 | approve-user admin gate (CHANGED) | `web/app/api/approve-user/route.ts` | `caller?.app_metadata?.role` |
| AUTH-024 | New-signup approval (CHANGED) | `web/app/api/approve-user/route.ts` | coach auto-creation block, lines 89-111 |
| AUTH-025 | Link-request approval (CHANGED) | `web/app/api/approve-user/route.ts` | per-(role,playerId) dedup, lines 143-146 |
| AUTH-026 | reject-user (CHANGED) | `web/app/api/reject-user/route.ts` | `caller?.app_metadata?.role` |
| AUTH-027 | pending-approvals (CHANGED) | `web/app/api/pending-approvals/route.ts` | `caller?.app_metadata?.role` |
| AUTH-028 | reactivate-player (CHANGED) | `web/app/api/reactivate-player/route.ts` | `caller?.app_metadata?.role` |
| AUTH-029 | invite-coach (CHANGED) | `web/app/api/invite-coach/route.ts` | `getCaller()` + `app_metadata` write |
| AUTH-030 | switch-role (CHANGED) | `web/app/api/switch-role/route.ts` | `caller.app_metadata` read+write |
| AUTH-031 | NavBar role switcher (CHANGED) | `web/components/NavBar.tsx` | `identityLabel()`, `linked-names` fetch |
| AUTH-032 | confirm-consent (CHANGED) | `web/app/api/confirm-consent/route.ts` | `user.app_metadata?.role` |
| AUTH-033 | Password reset request | `web/app/forgot-password/page.tsx` | `resetPasswordForEmail()` |
| AUTH-034 | Password reset completion | `web/app/reset-password/page.tsx` | `onAuthStateChange` |
| AUTH-035 | getCaller() (CHANGED) | `web/lib/server-auth.ts` | `user.app_metadata?.role` etc. |
| AUTH-036 | callerCanAccessPlayer() | `web/lib/server-auth.ts` | lines 37-55 |
| AUTH-037 | canAccessPlayerServer() (CHANGED) | `web/lib/supabase-server.ts` | `user.app_metadata?.role` |
| AUTH-038 | isAcademyPlayerServer() | `web/lib/supabase-server.ts` | `.contains("player_ids", [playerId])` |
| AUTH-039 | Auth-state hydration (CHANGED) | `web/lib/auth.tsx` | `supabaseUserToAuthUser()`, `secureMeta` |
| AUTH-040 | Demo-login dead code | `web/lib/auth.tsx`, `web/app/login/page.tsx` | commented blocks |
| AUTH-041 | Always-public pages (NEW) | `web/middleware.ts` | `isAlwaysPublicPage` |
| AUTH-042 | /register code gate (NEW) | `web/app/register/page.tsx` | `handleUnlock()` |
| AUTH-043 | public-register-player new player (NEW) | `web/app/api/public-register-player/route.ts` | `POST()` insert branch |
| AUTH-044 | public-register-player complete pending (NEW) | `web/app/api/public-register-player/route.ts` | `POST()` `playerId` branch |
| AUTH-045 | public-register-player list (NEW) | `web/app/api/public-register-player/route.ts` | `GET()` |
| AUTH-046 | complete-signup core (NEW) | `web/app/api/complete-signup/route.ts` | whole file |
| AUTH-047 | player/parent auto-approve (NEW) | `web/app/api/complete-signup/route.ts` | lines 55-81 |
| AUTH-048 | duplicate academy-name guard (NEW) | `web/app/api/complete-signup/route.ts` | lines 87-96 |
| AUTH-049 | re-signup idempotency 409 (NEW) | `web/app/api/complete-signup/route.ts` | lines 44-53 |
| AUTH-050 | linked-names (NEW) | `web/app/api/players/linked-names/route.ts` | whole file |
| AUTH-051 | app_metadata migration (NEW, cross-cutting) | many files | see AUTH-051 evidence list |
| AUTH-052 | unconfirmed-email + resend (NEW) | `web/lib/auth.tsx`, `web/app/login/page.tsx` | `EMAIL_NOT_CONFIRMED`, `resendConfirmation()` |
| AUTH-053 | live account-email duplicate check (NEW) | `web/app/signup/page.tsx` | `emailCheck` |
| AUTH-054 | (→AUTH-024) coach auto-creation | `web/app/api/approve-user/route.ts` | see AUTH-024 |
| AUTH-055 | (→AUTH-025) per-child dedup | `web/app/api/approve-user/route.ts` | see AUTH-025 |

---


---

## PLAYER — Player — Players, Sessions, Video/Pose Pipeline, Reports, Performance

*Source: [`domains/player.md`](./domains/player.md)*


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


---

## MKT — Marketplace — Coach Discovery, Bookings, Session Packs, B2C Stripe Commerce

*Source: [`domains/marketplace.md`](./domains/marketplace.md)*


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


---

## ADMIN — Academy & Platform Admin — Org Management, B2B Billing, Admin Surfaces

*Source: [`domains/academy_admin.md`](./domains/academy_admin.md)*


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


---

## PORTAL — Portal & Content — Player/Parent Portal, Academy Curriculum, Messaging

*Source: [`domains/portal_content.md`](./domains/portal_content.md)*


| Requirement | Source file(s) | Key function/component |
|---|---|---|
| PORTAL-001 | `web/components/PortalClient.tsx` | `PortalClient()` |
| PORTAL-002 | `web/components/PortalClient.tsx`, `web/app/api/confirm-consent/route.ts` | consent IIFE; `POST` |
| PORTAL-003 | `web/lib/academy-content.ts` | `isStageUnlocked`, `isArticleUnlocked`, `stageLockReason`, `currentUnlockedStage` |
| PORTAL-004 | `web/lib/db.ts` | `recordArticleRead` |
| PORTAL-005 | `web/lib/db.ts` | `fetchTodaysTip`, `recordTipView`, `fetchTipArchive` |
| PORTAL-006 | `web/lib/badges.ts`, `web/components/BadgeStrip.tsx` | `computeBadges` |
| PORTAL-007 | `web/components/AcademyLearnClient.tsx` | `AcademyLearnClient()` |
| PORTAL-008 | `web/components/ArticleReaderClient.tsx`, `web/components/ArticleBody.tsx` | `ArticleReaderClient()`, `ArticleBody()` |
| PORTAL-009 | `web/components/MessageModal.tsx`, `web/app/api/send-message/route.ts` | `handleSend`, `POST` |
| PORTAL-010 | `web/components/MessageModal.tsx`, `web/app/api/send-sms/route.ts`, `web/lib/sms.ts` | `handleSend`, `POST`, `sendSms` |
| PORTAL-011 | `web/components/BulkMessageModal.tsx` | `handleSend` |
| PORTAL-012 | `web/components/PlayerMessages.tsx`, `web/lib/db.ts` | `PlayerMessages()`, `fetchMessages`, `insertMessage` |
| PORTAL-013 | `web/lib/messages-store.ts` | (unused) |
| PORTAL-014 | `web/app/api/notify-new-article/route.ts`, `web/components/AcademyContentAdminClient.tsx` | `POST`, `handleSaveArticle` |
| PORTAL-015 | `web/components/AcademyContentAdminClient.tsx` | `handleSaveArticle`, `handleSaveTip` |
| PORTAL-016 | `web/app/api/geocode/route.ts` | `POST` |
| PORTAL-017 | *(none — not implemented)* | — |
| PORTAL-018 | `web/app/about/page.tsx`, `web/components/LegalPageShell.tsx` | `AboutPage()` |
| PORTAL-019 | `web/app/contact/page.tsx` | `ContactPage()`, `handleSubmit` |
| PORTAL-020 | `web/app/api/contact/route.ts`, `web/lib/email-templates.ts` | `POST`, `buildContactFormEmailHtml` |
| PORTAL-021 | `web/app/privacy/page.tsx` | `PrivacyPage()` |
| PORTAL-022 | `web/app/terms/page.tsx` | `TermsPage()` |
| PORTAL-023 | `web/components/LegalPageShell.tsx` | `LegalPageShell()` |
| PORTAL-024 | `web/components/Footer.tsx`, `web/app/(dashboard)/layout.tsx` | `Footer()`, `DashboardLayout()` |
| PORTAL-025 | `web/middleware.ts` | `middleware()`, `isAlwaysPublicPage`, `isAuthApi` |
| BR-1..21 | see §3 | see §3 |

---


---

## PAY — Payments Core — Stripe Webhook, Cron, Invoicing, AI Coach Chat

*Source: [`domains/payments_core.md`](./domains/payments_core.md)*


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


---

## Cross-Domain Coverage Matrix (Phase 7)

For the three domains whose test-case tables include an explicit Requirement ID column (Auth, Player, Marketplace), the matrix below is built mechanically from that column — each requirement lists every test case ID that names it, and is flagged `NO_TEST_CASES` if none do. For the other three domains (Academy/Admin, Portal/Content, Payments Core), no machine-checkable requirement↔test-case link exists in the source file (see the format note in test-cases.md), so a domain-level summary is given instead — consult that domain's own file for the narrative mapping between its numbered requirements and its test case table.


### AUTH — Auth & RBAC

| Requirement ID | Requirement | Test Case IDs | Coverage | Gaps |
|---|---|---|---|---|
| AUTH-001 | Unauthenticated visitor blocked from protected routes | AUTH-TC-001 | PARTIAL | Only one test case — consider adding edge/negative cases |
| AUTH-002 | Public auth pages reachable without a session | AUTH-TC-002 | PARTIAL | Only one test case — consider adding edge/negative cases |
| AUTH-003 | Auth-exempt API allowlist (CHANGED — grew from 6 to 9 prefixes) | AUTH-TC-003 | PARTIAL | Only one test case — consider adding edge/negative cases |
| AUTH-004 | Logged-in user bounced off public pages | AUTH-TC-004 | PARTIAL | Only one test case — consider adding edge/negative cases |
| AUTH-005 | Logged-in user may still visit /signup to request an additional role | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-006 | Email/password authentication | AUTH-TC-007 | PARTIAL | Only one test case — consider adding edge/negative cases |
| AUTH-007 | Post-authentication player lockout check (CHANGED — now reads `app_... | AUTH-TC-010 | PARTIAL | Only one test case — consider adding edge/negative cases |
| AUTH-008 | Generic invalid-credentials message | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-009 | Successful-login redirect target | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-010 | Duplicate-email detection routes signup into "link" flow | AUTH-TC-017 | PARTIAL | Only one test case — consider adding edge/negative cases |
| AUTH-011 | New account creation (CHANGED SUBSTANTIALLY) | AUTH-TC-011 | PARTIAL | Only one test case — consider adding edge/negative cases |
| AUTH-012 | Pending-approval request queued (CHANGED — no longer universal) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-013 | Admin email notification on new signup | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-014 | Client-side password validation on signup | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-015 | Role-specific required fields on signup | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-016 | Debounced player-lookup during signup | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-017 | API: GET /api/lookup-player (CHANGED — now reports sibling count) | AUTH-TC-019 | PARTIAL | Only one test case — consider adding edge/negative cases |
| AUTH-018 | API: POST /api/check-existing-account | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-019 | API: POST /api/request-additional-role (CHANGED — reads app_metadata) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-020 | AuthGuard: player/parent confined to /portal | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-021 | AuthGuard: pending-approval gate | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-022 | AuthGuard: unauthenticated client-side redirect (defense in depth) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-023 | API: POST /api/approve-user — platform_admin-only gate (CHANGED — a... | AUTH-TC-028 | PARTIAL | Only one test case — consider adding edge/negative cases |
| AUTH-024 | API: POST /api/approve-user — new-signup approval (CHANGED — coach ... | AUTH-TC-029 | PARTIAL | Only one test case — consider adding edge/negative cases |
| AUTH-025 | API: POST /api/approve-user — link-request approval (CHANGED — per-... | AUTH-TC-030, AUTH-TC-031 | COVERED |  |
| AUTH-026 | API: POST /api/reject-user (CHANGED — app_metadata) | AUTH-TC-032 | PARTIAL | Only one test case — consider adding edge/negative cases |
| AUTH-027 | API: GET /api/pending-approvals (CHANGED — app_metadata) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-028 | API: POST /api/reactivate-player (CHANGED — app_metadata) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-029 | API: POST /api/invite-coach (CHANGED — app_metadata; more explicit ... | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-030 | API: POST /api/switch-role (CHANGED — app_metadata) | AUTH-TC-033, AUTH-TC-034 | COVERED |  |
| AUTH-031 | NavBar role-switcher UI (CHANGED — now shows real per-child names) | AUTH-TC-038 | PARTIAL | Only one test case — consider adding edge/negative cases |
| AUTH-032 | API: POST /api/confirm-consent (CHANGED — app_metadata) | AUTH-TC-035, AUTH-TC-036, AUTH-TC-037 | COVERED |  |
| AUTH-033 | Password reset request | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-034 | Password reset completion | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-035 | Server helper: getCaller() (CHANGED — app_metadata) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-036 | Server helper: callerCanAccessPlayer() | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-037 | Server helper: canAccessPlayerServer() (CHANGED — app_metadata) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-038 | Server helper: isAcademyPlayerServer() | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-039 | Client auth-state hydration (CHANGED SUBSTANTIALLY — app_metadata) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-040 | Demo-account quick-login (dead code) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-041 | NEW: "Always-public" pages, visible whether or not signed in | AUTH-TC-005, AUTH-TC-006 | COVERED |  |
| AUTH-042 | NEW: Public player self-registration page (/register) — code gate | AUTH-TC-020, AUTH-TC-021 | COVERED |  |
| AUTH-043 | NEW: POST /api/public-register-player — new player creation | AUTH-TC-022, AUTH-TC-023, AUTH-TC-024 | COVERED |  |
| AUTH-044 | NEW: POST /api/public-register-player — complete a pre-entered ("pe... | AUTH-TC-025, AUTH-TC-026 | COVERED |  |
| AUTH-045 | NEW: GET /api/public-register-player — registered + pending list (c... | AUTH-TC-027 | PARTIAL | Only one test case — consider adding edge/negative cases |
| AUTH-046 | NEW: POST /api/complete-signup — server-side app_metadata assignment | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-047 | NEW: complete-signup — player/parent auto-approval + multi-sibling ... | AUTH-TC-012, AUTH-TC-013, AUTH-TC-014 | COVERED |  |
| AUTH-048 | NEW: complete-signup — duplicate-academy-name guard | AUTH-TC-015 | PARTIAL | Only one test case — consider adding edge/negative cases |
| AUTH-049 | NEW: complete-signup — re-run idempotency backstop (409) | AUTH-TC-016 | PARTIAL | Only one test case — consider adding edge/negative cases |
| AUTH-050 | NEW: POST /api/players/linked-names — role-switcher display names | AUTH-TC-039 | PARTIAL | Only one test case — consider adding edge/negative cases |
| AUTH-051 | NEW (cross-cutting): security-sensitive identity fields relocated t... | AUTH-TC-040 | PARTIAL | Only one test case — consider adding edge/negative cases |
| AUTH-052 | NEW: Login — unconfirmed-email detection + resend-confirmation flow | AUTH-TC-008, AUTH-TC-009 | COVERED |  |
| AUTH-053 | NEW: Signup — live "email already has an account" warning | AUTH-TC-018 | PARTIAL | Only one test case — consider adding edge/negative cases |
| AUTH-054 | (see AUTH-024) approve-user auto-creates a coaches row for an indep... | — | NO_TEST_CASES | **No test case references this requirement ID** |
| AUTH-055 | (see AUTH-025) per-(role,playerId) dedup for player/parent linked i... | — | NO_TEST_CASES | **No test case references this requirement ID** |

*55 requirements, 41 test cases, 27 requirement(s) with zero linked test cases, 1 test case(s) whose Requirement ID cell didn't match a known ID.*


### PLAYER — Player

| Requirement ID | Requirement | Test Case IDs | Coverage | Gaps |
|---|---|---|---|---|
| PLAYER-001 | Player list view with role-scoped roster | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-002 | Player status derivation (Active / Expiring / Expired) | PLAYER-TC-001, PLAYER-TC-002, PLAYER-TC-003 | COVERED |  |
| PLAYER-003 | Player profile view (CHANGED — new staff-only "Last payment date" c... | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-004 | Edit player (profile + subscription) (CHANGED — plan picker narrowe... | PLAYER-TC-026 | PARTIAL | Only one test case — consider adding edge/negative cases |
| PLAYER-005 | Auto-computed subscription end date | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-006 | Player account reactivation | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-007 | Server-side player-access authorization for every Player-domain page | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-008 | Player/Parent roles are hard-redirected out of every coach-facing P... | PLAYER-TC-034, PLAYER-TC-035 | COVERED |  |
| PLAYER-009 | New session form with 3 optional camera-angle video slots | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-010 | Client-side video quality probe (non-blocking warning only) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-011 | Client-side transcode to H.264 MP4, with silent fallback to the ori... | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-012 | Signed-upload flow to Supabase Storage (CHANGED — no bucket-level s... | PLAYER-TC-024, PLAYER-TC-025 | COVERED |  |
| PLAYER-013 | Session save + XP award formula | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-014 | Session-pack draw-down vs. Free-plan monthly session limit (CHANGED... | PLAYER-TC-036 | PARTIAL | Only one test case — consider adding edge/negative cases |
| PLAYER-015 | `recordSessionCompletion` ledger update | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-016 | Sessions list, filtering and stats | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-017 | Session RPE logging/editing (post-hoc) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-018 | Session deletion (cascading) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-019 | Attendance-driven pack draw-down (distinct mechanism from session-c... | PLAYER-TC-039 | PARTIAL | Only one test case — consider adding edge/negative cases |
| PLAYER-020 | AI report generation, end-to-end happy path | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-021 | Pose-detection failure rejection path | PLAYER-TC-037 | PARTIAL | Only one test case — consider adding edge/negative cases |
| PLAYER-022 | Biomechanics metric computation engine | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-023 | Bowling action-type classification (Side-on / Front-on / Mixed) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-024 | Injury-risk-band classification (Low / Moderate / High) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-025 | AI report generation gating (CHANGED SUBSTANTIALLY — now a 3-way el... | PLAYER-TC-007, PLAYER-TC-008 | COVERED |  |
| PLAYER-026 | Server-side assessment-credit re-validation and spend | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-027 | Ball tracking + pitch map (front-camera only, calibration-gated) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-028 | One-time camera calibration per academy/angle | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-029 | AI coaching narrative via Claude (grounded, not measurement-generat... | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-030 | Report PDF generation and storage | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-031 | Automatic report email on generation (REMOVED) | PLAYER-TC-009 | PARTIAL | Only one test case — consider adding edge/negative cases |
| PLAYER-032 | Report regeneration | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-033 | Report deletion | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-034 | Manual report email send (CHANGED — now gated on completed coach re... | PLAYER-TC-014, PLAYER-TC-015 | COVERED |  |
| PLAYER-035 | Reports list, filter, and coach→player grouping (CHANGED — review-s... | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-036 | Speed leaderboard | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-037 | Player biomechanics snapshot refresh after report generation | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-061 | Coach report-review workflow: Not Reviewed → Under Review → Complet... | PLAYER-TC-010, PLAYER-TC-011, PLAYER-TC-012, PLAYER-TC-013 | COVERED |  |
| PLAYER-062 | Report visibility gating for player/parent viewers (NEW) | PLAYER-TC-016, PLAYER-TC-017 | COVERED |  |
| PLAYER-038 | Manual action plan CRUD | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-039 | AI-generated action plan from a report's flagged issues | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-040 | Action-plan priority derived from injury-risk band | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-041 | Injury-risk trend computation and alerting | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-042 | RPE weekly training-load summary | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-043 | S&C weekly training load + ACWR-style spike alert | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-044 | Performance dashboard "Needs Attention" surfacing | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-045 | Recurring group session CRUD + roster (CHANGED SUBSTANTIALLY — rost... | PLAYER-TC-018, PLAYER-TC-019, PLAYER-TC-020, PLAYER-TC-038 | COVERED |  |
| PLAYER-046 | Attendance recording per occurrence date, with pack draw-down | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-047 | Weekly occurrence-date generation window | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-064 | Bulk attendance-history CSV import per group (NEW) | PLAYER-TC-021, PLAYER-TC-022, PLAYER-TC-023 | COVERED |  |
| PLAYER-048 | S&C workout CRUD + load summary | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-049 | Video markup/annotation | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-050 | Voice note recording with optional live transcription | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-051 | Formal assessment form | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-052 | Badge computation (derived, not event-sourced) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-053 | Badge strip display (earned + next-up) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-054 | Academy-progress display and curriculum-stage unlock gating | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-055 | Plan Catalog-driven feature gating (2-argument `plan-features.ts` s... | PLAYER-TC-004, PLAYER-TC-005, PLAYER-TC-006 | COVERED |  |
| PLAYER-056 | Independent-coach self-service "+ Add Player" with roster-cap enfor... | PLAYER-TC-029, PLAYER-TC-030 | COVERED |  |
| PLAYER-057 | Best-effort "you've been added" invite email (NEW) | PLAYER-TC-031 | PARTIAL | Only one test case — consider adding edge/negative cases |
| PLAYER-058 | Multi-source "last payment date" resolution (NEW) | PLAYER-TC-027, PLAYER-TC-028 | COVERED |  |
| PLAYER-059 | Per-player currency self-service (NEW) | PLAYER-TC-032, PLAYER-TC-033 | COVERED |  |
| PLAYER-060 | Multi-currency plan pricing display (NEW) | PLAYER-TC-040 | PARTIAL | Only one test case — consider adding edge/negative cases |
| PLAYER-066 | Player/parent and academy-player access to their own Subscription p... | — | NO_TEST_CASES | **No test case references this requirement ID** |
| PLAYER-067 | Linked-player display-name resolution for the role switcher (bounda... | — | NO_TEST_CASES | **No test case references this requirement ID** |

*65 requirements, 40 test cases, 45 requirement(s) with zero linked test cases.*


### MKT — Marketplace

| Requirement ID | Requirement | Test Case IDs | Coverage | Gaps |
|---|---|---|---|---|
| MKT-001 | Player Pro subscription checkout | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-002 | Stripe Billing Portal session creation | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-003 | Session-pack purchase checkout (Stripe Connect destination charge) | MKT-TC-017 | PARTIAL | Only one test case — consider adding edge/negative cases |
| MKT-004 | One-off booking payment checkout (Stripe Connect destination charge) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-005 | One-time AI-assessment credit checkout | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-006 | Content-library subscription checkout | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-007 | Stripe Connect Express onboarding (coach payouts) | MKT-TC-020 | PARTIAL | Only one test case — consider adding edge/negative cases |
| MKT-008 | Stripe Connect Express dashboard login-link | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-009 | Marketplace visibility gate (Free-plan paywall) | MKT-TC-016 | PARTIAL | Only one test case — consider adding edge/negative cases |
| MKT-010 | Coach discovery / search / filtering (Find a Coach) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-011 | Marketplace booking request (player → coach) | MKT-TC-015 | PARTIAL | Only one test case — consider adding edge/negative cases |
| MKT-012 | Booking creation (staff-side) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-013 | Booking status lifecycle | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-014 | Booking completion (session logging + XP + pack draw-down) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-015 | "Credit to Pack" on a cancelled booking (BookingsClient) — confirme... | MKT-TC-019 | PARTIAL | Only one test case — consider adding edge/negative cases |
| MKT-016 | Session-pack purchase & pack lifecycle (staff-created) | MKT-TC-018 | PARTIAL | Only one test case — consider adding edge/negative cases |
| MKT-017 | Session-pack draw-down accounting | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-018 | Pack payment status tracking & "Fees Due" tab | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-019 | Coach directory / roster management | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-020 | Fee/platform-fee calculation helpers | MKT-TC-018 | PARTIAL | Only one test case — consider adding edge/negative cases |
| MKT-021 | Dead/orphaned local-storage payment & credit stores | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-022 | Coach Pro subscription checkout (NEW) | MKT-TC-001, MKT-TC-002 | COVERED |  |
| MKT-023 | Coach Pro billing portal (NEW) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-024 | Coach subscription management UI (NEW) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-025 | Coach-tier plan-feature gating functions (NEW) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-026 | Marketplace visibility gated behind Coach Pro for independent coach... | MKT-TC-003, MKT-TC-004 | COVERED |  |
| MKT-027 | Referral creation (platform-admin only) (NEW) | MKT-TC-005, MKT-TC-006, MKT-TC-007 | COVERED |  |
| MKT-028 | Referral ending (NEW) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-029 | Referral payout "mark paid" (NEW) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-030 | Monthly referral commission cron job (NEW) | MKT-TC-008, MKT-TC-009, MKT-TC-010, MKT-TC-011 | COVERED |  |
| MKT-031 | Referrals admin UI (NEW) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-032 | Booking-created confirmation email/SMS (NEW) | MKT-TC-014 | PARTIAL | Only one test case — consider adding edge/negative cases |
| MKT-033 | Manual "mark booking paid" (cash/bank transfer) (NEW as a dedicated... | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-034 | Booking platform-fee-due ledger & "Platform Fees" tab (NEW) | MKT-TC-012, MKT-TC-013 | COVERED |  |
| MKT-035 | Session-pack platform-fee-due ledger (NEW) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-036 | Session-pack platform-fee collection tracking & "Platform Fees" tab... | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-037 | Multi-currency support across the marketplace (NEW, cross-cutting) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-038 | Plan-Catalog-driven feature gating, 2-argument signature (NEW/CHANG... | MKT-TC-016 | PARTIAL | Only one test case — consider adding edge/negative cases |
| MKT-039 | RBAC migration to `app_metadata` (NEW/CHANGED, cross-cutting) | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-040 | Legacy "Coach Pro for a player" checkout path still technically per... | — | NO_TEST_CASES | **No test case references this requirement ID** |
| MKT-041 | Independent coach creation via self-serve signup approval (NEW, sup... | — | NO_TEST_CASES | **No test case references this requirement ID** |

*41 requirements, 20 test cases, 27 requirement(s) with zero linked test cases.*


### ADMIN — Academy & Platform Admin (domain-level summary — no ID-linked matrix available)

- Requirement entries found (`### ADMIN-###` headers): 25
- Total `###`-level subsections in the requirements section: 25 (this domain grouped some requirements under narrative subheadings rather than one `###` per ID — see `academy_admin.md` section 2)
- Test cases documented: 31 (`ADMIN-TC-001`..`ADMIN-TC-031` range, condensed table, no Requirement ID column)
- Coverage claim: every requirement in `academy_admin.md` section 2 has at least narrative test-case discussion in that file's sections 6 and 8; exact 1:1 ID linkage is `UNKNOWN` from the source file as written.


### PORTAL — Portal & Content (domain-level summary — no ID-linked matrix available)

- Requirement entries found (`### PORTAL-###` headers): 25
- Total `###`-level subsections in the requirements section: 25 (this domain grouped some requirements under narrative subheadings rather than one `###` per ID — see `portal_content.md` section 2)
- Test cases documented: 54 (`PORTAL-TC-001`..`PORTAL-TC-054` range, condensed table, no Requirement ID column)
- Coverage claim: every requirement in `portal_content.md` section 2 has at least narrative test-case discussion in that file's sections 6 and 8; exact 1:1 ID linkage is `UNKNOWN` from the source file as written.


### PAY — Payments Core (domain-level summary — no ID-linked matrix available)

- Requirement entries found (`### PAY-###` headers): 0
- Total `###`-level subsections in the requirements section: 13 (this domain grouped some requirements under narrative subheadings rather than one `###` per ID — see `payments_core.md` section 2)
- Test cases documented: 45 (`PAY-TC-001`..`PAY-TC-045` range, condensed table, no Requirement ID column)
- Coverage claim: every requirement in `payments_core.md` section 2 has at least narrative test-case discussion in that file's sections 6 and 8; exact 1:1 ID linkage is `UNKNOWN` from the source file as written.
