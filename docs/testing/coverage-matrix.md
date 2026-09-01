# Requirement to Test Coverage Matrix (Fresh Pass)

Every one of the 270 requirements documented in [`docs/reverse-engineered/requirements.md`](../reverse-engineered/requirements.md), classified by test coverage against [`test-cases.md`](./test-cases.md)'s Requirement ID column — populated for **all six domains** this pass (unlike the prior QA pass, which had proper linkage for only three).

**Classification:** `FULL` (2+ test cases) / `PARTIAL` (exactly 1) / `NONE` (0 — either a genuine gap, or the requirement is `NOT_IMPLEMENTED`/`REMOVED`/dead-code, noted per row).

**Risk** is a title-keyword heuristic (Security/Auth/Payment/Currency/Referral/auto-consume terms → HIGH; UI/cosmetic → LOW; dead/removed code → LOW regardless of keywords; else MEDIUM) — disclosed as a heuristic, not a separately-audited score.

---


## AUTH — Auth & RBAC

| Requirement ID | Requirement | Test Case IDs | Coverage | Risk | Gap |
|---|---|---|---|---|---|
| AUTH-001 | Unauthenticated visitor blocked from protected routes | AUTH-TC-001 | PARTIAL | HIGH | Single test case only |
| AUTH-002 | Public auth pages reachable without a session | AUTH-TC-002 | PARTIAL | HIGH | Single test case only |
| AUTH-003 | Auth-exempt API allowlist (CHANGED — grew from 6 to 9 prefixes) | AUTH-TC-003 | PARTIAL | HIGH | Single test case only |
| AUTH-004 | Logged-in user bounced off public pages | AUTH-TC-004 | PARTIAL | MEDIUM | Single test case only |
| AUTH-005 | Logged-in user may still visit /signup to request an additional role | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| AUTH-006 | Email/password authentication | AUTH-TC-007 | PARTIAL | HIGH | Single test case only |
| AUTH-007 | Post-authentication player lockout check (CHANGED — now reads `ap... | AUTH-TC-010 | PARTIAL | HIGH | Single test case only |
| AUTH-008 | Generic invalid-credentials message | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| AUTH-009 | Successful-login redirect target | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| AUTH-010 | Duplicate-email detection routes signup into "link" flow | AUTH-TC-017 | PARTIAL | MEDIUM | Single test case only |
| AUTH-011 | New account creation (CHANGED SUBSTANTIALLY) | AUTH-TC-011 | PARTIAL | MEDIUM | Single test case only |
| AUTH-012 | Pending-approval request queued (CHANGED — no longer universal) | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| AUTH-013 | Admin email notification on new signup | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| AUTH-014 | Client-side password validation on signup | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| AUTH-015 | Role-specific required fields on signup | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| AUTH-016 | Debounced player-lookup during signup | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| AUTH-017 | API: GET /api/lookup-player (CHANGED — now reports sibling count) | AUTH-TC-019 | PARTIAL | MEDIUM | Single test case only |
| AUTH-018 | API: POST /api/check-existing-account | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| AUTH-019 | API: POST /api/request-additional-role (CHANGED — reads app_metad... | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| AUTH-020 | AuthGuard: player/parent confined to /portal | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| AUTH-021 | AuthGuard: pending-approval gate | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| AUTH-022 | AuthGuard: unauthenticated client-side redirect (defense in depth) | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| AUTH-023 | API: POST /api/approve-user — platform_admin-only gate (CHANGED —... | AUTH-TC-028 | PARTIAL | HIGH | Single test case only |
| AUTH-024 | API: POST /api/approve-user — new-signup approval (CHANGED — coac... | AUTH-TC-029 | PARTIAL | HIGH | Single test case only |
| AUTH-025 | API: POST /api/approve-user — link-request approval (CHANGED — pe... | AUTH-TC-030, AUTH-TC-031 | FULL | HIGH |  |
| AUTH-026 | API: POST /api/reject-user (CHANGED — app_metadata) | AUTH-TC-032 | PARTIAL | MEDIUM | Single test case only |
| AUTH-027 | API: GET /api/pending-approvals (CHANGED — app_metadata) | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| AUTH-028 | API: POST /api/reactivate-player (CHANGED — app_metadata) | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| AUTH-029 | API: POST /api/invite-coach (CHANGED — app_metadata; more explici... | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| AUTH-030 | API: POST /api/switch-role (CHANGED — app_metadata) | AUTH-TC-033, AUTH-TC-034 | FULL | HIGH |  |
| AUTH-031 | NavBar role-switcher UI (CHANGED — now shows real per-child names) | AUTH-TC-038 | PARTIAL | HIGH | Single test case only |
| AUTH-032 | API: POST /api/confirm-consent (CHANGED — app_metadata) | AUTH-TC-035, AUTH-TC-036, AUTH-TC-037 | FULL | HIGH |  |
| AUTH-033 | Password reset request | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| AUTH-034 | Password reset completion | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| AUTH-035 | Server helper: getCaller() (CHANGED — app_metadata) | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| AUTH-036 | Server helper: callerCanAccessPlayer() | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| AUTH-037 | Server helper: canAccessPlayerServer() (CHANGED — app_metadata) | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| AUTH-038 | Server helper: isAcademyPlayerServer() | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| AUTH-039 | Client auth-state hydration (CHANGED SUBSTANTIALLY — app_metadata) | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| AUTH-040 | Demo-account quick-login (dead code) | — | NONE | LOW (dead/removed code) | N/A in practice — dead code; action item is deletion, not testing |
| AUTH-041 | NEW: "Always-public" pages, visible whether or not signed in | AUTH-TC-005, AUTH-TC-006 | FULL | MEDIUM |  |
| AUTH-042 | NEW: Public player self-registration page (/register) — code gate | AUTH-TC-020, AUTH-TC-021, NEG-TC-005 | FULL | MEDIUM |  |
| AUTH-043 | NEW: POST /api/public-register-player — new player creation | AUTH-TC-022, AUTH-TC-023, AUTH-TC-024 | FULL | MEDIUM |  |
| AUTH-044 | NEW: POST /api/public-register-player — complete a pre-entered ("... | AUTH-TC-025, AUTH-TC-026 | FULL | MEDIUM |  |
| AUTH-045 | NEW: GET /api/public-register-player — registered + pending list ... | AUTH-TC-027 | PARTIAL | MEDIUM | Single test case only |
| AUTH-046 | NEW: POST /api/complete-signup — server-side app_metadata assignment | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| AUTH-047 | NEW: complete-signup — player/parent auto-approval + multi-siblin... | AUTH-TC-012, AUTH-TC-013, AUTH-TC-014 | FULL | HIGH |  |
| AUTH-048 | NEW: complete-signup — duplicate-academy-name guard | AUTH-TC-015 | PARTIAL | MEDIUM | Single test case only |
| AUTH-049 | NEW: complete-signup — re-run idempotency backstop (409) | AUTH-TC-016 | PARTIAL | MEDIUM | Single test case only |
| AUTH-050 | NEW: POST /api/players/linked-names — role-switcher display names | AUTH-TC-039 | PARTIAL | HIGH | Single test case only |
| AUTH-051 | NEW (cross-cutting): security-sensitive identity fields relocated... | AUTH-TC-040 | PARTIAL | HIGH | Single test case only |
| AUTH-052 | NEW: Login — unconfirmed-email detection + resend-confirmation flow | AUTH-TC-008, AUTH-TC-009 | FULL | MEDIUM |  |
| AUTH-053 | NEW: Signup — live "email already has an account" warning | AUTH-TC-018 | PARTIAL | MEDIUM | Single test case only |
| AUTH-054 | (see AUTH-024) approve-user auto-creates a coaches row for an ind... | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| AUTH-055 | (see AUTH-025) per-(role,playerId) dedup for player/parent linked... | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |

*55 requirements — FULL: 9, PARTIAL: 19, NONE: 27.*

---

## PLAYER — Player

| Requirement ID | Requirement | Test Case IDs | Coverage | Risk | Gap |
|---|---|---|---|---|---|
| PLAYER-001 | Player list view with role-scoped roster | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| PLAYER-002 | Player status derivation (Active / Expiring / Expired) | PLAYER-TC-001, PLAYER-TC-002, PLAYER-TC-003 | FULL | MEDIUM |  |
| PLAYER-003 | Player profile view (CHANGED — new staff-only "Last payment date"... | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| PLAYER-004 | Edit player (profile + subscription) (CHANGED — plan picker narro... | PLAYER-TC-026 | PARTIAL | HIGH | Single test case only |
| PLAYER-005 | Auto-computed subscription end date | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-006 | Player account reactivation | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-007 | Server-side player-access authorization for every Player-domain page | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| PLAYER-008 | Player/Parent roles are hard-redirected out of every coach-facing... | PLAYER-TC-034, PLAYER-TC-035 | FULL | HIGH |  |
| PLAYER-009 | New session form with 3 optional camera-angle video slots | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-010 | Client-side video quality probe (non-blocking warning only) | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-011 | Client-side transcode to H.264 MP4, with silent fallback to the o... | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-012 | Signed-upload flow to Supabase Storage (CHANGED — no bucket-level... | PLAYER-TC-024, PLAYER-TC-025 | FULL | MEDIUM |  |
| PLAYER-013 | Session save + XP award formula | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-014 | Session-pack draw-down vs. Free-plan monthly session limit (CHANG... | PLAYER-TC-036 | PARTIAL | MEDIUM | Single test case only |
| PLAYER-015 | `recordSessionCompletion` ledger update | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-016 | Sessions list, filtering and stats | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-017 | Session RPE logging/editing (post-hoc) | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-018 | Session deletion (cascading) | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-019 | Attendance-driven pack draw-down (distinct mechanism from session... | PLAYER-TC-039 | PARTIAL | MEDIUM | Single test case only |
| PLAYER-020 | AI report generation, end-to-end happy path | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-021 | Pose-detection failure rejection path | PLAYER-TC-037 | PARTIAL | MEDIUM | Single test case only |
| PLAYER-022 | Biomechanics metric computation engine | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-023 | Bowling action-type classification (Side-on / Front-on / Mixed) | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-024 | Injury-risk-band classification (Low / Moderate / High) | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-025 | AI report generation gating (CHANGED SUBSTANTIALLY — now a 3-way ... | PLAYER-TC-007, PLAYER-TC-008 | FULL | MEDIUM |  |
| PLAYER-026 | Server-side assessment-credit re-validation and spend | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| PLAYER-027 | Ball tracking + pitch map (front-camera only, calibration-gated) | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-028 | One-time camera calibration per academy/angle | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-029 | AI coaching narrative via Claude (grounded, not measurement-gener... | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-030 | Report PDF generation and storage | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-031 | Automatic report email on generation (REMOVED) | PLAYER-TC-009 | PARTIAL | MEDIUM | Single test case only |
| PLAYER-032 | Report regeneration | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-033 | Report deletion | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-034 | Manual report email send (CHANGED — now gated on completed coach ... | PLAYER-TC-014, PLAYER-TC-015 | FULL | MEDIUM |  |
| PLAYER-035 | Reports list, filter, and coach→player grouping (CHANGED — review... | — | NONE | LOW | **Untested requirement — no test case exists in this pass** |
| PLAYER-036 | Speed leaderboard | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-037 | Player biomechanics snapshot refresh after report generation | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-061 | Coach report-review workflow: Not Reviewed → Under Review → Compl... | PLAYER-TC-010, PLAYER-TC-011, PLAYER-TC-012, PLAYER-TC-013, NEG-TC-002 | FULL | MEDIUM |  |
| PLAYER-062 | Report visibility gating for player/parent viewers (NEW) | PLAYER-TC-016, PLAYER-TC-017 | FULL | MEDIUM |  |
| PLAYER-038 | Manual action plan CRUD | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-039 | AI-generated action plan from a report's flagged issues | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-040 | Action-plan priority derived from injury-risk band | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-041 | Injury-risk trend computation and alerting | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-042 | RPE weekly training-load summary | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-043 | S&C weekly training load + ACWR-style spike alert | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-044 | Performance dashboard "Needs Attention" surfacing | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-045 | Recurring group session CRUD + roster (CHANGED SUBSTANTIALLY — ro... | PLAYER-TC-018, PLAYER-TC-019, PLAYER-TC-020, PLAYER-TC-038 | FULL | MEDIUM |  |
| PLAYER-046 | Attendance recording per occurrence date, with pack draw-down | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-047 | Weekly occurrence-date generation window | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-064 | Bulk attendance-history CSV import per group (NEW) | PLAYER-TC-021, PLAYER-TC-022, PLAYER-TC-023 | FULL | MEDIUM |  |
| PLAYER-048 | S&C workout CRUD + load summary | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-049 | Video markup/annotation | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-050 | Voice note recording with optional live transcription | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-051 | Formal assessment form | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-052 | Badge computation (derived, not event-sourced) | — | NONE | LOW | **Untested requirement — no test case exists in this pass** |
| PLAYER-053 | Badge strip display (earned + next-up) | — | NONE | LOW | **Untested requirement — no test case exists in this pass** |
| PLAYER-054 | Academy-progress display and curriculum-stage unlock gating | — | NONE | LOW | **Untested requirement — no test case exists in this pass** |
| PLAYER-055 | Plan Catalog-driven feature gating (2-argument `plan-features.ts`... | PLAYER-TC-004, PLAYER-TC-005, PLAYER-TC-006 | FULL | MEDIUM |  |
| PLAYER-056 | Independent-coach self-service "+ Add Player" with roster-cap enf... | PLAYER-TC-029, PLAYER-TC-030, NEG-TC-004 | FULL | MEDIUM |  |
| PLAYER-057 | Best-effort "you've been added" invite email (NEW) | PLAYER-TC-031 | PARTIAL | MEDIUM | Single test case only |
| PLAYER-058 | Multi-source "last payment date" resolution (NEW) | PLAYER-TC-027, PLAYER-TC-028 | FULL | HIGH |  |
| PLAYER-059 | Per-player currency self-service (NEW) | PLAYER-TC-032, PLAYER-TC-033 | FULL | HIGH |  |
| PLAYER-060 | Multi-currency plan pricing display (NEW) | PLAYER-TC-040 | PARTIAL | HIGH | Single test case only |
| PLAYER-066 | Player/parent and academy-player access to their own Subscription... | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PLAYER-067 | Linked-player display-name resolution for the role switcher (boun... | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |

*65 requirements — FULL: 13, PARTIAL: 7, NONE: 45.*

---

## MKT — Marketplace

| Requirement ID | Requirement | Test Case IDs | Coverage | Risk | Gap |
|---|---|---|---|---|---|
| MKT-001 | Player Pro subscription checkout | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| MKT-002 | Stripe Billing Portal session creation | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| MKT-003 | Session-pack purchase checkout (Stripe Connect destination charge) | MKT-TC-017 | PARTIAL | HIGH | Single test case only |
| MKT-004 | One-off booking payment checkout (Stripe Connect destination charge) | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| MKT-005 | One-time AI-assessment credit checkout | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| MKT-006 | Content-library subscription checkout | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| MKT-007 | Stripe Connect Express onboarding (coach payouts) | MKT-TC-020 | PARTIAL | HIGH | Single test case only |
| MKT-008 | Stripe Connect Express dashboard login-link | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| MKT-009 | Marketplace visibility gate (Free-plan paywall) | MKT-TC-016 | PARTIAL | MEDIUM | Single test case only |
| MKT-010 | Coach discovery / search / filtering (Find a Coach) | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| MKT-011 | Marketplace booking request (player → coach) | MKT-TC-015 | PARTIAL | MEDIUM | Single test case only |
| MKT-012 | Booking creation (staff-side) | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| MKT-013 | Booking status lifecycle | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| MKT-014 | Booking completion (session logging + XP + pack draw-down) | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| MKT-015 | "Credit to Pack" on a cancelled booking (BookingsClient) — confir... | MKT-TC-019 | PARTIAL | HIGH | Single test case only |
| MKT-016 | Session-pack purchase & pack lifecycle (staff-created) | MKT-TC-018 | PARTIAL | MEDIUM | Single test case only |
| MKT-017 | Session-pack draw-down accounting | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| MKT-018 | Pack payment status tracking & "Fees Due" tab | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| MKT-019 | Coach directory / roster management | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| MKT-020 | Fee/platform-fee calculation helpers | MKT-TC-018 | PARTIAL | MEDIUM | Single test case only |
| MKT-021 | Dead/orphaned local-storage payment & credit stores | — | NONE | LOW (dead/removed code) | N/A in practice — dead code; action item is deletion, not testing |
| MKT-022 | Coach Pro subscription checkout (NEW) | MKT-TC-001, MKT-TC-002 | FULL | MEDIUM |  |
| MKT-023 | Coach Pro billing portal (NEW) | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| MKT-024 | Coach subscription management UI (NEW) | — | NONE | LOW | **Untested requirement — no test case exists in this pass** |
| MKT-025 | Coach-tier plan-feature gating functions (NEW) | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| MKT-026 | Marketplace visibility gated behind Coach Pro for independent coa... | MKT-TC-003, MKT-TC-004 | FULL | MEDIUM |  |
| MKT-027 | Referral creation (platform-admin only) (NEW) | MKT-TC-005, MKT-TC-006, MKT-TC-007 | FULL | HIGH |  |
| MKT-028 | Referral ending (NEW) | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| MKT-029 | Referral payout "mark paid" (NEW) | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| MKT-030 | Monthly referral commission cron job (NEW) | MKT-TC-008, MKT-TC-009, MKT-TC-010, MKT-TC-011 | FULL | HIGH |  |
| MKT-031 | Referrals admin UI (NEW) | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| MKT-032 | Booking-created confirmation email/SMS (NEW) | MKT-TC-014 | PARTIAL | MEDIUM | Single test case only |
| MKT-033 | Manual "mark booking paid" (cash/bank transfer) (NEW as a dedicat... | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| MKT-034 | Booking platform-fee-due ledger & "Platform Fees" tab (NEW) | MKT-TC-012, MKT-TC-013 | FULL | MEDIUM |  |
| MKT-035 | Session-pack platform-fee-due ledger (NEW) | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| MKT-036 | Session-pack platform-fee collection tracking & "Platform Fees" t... | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| MKT-037 | Multi-currency support across the marketplace (NEW, cross-cutting) | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| MKT-038 | Plan-Catalog-driven feature gating, 2-argument signature (NEW/CHA... | MKT-TC-016 | PARTIAL | MEDIUM | Single test case only |
| MKT-039 | RBAC migration to `app_metadata` (NEW/CHANGED, cross-cutting) | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| MKT-040 | Legacy "Coach Pro for a player" checkout path still technically p... | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| MKT-041 | Independent coach creation via self-serve signup approval (NEW, s... | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |

*41 requirements — FULL: 5, PARTIAL: 9, NONE: 27.*

---

## ADMIN — Academy & Platform Admin

| Requirement ID | Requirement | Test Case IDs | Coverage | Risk | Gap |
|---|---|---|---|---|---|
| ADMIN-001 | Academy CRUD (create, edit, activate/deactivate) | ADMIN-TC-002 | PARTIAL | MEDIUM | Single test case only |
| ADMIN-002 | Academy Owner (Head Coach) requirement | ADMIN-TC-001, ADMIN-TC-003 | FULL | LOW |  |
| ADMIN-003 | Academy roster: player assignment (manual, new-player, CSV import) | ADMIN-TC-005, ADMIN-TC-006 | FULL | MEDIUM |  |
| ADMIN-004 | Academy roster: coach assignment | ADMIN-TC-032 | PARTIAL | MEDIUM | Single test case only |
| ADMIN-005 | Academy pricing configuration | ADMIN-TC-004 | PARTIAL | MEDIUM | Single test case only |
| ADMIN-006 | Payout model selection | ADMIN-TC-033 | PARTIAL | MEDIUM | Single test case only |
| ADMIN-007 | Academy list scoping (self-view for academy_admin) | ADMIN-TC-007 | PARTIAL | MEDIUM | Single test case only |
| ADMIN-008 | Academy self-serve billing: plan selection & Checkout (now multi-... | ADMIN-TC-008, ADMIN-TC-009, ADMIN-TC-010 | FULL | HIGH |  |
| ADMIN-009 | Academy billing: manage subscription (Stripe Billing Portal) | ADMIN-TC-011 | PARTIAL | HIGH | Single test case only |
| ADMIN-010 | Academy subscription state sync (Stripe webhook) | ADMIN-TC-034 | PARTIAL | HIGH | Single test case only |
| ADMIN-011 | Academy billing: invoice history (read-only) | ADMIN-TC-035 | PARTIAL | MEDIUM | Single test case only |
| ADMIN-012 | Plan seat-cap warning (advisory only) | ADMIN-TC-036 | PARTIAL | MEDIUM | Single test case only |
| ADMIN-013 | Platform admin: cross-academy KPI dashboard | ADMIN-TC-029 | PARTIAL | MEDIUM | Single test case only |
| ADMIN-014 | Platform admin: plan catalog CRUD (`/admin/plans`) — now multi-cu... | ADMIN-TC-012, ADMIN-TC-013, ADMIN-TC-014, ADMIN-TC-015, ADMIN-TC-016, NEG-TC-007 | FULL | HIGH |  |
| ADMIN-015 | REMOVED: Platform admin: flat B2C subscription pricing (`/admin/p... | ADMIN-TC-027 | PARTIAL | LOW (dead/removed code) | Single test case only |
| ADMIN-016 | Quote-based / negotiated B2B pricing model (per `PACE_HQ_B2B_Plat... | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| ADMIN-017 | Platform admin: approvals queue consumption (UI) | ADMIN-TC-037 | PARTIAL | HIGH | Single test case only |
| ADMIN-018 | Platform admin: grant/revoke platform_admin | ADMIN-TC-028 | PARTIAL | MEDIUM | Single test case only |
| ADMIN-019 | Platform admin: Academy Content (curriculum) publishing | ADMIN-TC-038 | PARTIAL | MEDIUM | Single test case only |
| ADMIN-020 | Plan-edit propagation to existing academies (live lookup, not a s... | ADMIN-TC-039 | PARTIAL | MEDIUM | Single test case only |
| ADMIN-021 | NEW: Multi-currency plan pricing infrastructure (`lib/currency.ts`) | ADMIN-TC-019 | PARTIAL | HIGH | Single test case only |
| ADMIN-022 | NEW: Academy country → currency binding, locked once payouts exist | ADMIN-TC-017, ADMIN-TC-018 | FULL | HIGH |  |
| ADMIN-023 | NEW: Welcome Email Templates admin (`/admin/email-templates`) | ADMIN-TC-020, ADMIN-TC-021, ADMIN-TC-022, ADMIN-TC-023 | FULL | MEDIUM |  |
| ADMIN-024 | NEW: On-demand "email my plan details" resend (academy billing) | ADMIN-TC-024, ADMIN-TC-025, ADMIN-TC-026 | FULL | MEDIUM |  |
| ADMIN-025 | Physical net (bowling net) management per academy | ADMIN-TC-030, ADMIN-TC-031 | FULL | MEDIUM |  |

*25 requirements — FULL: 8, PARTIAL: 16, NONE: 1.*

---

## PORTAL — Portal & Content

| Requirement ID | Requirement | Test Case IDs | Coverage | Risk | Gap |
|---|---|---|---|---|---|
| PORTAL-001 | Portal home dashboard data assembly | PORTAL-TC-001, PORTAL-TC-002 | FULL | MEDIUM |  |
| PORTAL-002 | Guardian/player consent confirmation | PORTAL-TC-003, PORTAL-TC-004, PORTAL-TC-005 | FULL | HIGH |  |
| PORTAL-003 | Academy stage unlock gate | PORTAL-TC-006, PORTAL-TC-007, PORTAL-TC-008, PORTAL-TC-009, PORTAL-TC-010, PORTAL-TC-043 | FULL | MEDIUM |  |
| PORTAL-004 | Article read tracking + XP award | PORTAL-TC-011, PORTAL-TC-012, PORTAL-TC-013, PORTAL-TC-014, PORTAL-TC-044 | FULL | MEDIUM |  |
| PORTAL-005 | Daily tip display + streak tracking | PORTAL-TC-015, PORTAL-TC-016, PORTAL-TC-017, PORTAL-TC-018, PORTAL-TC-019 | FULL | LOW |  |
| PORTAL-006 | Badge computation | PORTAL-TC-020 | PARTIAL | LOW | Single test case only |
| PORTAL-007 | Academy learn page (stage/article listing) | PORTAL-TC-042 | PARTIAL | MEDIUM | Single test case only |
| PORTAL-008 | Article reader page | PORTAL-TC-021, PORTAL-TC-022, PORTAL-TC-023 | FULL | MEDIUM |  |
| PORTAL-009 | Coach-to-player/parent email messaging | PORTAL-TC-024, PORTAL-TC-025, PORTAL-TC-026, PORTAL-TC-027 | FULL | MEDIUM |  |
| PORTAL-010 | Coach-to-player/parent SMS messaging | PORTAL-TC-028, PORTAL-TC-029, PORTAL-TC-030, PORTAL-TC-031, PORTAL-TC-032 | FULL | MEDIUM |  |
| PORTAL-011 | Bulk messaging to multiple players | PORTAL-TC-037, PORTAL-TC-038 | FULL | MEDIUM |  |
| PORTAL-012 | Message history display | PORTAL-TC-055 | PARTIAL | LOW | Single test case only |
| PORTAL-013 | Dead code: `lib/messages-store.ts` | — | NONE | LOW (dead/removed code) | N/A in practice — dead code; action item is deletion, not testing |
| PORTAL-014 | New-Academy-article broadcast email | PORTAL-TC-039, PORTAL-TC-040, PORTAL-TC-041 | FULL | MEDIUM |  |
| PORTAL-015 | Academy content admin CRUD | PORTAL-TC-056 | PARTIAL | MEDIUM | Single test case only |
| PORTAL-016 | Geocoding API | PORTAL-TC-033, PORTAL-TC-034, PORTAL-TC-035, PORTAL-TC-036 | FULL | MEDIUM |  |
| PORTAL-017 | Coach-assigned articles (documented, not implemented) | — | NONE | LOW (dead/removed code) | N/A — NOT_IMPLEMENTED, absence of tests expected |
| PORTAL-018 | Public About page (NEW) | PORTAL-TC-045, PORTAL-TC-046 | FULL | MEDIUM |  |
| PORTAL-019 | Public Contact page + form (NEW) | PORTAL-TC-047, PORTAL-TC-050 | FULL | MEDIUM |  |
| PORTAL-020 | Contact form API (NEW) | PORTAL-TC-048, PORTAL-TC-049, PORTAL-TC-051 | FULL | MEDIUM |  |
| PORTAL-021 | Public Privacy Policy page (NEW) | PORTAL-TC-052 | PARTIAL | MEDIUM | Single test case only |
| PORTAL-022 | Public Terms & Conditions page (NEW) | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PORTAL-023 | Shared `LegalPageShell` layout component (NEW) | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PORTAL-024 | Global `Footer` component, mounted in the authenticated app (NEW) | PORTAL-TC-053, PORTAL-TC-054 | FULL | HIGH |  |
| PORTAL-025 | Middleware public-page allowlist for the new pages (NEW/CHANGED) | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |

*25 requirements — FULL: 15, PARTIAL: 5, NONE: 5.*

---

## PAY — Payments Core

| Requirement ID | Requirement | Test Case IDs | Coverage | Risk | Gap |
|---|---|---|---|---|---|
| PAY-001 | Webhook signature verification gate | PAY-TC-001, PAY-TC-002, PAY-TC-003 | FULL | HIGH |  |
| PAY-002 | Webhook unrecognized event type acknowledgement | PAY-TC-026 | PARTIAL | HIGH | Single test case only |
| PAY-003 | checkout.session.completed / pack_payment — CHANGED | PAY-TC-005, PAY-TC-027 | FULL | HIGH |  |
| PAY-004 | checkout.session.completed / booking_payment | PAY-TC-007 | PARTIAL | HIGH | Single test case only |
| PAY-005 | checkout.session.completed / assessment_payment | PAY-TC-008 | PARTIAL | HIGH | Single test case only |
| PAY-006 | checkout.session.completed / library_subscription | PAY-TC-010 | PARTIAL | MEDIUM | Single test case only |
| PAY-007 | checkout.session.completed / academy_subscription | PAY-TC-011 | PARTIAL | MEDIUM | Single test case only |
| PAY-008 | checkout.session.completed / generic player subscription (fallbac... | PAY-TC-013 | PARTIAL | MEDIUM | Single test case only |
| PAY-043 | checkout.session.completed / coach_subscription — NEW | PAY-TC-010b | PARTIAL | MEDIUM | Single test case only |
| PAY-044 | customer.subscription.updated / coach_subscription — NEW | PAY-TC-016b, PAY-TC-016c | FULL | MEDIUM |  |
| PAY-045 | customer.subscription.deleted / coach_subscription — NEW | PAY-TC-020b | PARTIAL | MEDIUM | Single test case only |
| PAY-009 | customer.subscription.updated / library | PAY-TC-015 | PARTIAL | MEDIUM | Single test case only |
| PAY-010 | customer.subscription.updated / academy | PAY-TC-016 | PARTIAL | MEDIUM | Single test case only |
| PAY-011 | customer.subscription.updated / generic player subscription (rene... | PAY-TC-017, PAY-TC-018 | FULL | MEDIUM |  |
| PAY-012 | customer.subscription.deleted / library | PAY-TC-019 | PARTIAL | MEDIUM | Single test case only |
| PAY-013 | customer.subscription.deleted / academy | PAY-TC-020 | PARTIAL | MEDIUM | Single test case only |
| PAY-014 | customer.subscription.deleted / generic player subscription | PAY-TC-021 | PARTIAL | MEDIUM | Single test case only |
| PAY-015 | account.updated (Stripe Connect onboarding) | PAY-TC-022 | PARTIAL | HIGH | Single test case only |
| PAY-016 | invoice.payment_failed | PAY-TC-024, PAY-TC-024b | FULL | HIGH |  |
| PAY-017 | Cron authentication (CRON_SECRET bearer token) | PAY-TC-029, PAY-TC-030 | FULL | HIGH |  |
| PAY-018 | Cron email transport prerequisite | PAY-TC-r018 | PARTIAL | LOW | Single test case only |
| PAY-019 | Cron candidate-pack query | PAY-TC-r019 | PARTIAL | MEDIUM | Single test case only |
| PAY-020 | Cron 7-day-out reminder** — fires at `daysUntil === 7`, gated by ... | PAY-TC-r020 | PARTIAL | MEDIUM | Single test case only |
| PAY-021 | Cron 2-day-out reminder** — fires at `daysUntil === 2`, gated by ... | PAY-TC-r021 | PARTIAL | MEDIUM | Single test case only |
| PAY-022 | Cron due-today reminder + coach/academy CC and dual SMS** — fires... | PAY-TC-r022 | PARTIAL | MEDIUM | Single test case only |
| PAY-023 | resolveNotifyTarget helper** — coach → academy head coach → acade... | PAY-TC-r023 | PARTIAL | MEDIUM | Single test case only |
| PAY-024 | Cron overdue marking** — `daysUntil < 0 && payment_status === "Pe... | PAY-TC-r024 | PARTIAL | HIGH | Single test case only |
| PAY-025 | Cron login-lock after grace period** — `daysToDue <= -PACK_PAYMEN... | PAY-TC-r025 | PARTIAL | HIGH | Single test case only |
| PAY-026 | Cron: player with no email is skipped entirely** — `if (!player?.... | PAY-TC-r026 | PARTIAL | MEDIUM | Single test case only |
| PAY-027 | Cron response shape** — always `200 {"success": true, processed, ... | PAY-TC-r027 | PARTIAL | MEDIUM | Single test case only |
| PAY-046 | Booking-reminders cron authentication & schedule | PAY-TC-066, PAY-TC-067 | FULL | HIGH |  |
| PAY-047 | Booking-reminders candidate query & lead-window logic | PAY-TC-069 | PARTIAL | MEDIUM | Single test case only |
| PAY-048 | Booking-reminders idempotency (booking_reminder_log) | PAY-TC-070 | PARTIAL | MEDIUM | Single test case only |
| PAY-049 | Booking-reminders notification content (SMS + email) | PAY-TC-068, PAY-TC-071 | FULL | MEDIUM |  |
| PAY-050 | Pack-auto-consume cron authentication & schedule | PAY-TC-072 | PARTIAL | HIGH | Single test case only |
| PAY-051 | Pack-auto-consume eligibility resolution | PAY-TC-076 | PARTIAL | HIGH | Single test case only |
| PAY-052 | Pack-auto-consume occurrence creation & attendance idempotency | PAY-TC-075 | PARTIAL | HIGH | Single test case only |
| PAY-053 | Pack-auto-consume session draw-down / no-room handling | PAY-TC-073, PAY-TC-074 | FULL | HIGH |  |
| PAY-054 | Session-reminders cron authentication & schedule | PAY-TC-077 | PARTIAL | HIGH | Single test case only |
| PAY-055 | Session-reminders eligibility resolution + lead window | PAY-TC-078 | PARTIAL | MEDIUM | Single test case only |
| PAY-056 | Session-reminders idempotency + SMS-only notification | PAY-TC-079, PAY-TC-080 | FULL | MEDIUM |  |
| PAY-057 | cron-time.ts Sydney-timezone helper — NEW | PAY-TC-081 | PARTIAL | MEDIUM | Single test case only |
| PAY-028 | Coach-chat authentication & role/context resolution — CHANGED (au... | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| PAY-029 | Coach-chat Free-plan daily message limit — CHANGED (now Plan-Cata... | PAY-TC-082 | PARTIAL | MEDIUM | Single test case only |
| PAY-030 | Coach-chat topic-scoped system prompt & player-context injection | PAY-TC-090 | PARTIAL | MEDIUM | Single test case only |
| PAY-031 | Coach-chat streaming response & mid-stream error handling | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PAY-032 | CoachChatWidget client-side streaming consumption — CHANGED (disc... | PAY-TC-091 | PARTIAL | MEDIUM | Single test case only |
| PAY-033 | Coach-chat E2E real-API smoke test | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PAY-034 | Invoice listing (GET /api/stripe/invoices) — CHANGED (auth source... | PAY-TC-083, PAY-TC-084 | FULL | HIGH |  |
| PAY-035 | Invoice PDF download (GET /api/stripe/invoices/download) | PAY-TC-060, PAY-TC-085 | FULL | HIGH |  |
| PAY-036 | getCaller / callerCanAccessPlayer ownership resolution — CHANGED ... | — | NONE | MEDIUM | **Untested requirement — no test case exists in this pass** |
| PAY-037 | Invoice normalization (Stripe Invoice objects) — CHANGED (field r... | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| PAY-038 | Invoice normalization (one-time Checkout Sessions) & combined his... | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| PAY-039 | Invoice PDF generation (buildInvoicePdf) — CHANGED (currency-awar... | PAY-TC-086 | PARTIAL | HIGH | Single test case only |
| PAY-040 | InvoiceHistoryList (client component) — CHANGED (currency-aware r... | — | NONE | HIGH | **Untested requirement — no test case exists in this pass** |
| PAY-041 | Lazy Stripe client Proxy (lib/stripe.ts) | PAY-TC-092 | PARTIAL | HIGH | Single test case only |
| PAY-042 | isPaidPlan (lib/stripe-client.ts) | PAY-TC-093 | PARTIAL | HIGH | Single test case only |

*57 requirements — FULL: 12, PARTIAL: 38, NONE: 7.*

---

## Cross-Domain Summary

| Coverage | Count | % of 268 |
|---|---|---|
| FULL | 62 | 23% |
| PARTIAL | 94 | 35% |
| NONE | 112 | 42% |

*Total requirements found: 268.*