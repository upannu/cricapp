# Test Cases

Per-domain test cases derived from the implemented behavior in [`requirements.md`](./requirements.md), covering happy paths, negative scenarios, boundary conditions, validation, null/empty/missing values, duplicate requests, authorization, error handling, state transitions, and integration failure modes.

**Format note (methodology gap, disclosed rather than hidden):** three domains (Player, Auth, Marketplace) produced the full 11-column template (Test Case ID | Requirement ID | Test Scenario | Preconditions | Test Data/Input | Steps | Expected Result | Test Type | Priority | Automation Candidate | Relevant Code/Component) with an explicit Requirement ID linking each test case back to a specific requirement. The other three domains (Academy/Admin, Portal/Content, Payments Core) used a condensed 6-7 column table without an explicit Requirement ID column — the analyst agents linked test cases to requirements narratively in prose instead of via ID. This means the requirement↔test-case coverage matrix in [`traceability.md`](./traceability.md) is ID-precise for the first three domains and domain-level (not per-requirement-precise) for the other three. Not corrected after the fact to avoid fabricating linkage that wasn't actually verified.

Tags (Section 7 per domain) use this controlled taxonomy:
- **TEST_TYPE:** UNIT · INTEGRATION · API · E2E · REGRESSION · NEGATIVE · BOUNDARY · SECURITY · AUTHORIZATION · VALIDATION · ERROR_HANDLING
- **PRIORITY:** P0 (critical/core) · P1 (important) · P2 (normal) · P3 (low-risk/secondary)
- **AUTOMATION:** AUTOMATED (a real existing test already covers this exact scenario — cited) · AUTOMATION_CANDIDATE · MANUAL
- **REQUIREMENT_TYPE:** FUNCTIONAL · BUSINESS_RULE · VALIDATION · SECURITY · AUTHORIZATION · DATA · INTEGRATION · ERROR_HANDLING · PERFORMANCE · UI
- **RISK:** HIGH · MEDIUM · LOW
- **COVERAGE:** HAPPY_PATH · NEGATIVE · BOUNDARY · EDGE_CASE · ERROR_PATH · SECURITY · REGRESSION

---

## AUTH — Auth & RBAC — Authentication, Sessions, Account Lifecycle

*Source: [`domains/auth.md`](./domains/auth.md) · test-case table format: full*

### Test Cases


| TC ID | Req ID | Scenario | Preconditions | Test Data/Input | Steps | Expected Result | Test Type | Priority | Automation Candidate | Component |
|---|---|---|---|---|---|---|---|---|---|---|
| AUTH-TC-001 | AUTH-001 | Unauthenticated visit to protected route | No session | `/players` | GET `/players` | Redirect to `/login` | E2E | P0 | AUTOMATED | `middleware.ts` |
| AUTH-TC-002 | AUTH-002 | Unauthenticated visit to public auth pages | No session | `/signup`, `/forgot-password` | GET each | No redirect | E2E | P1 | AUTOMATED | `middleware.ts` |
| AUTH-TC-003 | AUTH-003 | New auth-exempt prefixes reachable without session | No session | `/api/complete-signup`, `/api/public-register-player`, `/api/contact` | POST/GET each | No middleware redirect | Integration | P1 | AUTOMATION_CANDIDATE | `middleware.ts` |
| AUTH-TC-004 | AUTH-004 | Logged-in user hits /login | Valid session | — | GET `/login` | Redirect to `/players` | E2E | P1 | AUTOMATED | `middleware.ts` |
| AUTH-TC-005 | AUTH-041 | Logged-in user hits /register | Valid session | — | GET `/register` | No redirect (unlike /login) | E2E | P2 | AUTOMATION_CANDIDATE | `middleware.ts` |
| AUTH-TC-006 | AUTH-041 | Signed-out visitor hits /about, /contact, /terms, /privacy | No session | — | GET each | No redirect | E2E | P2 | AUTOMATION_CANDIDATE | `middleware.ts` |
| AUTH-TC-007 | AUTH-006 | Valid login | Real account | correct email/password | Submit login form | Session set, `router.push("/players")` | E2E | P0 | AUTOMATED | `login/page.tsx` |
| AUTH-TC-008 | AUTH-052 | Login with unconfirmed email | Account signed up, not confirmed | correct email/password | Submit login form | "Please confirm your email..." + resend button shown | E2E | P1 | AUTOMATION_CANDIDATE | `login/page.tsx`, `auth.tsx` |
| AUTH-TC-009 | AUTH-052 | Resend confirmation email | `emailUnconfirmed === true` | — | Click "Resend confirmation email" | "✓ Confirmation email sent", button disabled | Integration | P2 | AUTOMATION_CANDIDATE | `auth.tsx` `resendConfirmation()` |
| AUTH-TC-010 | AUTH-007 | Disabled player account login | `players.login_disabled = true`, correct credentials, `app_metadata.player_id` set | correct email/password | Submit login | Session revoked, `ACCOUNT_DISABLED::` message shown | Integration/E2E | P0 | AUTOMATION_CANDIDATE | `auth.tsx` |
| AUTH-TC-011 | AUTH-011/046 | New academy_admin signup | No existing account | role=academy_admin, valid academyName | Submit signup | `app_metadata:{role:"academy_admin",approved:false}`, `user_requests` row inserted, "pending approval" screen | E2E | P0 | AUTOMATED | `complete-signup/route.ts` |
| AUTH-TC-012 | AUTH-047 | New player signup with matching player record | A `players` row exists with the submitted lookup email | role=player, matching lookup email | Submit signup | `app_metadata:{role:"player",approved:true,player_id}`, NO `user_requests` row, "You're all set" screen | E2E | P0 | AUTOMATION_CANDIDATE | `complete-signup/route.ts` |
| AUTH-TC-013 | AUTH-047 | New parent signup, lookup email matches 2 siblings | 2 `players` rows share the lookup email | role=parent | Submit signup | `app_metadata.linkedIdentities` has 2 entries, both role=parent, distinct playerId | Integration | P0 | AUTOMATION_CANDIDATE | `complete-signup/route.ts` |
| AUTH-TC-014 | AUTH-047 | Player/parent signup, no matching player | No `players` row for lookup email | role=player, non-matching email | Submit signup | 400 "No player found with email...", account left with no role | Integration | P1 | AUTOMATION_CANDIDATE | `complete-signup/route.ts` |
| AUTH-TC-015 | AUTH-048 | Duplicate academy name on signup | An academy named "X" already exists | role=academy_admin, academyName="X" (any case) | Submit signup | 409 "An academy named... already exists" | Integration | P1 | AUTOMATION_CANDIDATE | `complete-signup/route.ts` |
| AUTH-TC-016 | AUTH-049 | Re-run complete-signup against an account that already has a role | Account's `app_metadata.role` already set | same userId | POST `/api/complete-signup` again | 409, metadata untouched | Integration | P1 | AUTOMATION_CANDIDATE | `complete-signup/route.ts` |
| AUTH-TC-017 | AUTH-010 | Signup with an email that already has an account | Account exists for the email | that email, any role/password | Submit signup | Routed into `request-additional-role`, "pending approval" (link-specific copy) | E2E | P0 | AUTOMATED | `auth.tsx` |
| AUTH-TC-018 | AUTH-053 | Live duplicate-account warning on signup | Account exists for a given email | Type that email into the account-email field | (no submit) | Amber inline warning appears within ~500ms | Component/E2E | P2 | AUTOMATION_CANDIDATE | `signup/page.tsx` |
| AUTH-TC-019 | AUTH-017 | lookup-player reports sibling count | 3 players share an email | GET with that email | — | `{found:true, additionalCount:2}` | Integration | P2 | AUTOMATED (once updated) | `lookup-player/route.ts` |
| AUTH-TC-020 | AUTH-042 | Register page: valid code unlocks form | — | code="marsden" | POST `/api/public-register-player {validateOnly:true}` | 200, form unlocks | E2E | P0 | AUTOMATION_CANDIDATE | `register/page.tsx` |
| AUTH-TC-021 | AUTH-042 | Register page: invalid code rejected | — | code="wrongcode" | Submit code | 403, inline error, form stays locked | E2E | P0 | AUTOMATION_CANDIDATE | `register/page.tsx` |
| AUTH-TC-022 | AUTH-043 | Register: create a brand-new player | Valid code, no pre-entered roster match | full valid form | Submit | New `players` row created, added to `TARGET_ACADEMY_ID` roster, "Registered!" screen | E2E | P0 | AUTOMATION_CANDIDATE | `public-register-player/route.ts` |
| AUTH-TC-023 | AUTH-043 | Register: missing required field | Valid code | empty phone | Submit | 400 "Phone is required." | Integration | P1 | AUTOMATION_CANDIDATE | `public-register-player/route.ts` |
| AUTH-TC-024 | AUTH-043 | Register: invalid ageGroup/bowlingStyle value | Valid code | ageGroup="U99" | Submit (bypassing client `<select>`) | 400 "Please select a valid age group." | Integration | P2 | AUTOMATION_CANDIDATE | `public-register-player/route.ts` |
| AUTH-TC-025 | AUTH-044 | Register: complete a pre-entered player | A pending (no-email) player row exists under this code | pick from list, fill rest | Submit | That row updated (not duplicated), email now set | E2E | P0 | AUTOMATION_CANDIDATE | `public-register-player/route.ts` |
| AUTH-TC-026 | AUTH-044 | Register: playerId under a different code | Pending player exists under code A | Submit with code B + that playerId | — | 404 "That player couldn't be found for this code..." | Integration | P1 | AUTOMATION_CANDIDATE | `public-register-player/route.ts` |
| AUTH-TC-027 | AUTH-045 | Register: registered/pending list is code-scoped | Players registered under code A and code B | Enter code A | GET list | Only code-A players/pending returned, none from code B | Integration | P1 | AUTOMATION_CANDIDATE | `public-register-player/route.ts` |
| AUTH-TC-028 | AUTH-023 | approve-user: non-admin caller rejected | Caller role != platform_admin (in `app_metadata`) | any userId | POST `/api/approve-user` | 403 | Integration | P0 | AUTOMATED (needs fixture fix) | `approve-user/route.ts` |
| AUTH-TC-029 | AUTH-024 | approve-user: independent coach with no matching coaches row | `request_type="new"`, role=coach, no `coaches` row matches email | approve | POST approve | New `coaches` row created (`academy_id:null`), `coach_id` set on the account | Integration | P0 | AUTOMATION_CANDIDATE (NEW behavior, no existing test) | `approve-user/route.ts` |
| AUTH-TC-030 | AUTH-025 | approve-user link: second child's parent request | Account already has one `parent` linkedIdentity for child A | link-approve a `parent` request for child B | POST approve | Both children now present in `linkedIdentities` (not deduped away) | Integration | P0 | AUTOMATION_CANDIDATE (regression test for the fixed bug) | `approve-user/route.ts` |
| AUTH-TC-031 | AUTH-025 | approve-user link: duplicate academy_admin request | Account already has an `academy_admin` identity | link-approve another `academy_admin` request | POST approve | No duplicate appended (still deduped by role) | Integration | P2 | AUTOMATION_CANDIDATE | `approve-user/route.ts` |
| AUTH-TC-032 | AUTH-026 | reject-user: new-signup rejection deletes account | `request_type="new"` | reject | POST reject | Auth user deleted, request dequeued | Integration | P0 | AUTOMATED (needs fixture fix) | `reject-user/route.ts` |
| AUTH-TC-033 | AUTH-030 | switch-role: identity not linked | Caller's `linkedIdentities` doesn't contain the requested combo | POST with an unlinked role | — | 403 "That identity isn't linked to your account." | Integration | P0 | AUTOMATION_CANDIDATE (no test file exists) | `switch-role/route.ts` |
| AUTH-TC-034 | AUTH-030 | switch-role: success | Caller has ≥2 linked identities | POST with a linked (non-active) identity | — | `app_metadata` updated to target's role/scope | Integration | P0 | AUTOMATION_CANDIDATE (no test file exists) | `switch-role/route.ts` |
| AUTH-TC-035 | AUTH-032 | confirm-consent: player under 19 blocked | role=player, `age_group != "Senior"` | POST confirm-consent | — | 403 "A guardian must confirm consent for a player under 19." | Integration | P0 | AUTOMATION_CANDIDATE (no test file exists) | `confirm-consent/route.ts` |
| AUTH-TC-036 | AUTH-032 | confirm-consent: Senior player self-confirms | role=player, `age_group == "Senior"` | POST confirm-consent | — | 200, `guardian_consent_status="Confirmed"` | Integration | P0 | AUTOMATION_CANDIDATE (no test file exists) | `confirm-consent/route.ts` |
| AUTH-TC-037 | AUTH-032 | confirm-consent: parent confirms regardless of age | role=parent | POST confirm-consent | — | 200 for any linked player age | Integration | P1 | AUTOMATION_CANDIDATE (no test file exists) | `confirm-consent/route.ts` |
| AUTH-TC-038 | AUTH-031/050 | NavBar shows distinct names for two linked children | Account has 2 `parent` identities with different `playerId`s | Open role switcher | — | Two distinct names shown, not "Parent / Guardian" ×2 | Component/E2E | P1 | AUTOMATION_CANDIDATE | `NavBar.tsx`, `linked-names/route.ts` |
| AUTH-TC-039 | AUTH-050 | linked-names: requested id not owned by caller | Caller's linkedIdentities don't include the requested playerId | POST with a foreign playerId | — | That id silently dropped from the result, not errored, not leaked | Integration | P1 | AUTOMATION_CANDIDATE (no test file exists) | `linked-names/route.ts` |
| AUTH-TC-040 | AUTH-051 | Client cannot self-escalate role via updateUser | Any signed-in account | `supabase.auth.updateUser({ data: { role: "platform_admin" } })` | Call from browser console/devtools | `app_metadata.role` unchanged (only `user_metadata` written, ignored for authorization) | Security/E2E | P0 | AUTOMATION_CANDIDATE (regression test for the hardening) | `auth.tsx`, every privileged route |
| AUTH-TC-041 | AUTH-GAP-001 | Unapproved academy_admin calls invite-coach | Self-signed-up academy_admin, `approved:false` | POST `/api/invite-coach` with valid fields | — | Currently succeeds (200) — documents the still-open gap; should arguably 403 | Security | P0 | AUTOMATION_CANDIDATE (should be written to fail today, per old recommendation, still valid) | `invite-coach/route.ts` |

*(Existing IDs AUTH-TC-001 through the equivalent of the old AUTH-TC-100 series from the prior analysis still apply as scenarios; the table above is not exhaustive of every previously-listed case — it focuses on what is NEW or CHANGED this merge plus the highest-priority still-open gaps. Treat the prior doc's remaining scenario list as additional candidate coverage, re-verified against current source before reuse.)*

---


### Test Case Tags


**TEST_TYPE:** `E2E` | `Integration` | `Component` | `Unit` | `Security`
**PRIORITY:** `P0` (blocking/security-critical) | `P1` (core business rule) | `P2` (secondary/UX)
**AUTOMATION:** `AUTOMATED` (a currently-passing-against-old-code test exists — verify before trusting) | `AUTOMATION_CANDIDATE` (no working automated test currently confirmed against this code)
**REQUIREMENT_TYPE:** `Functional` | `Security-Authorization` | `Business Rule` | `Validation` | `Data` | `Integration` | `API` | `UX`
**RISK:** `High` (auth bypass / data leak / account takeover potential) | `Medium` (business-rule violation, no direct security exposure) | `Low` (UX/cosmetic)
**COVERAGE:** `EXISTING_TEST` (a test file exists and once targeted this behavior) | `STALE_TEST` (test file exists but its fixtures/assertions no longer match current source — see §8) | `MISSING` (no test file found at all) | `RECOMMENDED` (net-new, not previously recommended either)

---


### Existing Test Coverage vs Recommended


### The central finding for this merge: `user_metadata`-based test fixtures vs `app_metadata`-based production code

Concrete, verified evidence that a large share of this domain's existing tests are now testing the wrong field:

- **`web/tests/mocks/caller.ts`** — the shared helper every API-route auth test uses to set "who is signed in":
  ```ts
  /** Shape getCaller() (lib/server-auth.ts) reads off a Supabase Auth user — assign to routeMockState.cookieUser. */
  export function rawUser(metadata: {...}, id = "test-user-id") {
    return { id, user_metadata: metadata };
  }
  ```
  This comment is itself stale — `getCaller()` no longer reads `user_metadata` (AUTH-035); it reads `app_metadata`. Every test built on `rawUser()` therefore hands the route a mock user whose `app_metadata` is `undefined`.
- **`web/tests/setup/api.ts`** line 44 confirms the mocked `auth.getUser()` returns exactly `{ id, user_metadata }` with no `app_metadata` key at all.
- **Concrete consequence, traced through real test files:**
  - `tests/api/approve-user.test.ts`, `reject-user.test.ts`, `invite-coach.test.ts`, `reactivate-player.test.ts`, `pending-approvals.test.ts` all set `routeMockState.cookieUser = rawUser({ role: "platform_admin", ... })` (or `academy_admin`) to drive their **success** paths. Since the real route now reads `caller?.app_metadata?.role`, this resolves to `undefined`, and every one of these "success" tests will now hit the route's own "not authorized" 403 branch instead of proceeding — i.e., **these tests will fail (expecting 200, getting 403)**, not because the source's authorization logic is broken, but because the fixture no longer describes a real caller.
  - Conversely, their **"403 for wrong role"** tests will still incidentally pass (an `undefined` role was never going to equal the required role either), for the wrong reason.
  - `tests/api/request-additional-role.test.ts`'s `EXISTING_USER` fixture sets `user_metadata: { role: "coach", coach_id: "c1" }`; the route reads `existingUser.app_metadata`. Its **"409 when the account already has this role"** test will now fail (expects 409, the route will actually proceed to 200/insert, since `meta.role` resolves to `undefined`, not `"coach"`).
  - `tests/seed/seed.ts`/`tests/seed/fixtures.ts` — the **E2E** seed script itself creates real Supabase test users via `auth.admin.createUser({ user_metadata: userMetadata })` / `updateUserById({ user_metadata: userMetadata })`, never `app_metadata`. Every `ROLE_FIXTURES` account (`platform_admin`, `academy_admin`, `coach`, `player`, `parent`) therefore has **no role at all** in `app_metadata` in a live run against this code — meaning every seeded fixture actually resolves, in the running app, to the client-side default role `"coach"` (AUTH-039's fallback) and `approved:true`. This almost certainly breaks a wide swath of the role-scoped E2E suite beyond this domain (e.g. `tests/e2e/roles/platform_admin/admin-approvals.spec.ts` expects the "Pending Approvals" heading and "All caught up" empty state to render for what the fixture *intends* to be a platform_admin session, but the account is not actually a platform_admin under the current code).
- **Tests unaffected by this specific issue (STILL VALID as far as this specific migration goes):**
  - `tests/unit/lib/server-auth.test.ts` (`callerCanAccessPlayer()`) — constructs a `Caller` object directly (`{ userId, role, ... }`), never goes through a mocked Supabase user object at all, so it is untouched by the `user_metadata`/`app_metadata` split. Still the most solidly-covered unit in the domain.
  - `tests/e2e/auth.spec.ts` — asserts on rendered headings/text ("Sign in", "Create your account", "Reset your password", "Invalid email or password.") for unauthenticated flows only; none of its assertions depend on role metadata. Confirmed the relevant headings/copy still match the current source.
  - `tests/e2e/roles/player/login-redirect.spec.ts` — only asserts a role-agnostic bounce to `/players`, unaffected by which role the fixture actually resolves to.
  - `tests/api/lookup-player.test.ts`, `check-existing-account.test.ts` — don't touch `app_metadata`/`user_metadata` at all (public, unauthenticated routes); still valid, though `lookup-player.test.ts` should be checked for whether it asserts on the new `additionalCount` field (likely doesn't, since that field is new — not "wrong," just incomplete now).

### Missing coverage (implemented behavior with zero test file found — unchanged from prior analysis plus new gaps)

- `/api/switch-role` — still no test file.
- `/api/confirm-consent` — still no test file.
- `/api/complete-signup` — **new file, zero tests** (violates the project's own `AGENTS.md` convention: "New `app/api/**/route.ts` → `tests/api/<mirrored-path>.test.ts`").
- `/api/public-register-player` — **new file, zero tests** (same convention violation), including its `players.registration_code` column, which is also **absent from `tests/seed/schema-notes.md`** (another explicit `AGENTS.md` convention violation: "New `.from("some_table")` call anywhere → update `schema-notes.md`... in the same PR" — the column itself is new, not just untested).
- `/api/players/linked-names` — new file, zero tests.
- `/register` page — no E2E test found (new page, per `AGENTS.md`'s own rule this should be E2E-only, and none exists).
- `canAccessPlayerServer()`, `isAcademyPlayerServer()`, `getCaller()` — still no dedicated unit tests.
- Client-side `AuthGuard` — still no component/E2E test beyond the one role-agnostic redirect spec.
- `NavBar` role switcher, including the new per-child name resolution — no component test.
- Signup page validation/debounce, including the two NEW debounce mechanisms (`emailCheck` and the pre-existing `playerLookup`) — no component/E2E test.
- `login_disabled` lockout flow — still no dedicated test.
- Password reset (both pages) — still no E2E test.
- `AuthUser` hydration defaults (`supabaseUserToAuthUser()`) — no unit test, and now specifically no test verifying it reads `app_metadata` rather than `user_metadata`.

### RECOMMENDED_TEST list (priority order)

1. **Fix `tests/mocks/caller.ts`'s `rawUser()` to set `app_metadata` instead of `user_metadata`**, and update its stale doc-comment — this single change would likely restore correctness to a large fraction of the domain's existing API-route test suite without touching any assertion logic. (Not something this documentation task performs — flagged for the team.)
2. **Fix `tests/seed/fixtures.ts`/`seed.ts` to write `app_metadata`** (via `auth.admin.createUser({ app_metadata: ... })` / `updateUserById({ app_metadata: ... })`) — highest priority, since this silently invalidates the role-identity of every E2E fixture across the whole app, not just this domain.
3. `tests/api/switch-role.test.ts` — full coverage, still zero.
4. `tests/api/confirm-consent.test.ts` — full coverage, still zero, GDPR/consent-adjacent.
5. `tests/api/complete-signup.test.ts` — new, high priority: missing fields/invalid role, identity-verification failure, idempotency 409, player/parent auto-approve + multi-sibling linking, duplicate-academy-name 409, academy_admin/coach queuing.
6. `tests/api/public-register-player.test.ts` — new, high priority: code validation (GET+POST+validateOnly), field validation, fresh-insert path, pending-completion path (including cross-code 404), code-scoped list privacy.
7. `tests/api/players/linked-names.test.ts` — new: ownership filtering (requested ids not in caller's own identities silently dropped), empty-array short circuit.
8. Update `tests/seed/schema-notes.md` for `players.registration_code`.
9. A security regression test proving/disproving AUTH-GAP-001 still applies post-migration (should fail today, pass once fixed) — same recommendation as before, now against `app_metadata`.
10. A regression test specifically for the AUTH-025 fix (second child's link request is no longer swallowed by role-only dedup) — this was a real bug fix and deserves a pinned test so it can't silently regress back to role-only dedup.
11. Unit test for `supabaseUserToAuthUser()` covering the `app_metadata` defaults (`role` falls back to `"coach"`, `approved` falls back to `true`) and confirming `user_metadata.role`, if present, is deliberately ignored.

---


---

## PLAYER — Player — Players, Sessions, Video/Pose Pipeline, Reports, Performance

*Source: [`domains/player.md`](./domains/player.md) · test-case table format: full*

### Test Cases


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


### Test Case Tags


- `@security` — PLAYER-TC-012, 014, 018, 032, 035
- `@business-rule` — PLAYER-TC-004, 005, 007, 008, 018, 025, 029, 036, 039, 040
- `@regression` — PLAYER-TC-006, 009, 025, 026 (all cover behavior that changed and could silently regress back, or whose existing test asserts the wrong thing)
- `@new-feature` — PLAYER-TC-016 through 024, 027 through 034, 038, 039, 040
- `@slow` / `@e2e` — PLAYER-TC-016, 017, 024, 034, 035, 036, 037 (page.tsx-backed flows per `AGENTS.md`'s "New page → E2E only" rule; PLAYER-TC-037 is the one already-automated `@slow` spec)
- `@boundary` — PLAYER-TC-002, 003
- `@integration` — PLAYER-TC-007, 008, 016, 017, 039

---


### Existing Test Coverage vs Recommended


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


---

## MKT — Marketplace — Coach Discovery, Bookings, Session Packs, B2C Stripe Commerce

*Source: [`domains/marketplace.md`](./domains/marketplace.md) · test-case table format: full*

### Test Cases


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


### Test Case Tags


**TEST_TYPE:** `Functional`, `Validation`, `Business Rule`, `Security`, `Error-Handling`, `Integration`, `Regression`, `Data Consistency`, `Scheduled Job`

**PRIORITY:** `P0` money-movement correctness / auth bypass / confirmed-broken paths (MKT-TC-004, -005, -008, -013, -019, -020). `P1` core commerce/business-rule correctness. `P2` secondary validation, UX-adjacent rules.

**AUTOMATION:** `AUTOMATED` only for a currently-existing test proven to cover the exact scenario (none found for any new-subsystem requirement this pass). `RECOMMENDED` for everything else.

**REQUIREMENT_TYPE:** `Functional`, `API`, `Business Rule`, `Data`, `Security-Authorization`, `Error-Handling`, `Integration`, `Scheduled Job`

**RISK:** `HIGH` (money-movement, auth-bypass, currency-correctness — MKT-015, MKT-GAP-07, MKT-GAP-19, MKT-GAP-20, MKT-GAP-24). `MEDIUM` (business-rule inconsistency, silent fallback, snapshot-drift — MKT-GAP-08, MKT-GAP-11, MKT-GAP-14). `LOW` (dead code, minor UX inconsistency — MKT-GAP-12, the unawaited `markPackPaid` note).

**COVERAGE:** `COVERED`, `PARTIAL`, `UNCOVERED`, `PINS-A-BUG` — no requirement in this domain's NEW subsystems (MKT-022 through MKT-041) currently has any `COVERED` status; all are `UNCOVERED`.

---


### Existing Test Coverage vs Recommended


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


---

## ADMIN — Academy & Platform Admin — Org Management, B2B Billing, Admin Surfaces

*Source: [`domains/academy_admin.md`](./domains/academy_admin.md) · test-case table format: condensed*

### Test Cases


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


### Test Case Tags


- **Layer:** `unit` (route-level Vitest), `component` (RTL), `e2e` (Playwright)
- **Type:** `functional`, `security`/`authz`, `validation`, `business-rule`, `regression`, `currency`
- **Priority:** `High`, `Medium`, `Low`
- **Domain:** `academy-crud`, `academy-roster`, `academy-billing`, `platform-kpis`, `plan-catalog`,
  `multi-currency`, `platform-admin-mgmt`, `approvals-ui`, `academy-content`, `email-templates`, `nets`

---


### Existing Test Coverage vs Recommended


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


---

## PORTAL — Portal & Content — Player/Parent Portal, Academy Curriculum, Messaging

*Source: [`domains/portal_content.md`](./domains/portal_content.md) · test-case table format: condensed*

### Test Cases


| ID | Title | Preconditions | Steps | Expected Result | Priority |
|---|---|---|---|---|---|
| PORTAL-TC-001 | Portal home renders player profile | Player account linked to a player record | Navigate to `/portal` | Player's name, XP, badges, Academy progress render | High |
| PORTAL-TC-002 | Portal home — no linked player | Player/parent account with `playerId` unset | Navigate to `/portal` | "No player linked to this account" message shown, no crash | High |
| PORTAL-TC-003 | Consent card — minor player cannot self-confirm | Player account, `ageGroup != Senior`, consent Pending | View `/portal` | No confirm button; "Awaiting confirmation from guardian" text shown | High |
| PORTAL-TC-004 | Consent card — parent can confirm for minor | Parent account linked to minor player, consent Pending | Click "Confirm Consent" | `POST /api/confirm-consent` succeeds; card flips to Confirmed | High |
| PORTAL-TC-005 | Consent API — player under 19 cannot self-confirm server-side | `POST /api/confirm-consent` as a `player`-role session for a non-Senior player, role/playerId sourced from `app_metadata` | Call API directly | 403 "A guardian must confirm consent for a player under 19." | High |
| PORTAL-TC-006 | Foundation article always unlocked | Any player, any plan | Open a Foundation-stage article | Article renders; `recordArticleRead` called | High |
| PORTAL-TC-007 | Elite article locked on Free plan | Free-plan player, Elite article | Open Elite article by URL | Locked message; `recordArticleRead` NOT called | High |
| PORTAL-TC-008 | Mechanics unlocks at exactly 5 Foundation reads | 4 Foundation reads | View Mechanics article | Still locked, reason cites "1 more" | High |
| PORTAL-TC-009 | Mechanics unlocks at 5 reads + Player Pro | Player Pro, 5 Foundation reads | View Mechanics article | Unlocked | High |
| PORTAL-TC-010 | Mechanics unlocked via Library add-on without Player Pro | Free plan, `librarySubscriptionStatus="active"`, 5 reads | View Mechanics article | Unlocked | Medium |
| PORTAL-TC-011 | Reading an article awards correct per-stage XP | 0 reads | Read one Foundation article | `xp`/`acad_xp` +50 | High |
| PORTAL-TC-012 | Re-reading an article awards no XP | Already read article X | Navigate to X again | `xpAwarded=0`, `alreadyRead=true` | High |
| PORTAL-TC-013 | Completing a stage awards the 500 XP bonus | All-but-one Foundation reads | Read final article | +50 (or rate) + 500 in one write | High |
| PORTAL-TC-014 | Completing all 29 articles awards the 1,000 XP bonus | 28/29 reads | Read the 29th | +1000 included | High |
| PORTAL-TC-015 | Daily tip streak increments on consecutive days | Last viewed yesterday, streak=3 | Load `/portal` today | streak=4 | High |
| PORTAL-TC-016 | Daily tip streak resets after a gap | Last viewed 3 days ago, streak=5 | Load `/portal` today | streak resets to 1 | High |
| PORTAL-TC-017 | Daily tip streak — same-day no-op | Already viewed today | Reload same day | streak unchanged, no dup XP | High |
| PORTAL-TC-018 | 7-day tip streak bonus | Streak reaches 7 | Load tip on day 7 | +200 XP once, `tip-streak` badge earned | High |
| PORTAL-TC-019 | 14-day tip streak bonus re-fires | Streak reaches 14 | Load tip on day 14 | +200 XP again | Medium |
| PORTAL-TC-020 | Badge strip shows earned + next-up | Player with sessions/XP/reports | View `/portal` | Correct earned count and next-up badge | Medium |
| PORTAL-TC-021 | ArticleBody renders headings/bold/lists | n/a | Render fixture markdown | Correct output | Medium |
| PORTAL-TC-022 | ArticleBody resolves cross-article links | Sibling title match | Render `[Title](#)` | `<a href="/portal/learn/{id}">` | Medium |
| PORTAL-TC-023 | ArticleBody falls back on unresolved link | No matching title | Render `[Unknown](#)` | Bold text, no `<a>` | Low |
| PORTAL-TC-024 | send-message — missing fields | n/a | `POST /api/send-message {}` | 400 | High |
| PORTAL-TC-025 | send-message — not configured | `GMAIL_USER` unset | `POST` valid body | 500 "Email not configured." | High |
| PORTAL-TC-026 | send-message — success | Mocked transport | `POST` valid body | 200, `sendMail` called correctly | High |
| PORTAL-TC-027 | send-message — provider failure | `sendMail` rejects | `POST` valid body | 500 with error message | Medium |
| PORTAL-TC-028 | send-sms — missing fields | n/a | `POST /api/send-sms {to}` | 400 | High |
| PORTAL-TC-029 | send-sms — success via ClickSend | Mocked SUCCESS | `POST` valid body | 200 | High |
| PORTAL-TC-030 | send-sms — ClickSend failure surfaces message | Mocked FAILURE | `POST` valid body | 500 with `response_msg` | Medium |
| PORTAL-TC-031 | sendSms AU number normalization | n/a (unit) | `sendSms("0412345678", ...)` | `to` becomes `+61412345678` | Medium |
| PORTAL-TC-032 | sendSms with no phone | n/a | `sendSms(null, ...)` | `{success:false, error:"No phone number."}`, no network call | Medium |
| PORTAL-TC-033 | geocode — missing address | n/a | `POST /api/geocode {}` | 400 | High |
| PORTAL-TC-034 | geocode — not configured | `GOOGLE_MAPS_API_KEY` unset | `POST {address}` | 500 | High |
| PORTAL-TC-035 | geocode — success | Google mocked OK | `POST {address:"Sydney"}` | 200 `{lat,lng,formattedAddress}` | High |
| PORTAL-TC-036 | geocode — unresolvable address | Google mocked ZERO_RESULTS | `POST {address:"Nowhere"}` | 404 with status embedded | Medium |
| PORTAL-TC-037 | Bulk message does not actually send email/SMS | Coach selects N players | Trigger bulk send | `messages` rows created; `/api/send-message`/`/api/send-sms` NEVER called | High |
| PORTAL-TC-038 | Bulk SMS skips players without phone | Mixed player set | Send bulk SMS | Only phone-having players logged; skipped names shown | Medium |
| PORTAL-TC-039 | notify-new-article — non-admin forbidden | Caller `app_metadata.role = coach` | `POST {articleId}` | 403 | High |
| PORTAL-TC-040 | notify-new-article — broadcasts uniquely | Caller `app_metadata.role = platform_admin`, 2 unique + 1 dup email | `POST` valid articleId | `sendMail` called once, `bcc` has exactly 2 addresses | High |
| PORTAL-TC-041 | notify-new-article — silent skip when unconfigured | Admin caller, Gmail creds unset/placeholder | `POST` valid articleId | 200 `{success:true, skipped:true}` | Medium |
| PORTAL-TC-042 | AcademyLearnClient infinite-spinner regression | No `playerId` | Navigate to `/portal/learn` | **Currently**: infinite spinner (confirmed bug, still present) | High (regression guard) |
| PORTAL-TC-043 | Article read on locked stage via direct URL is a no-op | Free-plan player, direct-navigate to Elite article | Load URL | Locked message; no `article_reads` row; no XP change | High |
| PORTAL-TC-044 | Stage-complete bonus computed against live published count | Stage has fewer published articles than doc's stated count | Read all published | 500 XP bonus fires at N/N, not a fixed total | Medium |
| PORTAL-TC-045 | About page renders and is reachable while signed out | No session | Navigate to `/about` | 200, page renders, no redirect to `/login` | High |
| PORTAL-TC-046 | About page is reachable while signed in (no bounce) | Any signed-in role | Navigate to `/about` | Page renders normally, no redirect to `/players`/`/portal` | Medium |
| PORTAL-TC-047 | Contact form — happy path | Gmail + `PLATFORM_ADMIN_EMAIL` configured, mocked transport | Fill all 3 fields, submit | 200; `sendMail` called with correct `to/cc/replyTo/subject`; confirmation screen shown | High |
| PORTAL-TC-048 | Contact form — missing field rejected server-side | n/a | `POST /api/contact {name, message}` (no email) | 400 "Name, email, and message are all required." | High |
| PORTAL-TC-049 | Contact form — not configured | `PLATFORM_ADMIN_EMAIL` unset | `POST` valid body | 500 "Contact form isn't configured on this deployment." | High |
| PORTAL-TC-050 | Contact form — provider failure surfaces inline error | `sendMail` rejects | Submit form | Inline error shown; form remains editable, not replaced by confirmation | Medium |
| PORTAL-TC-051 | Contact form — no DB row created on success | Mocked send success | Submit form | No new row in any table (nothing to assert against — confirms table-less design) | Low |
| PORTAL-TC-052 | Privacy/Terms pages reachable pre-auth and post-auth alike | Signed out, then signed in as each role | Navigate to `/privacy` and `/terms` in both states | 200 both times, no redirect either way | Medium |
| PORTAL-TC-053 | Footer renders on every authenticated dashboard page | Signed-in coach/admin/player/parent | Navigate to `/players`, `/portal`, `/portal/learn`, any admin tool | AI-disclaimer + copyright footer visible on all | Medium |
| PORTAL-TC-054 | Footer does NOT render on public legal pages or /login | Signed out | Navigate to `/about`, `/login` | `Footer.tsx`'s specific AI-disclaimer text absent (LegalPageShell's own footer, if any, is present instead on legal pages) | Low |

---


### Test Case Tags


- `domain:portal-home`, `domain:academy-unlock`, `domain:academy-xp`, `domain:academy-badges`,
  `domain:academy-tips`, `domain:messaging-email`, `domain:messaging-sms`,
  `domain:messaging-bulk`, `domain:messaging-broadcast`, `domain:geocoding`, `domain:consent`,
  `domain:public-pages` (new), `domain:contact-form` (new)
- `layer:api`, `layer:component`, `layer:unit`, `layer:e2e`
- `role:player`, `role:parent`, `role:coach`, `role:platform_admin`, `role:anonymous` (new)
- `type:happy-path`, `type:validation`, `type:authorization`, `type:edge-case`,
  `type:regression`, `type:idempotency`
- `priority:high`, `priority:medium`, `priority:low`
- `status:known-bug` (PORTAL-TC-037, PORTAL-TC-042)
- `status:stale-mock-risk` (attach to any test exercising `notify-new-article`'s admin-role
  branch — see PORTAL-GAP-017)

---


### Existing Test Coverage vs Recommended


| Area | Coverage | Evidence |
|---|---|---|
| Portal home rendering (linked player, no-player state, today's tip) | EXISTING_TEST | `tests/components/PortalClient.test.tsx` — mocks `useAuth()` directly with a resolved `AuthUser` (role/playerId as top-level fields), so unaffected by the `user_metadata`→`app_metadata` migration |
| Academy learn page progress stats + streak | EXISTING_TEST | `tests/components/AcademyLearnClient.test.tsx` — same `useAuth()` mock pattern, unaffected |
| Academy learn page — no-player state (known bug) | WEAK — bug documented in a code comment, not asserted as a regression test | `tests/components/AcademyLearnClient.test.tsx` comment explicitly notes the infinite-spinner bug and avoids testing it — unchanged from before |
| Article unlock/lock rendering, XP toast, "not found" | EXISTING_TEST | `tests/components/ArticleReaderClient.test.tsx` |
| ArticleBody markdown rendering | EXISTING_TEST | `tests/components/ArticleBody.test.tsx` |
| Badge computation/display | EXISTING_TEST | `tests/components/BadgeStrip.test.tsx` |
| send-message API | EXISTING_TEST | `tests/api/send-message.test.ts` — route has no role check, unaffected by RBAC migration |
| send-sms API | EXISTING_TEST | `tests/api/send-sms.test.ts` — unaffected (no role check in route) |
| geocode API | EXISTING_TEST | `tests/api/geocode.test.ts` — unaffected (no role check in route) |
| notify-new-article API | **WEAK / LIKELY STALE** | `tests/api/notify-new-article.test.ts` exists and asserts 403-for-coach and 200-for-admin paths, but its admin fixture (`tests/mocks/caller.ts`'s `rawUser()`) constructs `{ user_metadata: { role: "platform_admin" } }` while the route now reads `caller?.app_metadata?.role` — traced directly, not assumed; the admin-path assertions almost certainly now fail with 403 instead of the expected 200/skip outcomes. See PORTAL-GAP-017. |
| E2E: portal home smoke | EXISTING_TEST | `tests/e2e/roles/player/portal.spec.ts` |
| E2E: Academy learn page + one article | EXISTING_TEST | `tests/e2e/roles/player/learn.spec.ts` — relies on organic dev-DB curriculum content |
| MessageModal component | **Missing** | No `tests/components/MessageModal.test.tsx`; only mocked as a stub elsewhere |
| BulkMessageModal component | **Missing** | No `tests/components/BulkMessageModal.test.tsx` |
| PlayerMessages component | **Missing** | No `tests/components/PlayerMessages.test.tsx` |
| academy-content.ts unlock/XP logic | **Missing** | No `tests/unit/lib/academy-content.test.ts` |
| badges.ts computeBadges | **Missing** | No `tests/unit/lib/badges.test.ts` |
| confirm-consent API | **Missing** | No `tests/api/confirm-consent.test.ts` found anywhere — still true post-merge |
| recordArticleRead / recordTipView server-state logic | Weak | Only exercised indirectly via component tests that mock `db.ts` entirely |
| Bulk message not-actually-sending behavior | **Missing** | No test asserts/documents this as a known gap |
| **About page (`/about`)** | **Missing** | No `tests/e2e/*about*` or any test referencing the page — zero coverage of any kind (confirmed via search) |
| **Contact page + `/api/contact`** | **Missing** | No `tests/components/*contact*`, no `tests/api/contact.test.ts`, no e2e spec — zero coverage of any kind |
| **Privacy / Terms pages** | **Missing** | No test of any kind references either page |
| **Footer component** | **Missing** | No `tests/components/Footer.test.tsx` |
| **LegalPageShell component** | **Missing** | No `tests/components/LegalPageShell.test.tsx` |
| **middleware.ts's new `isAlwaysPublicPage` allowlist** | **Missing** | No middleware-level test found asserting the new pages bypass auth correctly (or that `/api/contact` is exempt) |

### RECOMMENDED_TEST list (priority order)

1. `tests/api/contact.test.ts` — 400 on each missing field individually, 500 when unconfigured
   (each of the three required env vars missing in turn), 200 + correct `sendMail` args
   (`to`, `cc`, `replyTo`, subject, escaped HTML body) on success, 500 surfacing the provider
   error on `sendMail()` rejection. **Zero coverage today for a new, publicly-reachable,
   unauthenticated POST endpoint** — highest-priority gap in this entire domain update.
2. Fix `tests/mocks/caller.ts`'s `rawUser()` (or add an `appUser()` sibling) to construct
   `{ id, app_metadata: metadata }` so `tests/api/notify-new-article.test.ts`'s admin-path
   assertions test what they claim to test — this is a **documentation-only finding**, not a
   fix applied here, but it is the single most actionable, concretely-traced item in this pass.
3. `tests/e2e/public/legal-pages.spec.ts` (or similar) — About/Contact/Privacy/Terms all render
   with a 200 while signed out; remain reachable (no redirect) while signed in as each role;
   Contact's happy-path form submission (against a test inbox or a mocked route) reaches the
   confirmation screen.
4. `tests/components/Footer.test.tsx` and `tests/components/LegalPageShell.test.tsx` — trivial
   snapshot/text-presence tests, currently entirely absent for both new shared components.
5. `tests/unit/lib/academy-content.test.ts` — table-driven tests for every stage × plan ×
   read-count combination, including the Library-add-on-only-unlock path.
6. `tests/unit/lib/badges.test.ts` — all milestone boundaries.
7. Fix or explicitly xfail-document the `AcademyLearnClient` infinite-spinner bug
   (PORTAL-GAP-005) — still unaddressed after this merge.
8. `tests/components/MessageModal.test.tsx` / `BulkMessageModal.test.tsx` — including an
   explicit assertion that `BulkMessageModal` never calls `/api/send-message`/`/api/send-sms`,
   to lock in current (likely unintended) behavior until PORTAL-GAP-006 is resolved.
9. `tests/api/confirm-consent.test.ts` — still entirely missing.

---


---

## PAY — Payments Core — Stripe Webhook, Cron, Invoicing, AI Coach Chat

*Source: [`domains/payments_core.md`](./domains/payments_core.md) · test-case table format: condensed*

### Test Cases


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


### Test Case Tags


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


### Existing Test Coverage vs Recommended


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


---

