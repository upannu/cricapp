# Domain: Authentication, Authorization & Account Lifecycle

**Scope:** Authentication, session management, RBAC/authorization, account lifecycle (signup, login, password reset, admin approval, role-switching, additional-role requests, guardian consent) — plus the new public player self-registration flow.

**Reverse-engineered from:** live source in `web/` (Next.js 16 / React 19, Supabase Auth+DB, no dedicated `roles` table), re-read in full **after** a 120-commit merge from `origin/master` landed today (2026-09-01) that changed ~133 files across the app. Every claim below was verified against the CURRENT file content quoted inline; anything not directly observed is labeled `INFERRED`, `UNKNOWN`, or `REQUIRES VALIDATION`. This file **replaces** the prior (now-stale) analysis in its entirety — see §9 for an itemized list of what changed since that version.

**Do not trust the existing test suite's assertions as a spec.** Concrete, verified evidence (§8) shows a large share of this domain's existing tests mock/seed data using `user_metadata`, while the current production code reads/writes the equivalent fields on `app_metadata` — a real, in-flight migration this merge introduced (see AUTH-051). That mismatch is why tests that were true before this merge are very likely failing now; their names/structure are still useful hints, their assertions are not.

---

## 1. Domain Overview

CRIC HQ ("PACE HQ") is a cricket fast-bowling coaching platform with five account roles, authenticated via **Supabase Auth** (email/password) and authorized via a JWT metadata bag — there is still no separate `roles`/`permissions` table in the database. As of this merge, **security-sensitive identity fields have been relocated from `user_metadata` to `app_metadata`**: `role`, `approved`, `academy_id`, `coach_id`, `player_id`, and `linkedIdentities` are now read and written exclusively on `app_metadata` (server-only — settable only via the Supabase Admin API with the service-role key, never by a signed-in client calling `supabase.auth.updateUser()`). `user_metadata` is now used only for the display-only `name` field. This is a genuine security hardening: previously (per the prior analysis and confirmed by every route/helper below reading `user_metadata` before this merge) role/approval lived in a field a client SDK call could, in principle, overwrite for their own account; that is no longer possible.

**Roles (`web/lib/types.ts` `UserRole`, unchanged):**
| Role | Scope |
|---|---|
| `platform_admin` | Full platform access; not self-selectable at signup |
| `academy_admin` | Manages one academy's coaches/players (scoped by `academy_id`) |
| `coach` | Manages their own assigned players (scoped by `coach_id`) |
| `player` | Self-service portal for their own data (scoped by `player_id`) |
| `parent` | Guardian portal for a linked player's data (scoped by `player_id`) |

**Key domain boundaries (current):**
- **Route gating** still happens in three independent layers: edge `middleware.ts` (session presence only — never role/approval), client `AuthGuard.tsx` (session + `approved` + player/parent confinement to `/portal`), and per-API-route checks (role only, read from `app_metadata`).
- **New signup behavior split by role:** `academy_admin`/`coach` self-signups are still queued in `user_requests` for platform-admin approval (`approved:false` until approved) — unchanged from before. `player`/`parent` self-signups now **auto-approve immediately** (`approved:true`, no admin review) provided their submitted "registered player email" resolves to an existing `players` row — this is a genuinely new business rule this merge introduced (see AUTH-011/AUTH-047).
- **A brand-new public, code-gated self-registration page (`/register`)** lets a parent/player register a player's basic details directly into the `players` table with **no Supabase Auth account created at all** — it is a lead-capture form, not an account-creation flow. A separate step (signing up normally at `/signup` with the same email) is how that person later gets an actual login (see AUTH-042–045).
- **Approval is still a single, non-delegated, platform-admin-only gate** for the "new" (non-link, non-auto-approved) request path; academy admins cannot approve their own academy's pending coaches.
- **One email = one Supabase Auth user**, with multiple linked identities via `app_metadata.linkedIdentities`, switchable through the NavBar role switcher. Player/parent identities now dedup per-child (`role`+`playerId`) rather than per-role, so a second child's parent-link request is no longer silently swallowed as "already linked" (see AUTH-055).
- **Guardian consent** is unchanged: only a `Senior` (19+) player may self-confirm; a `parent` account faces no age restriction.
- **Account lockout** is unchanged in mechanism (`players.login_disabled`, staff-only reactivation) but now reads the lockout-relevant `player_id` off `app_metadata` instead of `user_metadata`.
- **The route-check-order pattern the task asked to verify precisely:** across every route re-read for this domain, the *relative order* of "is a field present" → "is the caller authorized" → "does the target resource exist" checks is **unchanged from before** wherever it can be compared. What changed is not the order of checks but the *data source* each permission check reads (`app_metadata` now, `user_metadata` before) — see the decision table in §4(g). No route was found to have swapped a 403 and a 404 relative to each other in its own internal logic; the "403 in places that used to be 404/400" pattern reported for this session is best explained by **stale test fixtures/mocks still writing `user_metadata`** (§8), which makes a route's role check resolve to `undefined` against those fixtures and therefore return 403 where the *test* expected a 200 — not a genuine reordering in the source.

---

## 2. Implemented Requirements

### AUTH-001 — Unauthenticated visitor blocked from protected routes
- **Category:** Security-Authorization
- **Description:** Any request to a non-public, non-always-public page or non-exempt API route without a valid Supabase session is redirected to `/login`.
- **Component:** Edge middleware
- **Source files:** `web/middleware.ts` — `middleware()`, lines 75-77
- **Inputs:** Incoming request, Supabase session cookie
- **Outputs:** Redirect to `/login`, or pass-through
- **Validation:** `supabase.auth.getUser()` must resolve a user; pathname must not match `isPublicPage`, `isAlwaysPublicPage`, or `isAuthApi`.
- **Business rules:** Applies to every route except the matcher's excluded static assets.
- **Permissions:** None — session-presence only, not role.
- **Error handling:** Silent redirect, no error thrown.
- **Edge cases:** `isAuthApi` and `isAlwaysPublicPage` routes are explicitly exempted (see AUTH-003, AUTH-041).
- **Dependencies:** `@supabase/ssr` `createServerClient`.
- **Status:** IMPLEMENTED (unchanged)

### AUTH-002 — Public auth pages reachable without a session
- **Category:** Functional
- **Description:** `/login`, `/signup`, `/forgot-password`, `/reset-password` never redirect an unauthenticated visitor away.
- **Component:** Edge middleware
- **Source:** `web/middleware.ts` lines 58-62, `isPublicPage` constant
- **Validation:** `pathname.startsWith(...)` prefix match against the four routes.
- **Status:** IMPLEMENTED (unchanged)

### AUTH-003 — Auth-exempt API allowlist (CHANGED — grew from 6 to 9 prefixes)
- **Category:** Integration
- **Description:** A set of API path prefixes bypass both "must be logged in" and "logged-in users get redirected off public pages," because they must work identically with or without a session cookie.
- **Component:** Edge middleware
- **Source:** `web/middleware.ts` lines 39-56, `isAuthApi` constant
- **Before (per prior analysis):** `/api/lookup-player`, `/api/notify-admin-signup`, `/api/check-existing-account`, `/api/request-additional-role`, `/api/stripe/webhook`, `/api/cron/pack-reminders` (6 prefixes, the cron one path-exact to a single job).
- **After (current code, verbatim list):** `/api/lookup-player`, `/api/notify-admin-signup`, `/api/check-existing-account`, `/api/request-additional-role`, **`/api/complete-signup`** (new — "runs right after signUp() to set the account's real role/approval — the caller has no session yet if email confirmation is required"), `/api/stripe/webhook`, **`/api/cron/` (broadened from one job to the whole cron prefix)**, **`/api/contact`** (new — public contact form), **`/api/public-register-player`** (new — gated by its own shared code, not a session).
- **Business rules:** `stripe/webhook` and `cron/*` authenticate via their own out-of-band secret (HMAC / `CRON_SECRET` bearer), verified inside each route, not by session — unchanged mechanism, just a wider prefix match for cron.
- **Status:** IMPLEMENTED (CHANGED — see before/after above)

### AUTH-004 — Logged-in user bounced off public pages
- **Category:** Business Rule
- **Description:** A user with a valid session who navigates to `/login`, `/forgot-password`, or `/reset-password` is redirected to `/players`.
- **Source:** `web/middleware.ts` line 81-83: `if (user && isPublicPage && pathname !== "/signup") return NextResponse.redirect(new URL("/players", request.url));`
- **Business rules:** `/players` is a hard-coded landing target regardless of role; player/parent then get a second client-side hop to `/portal` via `AuthGuard` (AUTH-020) — unchanged double-redirect behavior.
- **Status:** IMPLEMENTED (unchanged)

### AUTH-005 — Logged-in user may still visit /signup to request an additional role
- **Category:** Business Rule
- **Description:** `/signup` remains reachable by an authenticated user — entry point for "link an additional role to my existing account."
- **Source:** `web/middleware.ts` line 81 comment; `web/app/signup/page.tsx`; `web/app/api/request-additional-role/route.ts`
- **Status:** IMPLEMENTED (unchanged)

### AUTH-006 — Email/password authentication
- **Category:** Functional
- **Description:** Standard Supabase email/password sign-in.
- **Source:** `web/lib/auth.tsx` `AuthProvider.login()` (lines 70-102); `web/app/login/page.tsx` `handleSubmit()`
- **Inputs:** `email` (trimmed), `password`
- **Outputs:** Session cookie set by Supabase client; `router.push("/players")` on success
- **Error handling:** Any Supabase error surfaces as "Invalid email or password." unless it is the new `EMAIL_NOT_CONFIRMED` sentinel (AUTH-052) or the `ACCOUNT_DISABLED::` sentinel (AUTH-007).
- **Status:** IMPLEMENTED (unchanged core; see AUTH-052 for a genuinely new adjacent branch)

### AUTH-007 — Post-authentication player lockout check (CHANGED — now reads `app_metadata`)
- **Category:** Security-Authorization
- **Description:** After a successful password check, if the authenticated user is linked to a player, their player row's `login_disabled` flag is read; if true, the session is signed back out and a disabled-account message is returned.
- **Source:** `web/lib/auth.tsx` lines 84-99:
  ```ts
  const playerId = data.user?.app_metadata?.player_id as string | undefined;
  if (playerId) {
    const { data: player } = await supabase.from("players").select("login_disabled, disabled_reason").eq("id", playerId).maybeSingle();
    if (player?.login_disabled) {
      await supabase.auth.signOut();
      return `ACCOUNT_DISABLED::${player.disabled_reason || "Your account has been locked — contact your academy."}`;
    }
  }
  ```
- **Before:** read `data.user?.user_metadata?.player_id`. **After:** reads `data.user?.app_metadata?.player_id` — same logic, new (server-only) data source.
- **Business rules:** Checked post-auth only (RLS requires an authenticated read); reactivation is staff-only (AUTH-028), never automatic.
- **Status:** IMPLEMENTED (CHANGED — data source only, behavior identical)

### AUTH-008 — Generic invalid-credentials message
- **Category:** Security-Authorization
- **Description:** The login page shows "Invalid email or password." for any Supabase auth error that isn't a recognized sentinel.
- **Source:** `web/app/login/page.tsx` lines 45-51
- **Status:** IMPLEMENTED (unchanged)

### AUTH-009 — Successful-login redirect target
- **Category:** Functional
- **Description:** On success, `router.push("/players")` regardless of role.
- **Source:** `web/app/login/page.tsx` line 54
- **Status:** IMPLEMENTED (unchanged)

### AUTH-010 — Duplicate-email detection routes signup into "link" flow
- **Category:** Business Rule
- **Description:** Before `supabase.auth.signUp()`, the client calls `/api/check-existing-account`; if the email already has an account, submits to `/api/request-additional-role` instead.
- **Source:** `web/lib/auth.tsx` lines 116-131
- **Status:** IMPLEMENTED (unchanged)

### AUTH-011 — New account creation (CHANGED SUBSTANTIALLY)
- **Category:** Functional
- **Description:** A brand-new signup now creates the Supabase Auth account with **only** a display name, then hands off to a dedicated server route to decide role/approval.
- **Source:** `web/lib/auth.tsx` lines 136-159:
  ```ts
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
  ...
  const completeRes = await fetch("/api/complete-signup", { method: "POST", ... body: JSON.stringify({ userId: data.user.id, name, email, role, playerLookupEmail, academyName, academyLocation }) });
  ```
- **Before:** `supabase.auth.signUp()` was called with `options.data: { name, role, approved: false }` directly — role/approval were written to `user_metadata` client-side, at signup time, before any server-side check.
- **After:** `signUp()`'s `options.data` sets **only** `name` (client-writable `user_metadata`, display-only). The actual `role`/`approved`/scope decision is made entirely server-side in `/api/complete-signup` (AUTH-046), writing to `app_metadata`. This is the concrete mechanism behind AUTH-051's security hardening.
- **Status:** IMPLEMENTED (CHANGED — see before/after)

### AUTH-012 — Pending-approval request queued (CHANGED — no longer universal)
- **Category:** Data
- **Description:** A `user_requests` row is inserted for review — but, unlike before, **only** for `academy_admin`/`coach` self-signups (and "link" requests). `player`/`parent` self-signups that resolve to an existing player now skip the queue entirely (auto-approved — AUTH-047).
- **Source:** `web/app/api/complete-signup/route.ts` lines 55-113 (player/parent branch returns `{ success: true, approved: true }` with no `user_requests` insert; academy_admin/coach branch inserts into `user_requests` as before, comment explicitly: "unchanged from before: still queued for a platform admin to review")
- **Status:** IMPLEMENTED (CHANGED — see AUTH-047)

### AUTH-013 — Admin email notification on new signup
- **Category:** Integration
- **Description:** Fire-and-forget POST to `/api/notify-admin-signup` after a queued (non-auto-approved) new-account signup.
- **Source:** `web/app/api/complete-signup/route.ts` lines 115-120 (moved here from the client in the old flow, same fire-and-forget `.catch(() => {})` pattern); `web/app/api/notify-admin-signup/route.ts`
- **Business rules:** Silently no-ops if Gmail/admin-email env vars aren't all configured. Now also always CCs a hard-coded `support@crichq.com.au` in addition to `PLATFORM_ADMIN_EMAIL` (deduped case-insensitively) — this is a small but real behavior change (`web/app/api/notify-admin-signup/route.ts` lines 39-41).
- **Status:** IMPLEMENTED (CHANGED — moved server-side + always-CC support email)

### AUTH-014 — Client-side password validation on signup
- **Category:** Validation
- **Description:** Signup form blocks submission unless password ≥ 8 characters and matches confirmation.
- **Source:** `web/app/signup/page.tsx` lines 108-109
- **Status:** IMPLEMENTED (unchanged)

### AUTH-015 — Role-specific required fields on signup
- **Category:** Validation
- **Description:** `academy_admin` requires a non-empty academy name; `player`/`parent` require a successful player-lookup match.
- **Source:** `web/app/signup/page.tsx` lines 110-117
- **Status:** IMPLEMENTED (unchanged)

### AUTH-016 — Debounced player-lookup during signup
- **Category:** Functional
- **Description:** For `player`/`parent`, a 500ms-debounced call to `GET /api/lookup-player` as the "registered player email" field is typed.
- **Source:** `web/app/signup/page.tsx` lines 88-104
- **Status:** IMPLEMENTED (unchanged)

### AUTH-017 — API: GET /api/lookup-player (CHANGED — now reports sibling count)
- **Category:** API
- **Description:** Public endpoint returning whether a player exists for a given email.
- **Source:** `web/app/api/lookup-player/route.ts`
- **Before:** `{ found, playerName }` only.
- **After:** `{ found, playerName, additionalCount }` — `additionalCount = data.length - 1` when more than one player row shares the email (line 30), surfaced in the signup UI as "(+N more children at this email — you'll get access to all of them)" (`web/app/signup/page.tsx` line 247). Reflects the new multi-sibling linking behavior in `complete-signup` (AUTH-047).
- **Order of checks:** 400 missing email → 500 no service key → query → 200.
- **Status:** IMPLEMENTED (CHANGED — response shape)

### AUTH-018 — API: POST /api/check-existing-account
- **Category:** API
- **Description:** Public endpoint answering "does any account exist for this email."
- **Source:** `web/app/api/check-existing-account/route.ts`
- **Order of checks:** 400 missing email → 500 no service key → 500 `listUsers` error → 200 `{ exists }`.
- **Status:** IMPLEMENTED (unchanged)

### AUTH-019 — API: POST /api/request-additional-role (CHANGED — reads app_metadata)
- **Category:** API / Security-Authorization
- **Description:** Queues a request to link an additional role onto an existing account, after the requester proves ownership by signing in with the account's real password.
- **Source:** `web/app/api/request-additional-role/route.ts`
- **Before:** `const meta = existingUser.user_metadata ?? {};`
- **After:** `const meta = existingUser.app_metadata ?? {};` (line 41) — same 409 "already has this role" logic, now reading the server-only field.
- **Business rules (unchanged):** `player`/`parent` are exempt from the "already has this role" 409 (a person can legitimately request a `player`/`parent` link once per child) — only `academy_admin`/`coach` are blocked as duplicates here.
- **Order of checks:** 400 missing fields → 500 no service key → 500 `listUsers` error → 404 no existing account → 403 wrong password → 409 already has role (academy_admin/coach only) → 500 insert error → 200.
- **Status:** IMPLEMENTED (CHANGED — data source only)

### AUTH-020 — AuthGuard: player/parent confined to /portal
- **Category:** Security-Authorization
- **Description:** Any player/parent navigating client-side to a route outside `/portal` is `router.replace("/portal")`'d — with one explicit exception, their own `/players/[id]/subscription` page.
- **Source:** `web/components/AuthGuard.tsx` lines 13-30
- **Note:** The subscription-page exception (`isOwnSubscriptionPage`) is present in the current file; the prior analysis's description of this rule did not call out this exception explicitly, but it is a narrow, self-consistent carve-out rather than a new rule, so this ID is kept as unchanged in substance (documented here for completeness).
- **Status:** IMPLEMENTED (unchanged in the current merge's diff)

### AUTH-021 — AuthGuard: pending-approval gate
- **Category:** Security-Authorization / Business Rule
- **Description:** An authenticated user whose `AuthUser.approved` is `false` sees a full-screen "Awaiting Approval" interstitial with "Check approval status" (`refreshUser()`) and "Sign out."
- **Source:** `web/components/AuthGuard.tsx` lines 40-82
- **Status:** IMPLEMENTED (unchanged; its data source `AuthUser.approved` now comes from `app_metadata` — see AUTH-051)

### AUTH-022 — AuthGuard: unauthenticated client-side redirect (defense in depth)
- **Category:** Security-Authorization
- **Description:** If `useAuth().user` is null on mount, `router.replace("/login")`, duplicating middleware's server-side enforcement.
- **Source:** `web/components/AuthGuard.tsx` lines 14-17
- **Status:** IMPLEMENTED (unchanged)

### AUTH-023 — API: POST /api/approve-user — platform_admin-only gate (CHANGED — app_metadata)
- **Category:** Security-Authorization
- **Description:** Only a caller whose `app_metadata.role === "platform_admin"` may call this endpoint.
- **Source:** `web/app/api/approve-user/route.ts` lines 31-34: `if (caller?.app_metadata?.role !== "platform_admin") return NextResponse.json({ error: "Only a platform admin can approve requests." }, { status: 403 });`
- **Before:** read `caller?.user_metadata?.role`.
- **Status:** IMPLEMENTED (CHANGED — data source only)

### AUTH-024 — API: POST /api/approve-user — new-signup approval (CHANGED — coach auto-creation is no longer best-effort-only)
- **Category:** Business Rule / API
- **Description:** For a `request_type !== "link"` row: (a) player/parent → resolve `player_lookup_email` to a real `players.id`; (b) coach → link an existing `coaches` row by email, **or now create one** if none exists; (c) find the real Auth user by email; (d) set `app_metadata.approved=true` plus resolved scope IDs and `email_confirm:true`; (e) delete the `user_requests` row; (f) best-effort approval email.
- **Source:** `web/app/api/approve-user/route.ts` lines 89-111:
  ```ts
  let linkedCoachId: string | undefined;
  if (reqData.role === "coach") {
    const { data: coachMatches } = await supabase.from("coaches").select("id").ilike("email", reqData.email).limit(1);
    linkedCoachId = coachMatches?.[0]?.id;
    if (!linkedCoachId) {
      const newCoachId = `c_${Date.now()}`;
      const { error: coachInsertError } = await supabase.from("coaches").insert({ id: newCoachId, name: reqData.name, email: reqData.email, ... academy_id: null, marketplace_visible: false });
      ...
      linkedCoachId = newCoachId;
    }
  }
  ```
- **Before:** coach linking was a best-effort, non-fatal lookup only — if no matching `coaches` row existed, the approved account silently ended up with **no `coach_id`** (a known, documented gap producing an orphaned, non-functional coach account for a genuinely independent self-signed-up coach).
- **After:** a genuinely independent coach (self-signup, no pre-existing `coaches` row from an academy invite) now gets a brand-new `coaches` row created for them automatically at approval time, with `academy_id: null` (independent) — this closes the prior gap rather than merely documenting it. Also writes `app_metadata` (was `user_metadata`) throughout.
- **Order of checks:** 400 userId missing → 403 not platform_admin → 500 no service key → 404 request not found → 400 player/parent missing lookup email → 400 no player match → (coach linking, non-fatal) → 500 `listUsers` error → 404 no auth user found (auto-dequeue) → 400 `updateUserById` error → 200 (+ best-effort email).
- **Status:** IMPLEMENTED (CHANGED — see before/after)

### AUTH-025 — API: POST /api/approve-user — link-request approval (CHANGED — per-child dedup)
- **Category:** Business Rule / API
- **Description:** For `request_type === "link"`, merges a new `LinkedIdentity` onto the existing account's `app_metadata.linkedIdentities` without touching the account's currently-active role/scope.
- **Source:** `web/app/api/approve-user/route.ts` lines 117-157:
  ```ts
  const alreadyLinked = (newIdentity.role === "player" || newIdentity.role === "parent")
    ? seeded.some((li) => li.role === newIdentity.role && li.playerId === newIdentity.playerId)
    : seeded.some((li) => li.role === newIdentity.role);
  ```
- **Before:** de-dupe was by `role` alone for every role — meaning a second child's `parent`/`player` link request, once one such identity already existed, would have silently no-op'd on approval (never actually appended).
- **After:** `player`/`parent` identities dedupe on the **(role, playerId)** pair, so a genuinely new child's link is appended even if the account already has one `parent`/`player` identity; only `academy_admin`/`coach` (where a second identity of the same role makes no sense) still dedupe by role alone.
- **Status:** IMPLEMENTED (CHANGED — see before/after; a real bug-fix for multi-child families)

### AUTH-026 — API: POST /api/reject-user (CHANGED — app_metadata)
- **Category:** Business Rule / API / Security-Authorization
- **Description:** Platform-admin-only. Dequeues a `user_requests` row; deletes the Supabase Auth user for a `"new"` request; never deletes the account for a `"link"` request.
- **Source:** `web/app/api/reject-user/route.ts` line 19: `if (caller?.app_metadata?.role !== "platform_admin") ...`
- **Status:** IMPLEMENTED (CHANGED — data source only)

### AUTH-027 — API: GET /api/pending-approvals (CHANGED — app_metadata)
- **Category:** API
- **Description:** Platform-admin-only listing of the full `user_requests` queue, ordered oldest-first.
- **Source:** `web/app/api/pending-approvals/route.ts` line 16
- **Status:** IMPLEMENTED (CHANGED — data source only)

### AUTH-028 — API: POST /api/reactivate-player (CHANGED — app_metadata)
- **Category:** Business Rule / API / Security-Authorization
- **Description:** Clears a player's `login_disabled` lockout. Callable by `platform_admin` (unscoped) or `academy_admin` (own academy roster only).
- **Source:** `web/app/api/reactivate-player/route.ts` lines 17-46
- **Order of checks:** 400 playerId missing → 403 role not admin → 500 no service key → 404 player not found → 403 academy scoping (academy_admin only) → 500 update error → 200.
- **Status:** IMPLEMENTED (CHANGED — data source only; order unchanged)

### AUTH-029 — API: POST /api/invite-coach (CHANGED — app_metadata; more explicit comment on the boundary)
- **Category:** Business Rule / API / Security-Authorization
- **Description:** Sends a Supabase Auth invite email to a prospective coach, seeding `app_metadata.role="coach"` (+ `coach_id` if supplied), redirecting to `/reset-password`.
- **Source:** `web/app/api/invite-coach/route.ts` lines 12-15 (`getCaller()`), 44-47 (`app_metadata: { role: "coach", approved: true, ...(coachId ? { coach_id: coachId } : {}) }`)
- **Business rules:** Explicit comment: `inviteUserByEmail`'s `data` option only ever writes `user_metadata` (display-only `name`); role/approved/`coach_id` are set in a second, separate `updateUserById` call writing `app_metadata` — same two-step pattern now used everywhere in this domain (AUTH-051).
- **Order of checks:** 400 missing email/name → 403 not admin (via `getCaller()`, also covers not-signed-in) → 500 no service key → 400 invite error → 400 metadata-update error → 200.
- **Status:** IMPLEMENTED (CHANGED — data source + explicit boundary comment; `coachId` still unverified against caller's own academy — unchanged gap, AUTH-GAP-003)

### AUTH-030 — API: POST /api/switch-role (CHANGED — app_metadata)
- **Category:** Security-Authorization / API
- **Description:** Changes the caller's active role/scope to one of the identities already present in their own `linkedIdentities` — never trusts a client-supplied arbitrary identity.
- **Source:** `web/app/api/switch-role/route.ts` lines 26-27 (`const meta = caller.app_metadata ?? {}`), 47-55 (`updateUserById(caller.id, { app_metadata: {...meta, role: target.role, ...} })`)
- **Order of checks:** 400 role missing → 401 not signed in → 403 identity not linked → 500 no service key → 500 update error → 200.
- **Status:** IMPLEMENTED (CHANGED — data source only)

### AUTH-031 — NavBar role-switcher UI (CHANGED — now shows real per-child names)
- **Category:** Functional / UI
- **Description:** When `linkedIdentities.length > 1`, the name/role badge becomes a dropdown listing every linked identity; selecting one calls `/api/switch-role`, `refreshUser()`, then redirects.
- **Source:** `web/components/NavBar.tsx` `handleSwitchRole()` (lines 133-151), `identityLabel()` (lines 91-97)
- **Before:** each identity rendered as its generic role label only (e.g. two children both show "Player").
- **After:** fetches real per-child names/academy via the new `POST /api/players/linked-names` (AUTH-050) whenever ≥2 linked identities carry a `playerId`, so two linked children render as e.g. "Aarav Patel · Bella Vista" vs "Aarav Patel Jr. · Bella Vista" instead of two identical "Player" entries (lines 72-97).
- **Status:** IMPLEMENTED (CHANGED — see before/after)

### AUTH-032 — API: POST /api/confirm-consent (CHANGED — app_metadata)
- **Category:** Business Rule / Security-Authorization / API
- **Description:** Marks a player's guardian consent confirmed. Only `player`/`parent`, only for their own linked player; `player`-role additionally requires `age_group === "Senior"`.
- **Source:** `web/app/api/confirm-consent/route.ts` lines 17-18: `const role = user.app_metadata?.role; const playerId = user.app_metadata?.player_id as string | undefined;`
- **Order of checks:** 401 not signed in → 403 role not player/parent → 400 no linked player_id → 500 no service key → 403 age-gate (player role only) → 500 update error → 200.
- **Business rules (unchanged):** `parent` faces no age check at all — asymmetric, undocumented in code, same as before.
- **Status:** IMPLEMENTED (CHANGED — data source only; order and business rule unchanged)

### AUTH-033 — Password reset request
- **Category:** Functional
- **Description:** `/forgot-password` calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + "/reset-password" })`.
- **Source:** `web/app/forgot-password/page.tsx`
- **Status:** IMPLEMENTED (unchanged)

### AUTH-034 — Password reset completion
- **Category:** Functional
- **Description:** `/reset-password` listens for `PASSWORD_RECOVERY`/`SIGNED_IN` events to unlock the "set new password" form; also checks for an already-active session on mount.
- **Source:** `web/app/reset-password/page.tsx`
- **Edge cases:** Still no timeout/error state if neither event fires — stays on "Verifying your link…" indefinitely (unchanged gap, AUTH-GAP-008).
- **Status:** IMPLEMENTED (unchanged; PARTIALLY — no expired-link handling)

### AUTH-035 — Server helper: getCaller() (CHANGED — app_metadata)
- **Category:** Security-Authorization
- **Description:** Reads the caller's identity from their session cookie for privileged (service-role) API routes.
- **Source:** `web/lib/server-auth.ts` lines 14-30:
  ```ts
  return {
    userId: user.id,
    role: user.app_metadata?.role,
    academyId: user.app_metadata?.academy_id,
    coachId: user.app_metadata?.coach_id,
    playerId: user.app_metadata?.player_id,
  };
  ```
- **Before:** every field read off `user.user_metadata`.
- **Status:** IMPLEMENTED (CHANGED — data source only; this is the single function most other privileged routes' role checks ultimately depend on, directly or via the hand-rolled inline equivalent)

### AUTH-036 — Server helper: callerCanAccessPlayer()
- **Category:** Security-Authorization
- **Description:** Ownership check for a specific player: `platform_admin` always; `player`/`parent` only self; `coach` only own assigned players; `academy_admin` only own roster.
- **Source:** `web/lib/server-auth.ts` lines 37-55
- **Status:** IMPLEMENTED (function body itself unchanged — it takes a pre-resolved `Caller`, so it is agnostic to whether that `Caller` was built from `app_metadata` or `user_metadata`; its correctness now depends entirely on `getCaller()` (AUTH-035) supplying accurate `app_metadata`-sourced values)

### AUTH-037 — Server helper: canAccessPlayerServer() (CHANGED — app_metadata)
- **Category:** Security-Authorization
- **Description:** Near-duplicate of AUTH-036, implemented independently, reading the session directly rather than taking a `Caller`; guards server-rendered `/players/[id]/*` pages.
- **Source:** `web/lib/supabase-server.ts` lines 38-58, e.g. line 42: `const role = user.app_metadata?.role as string | undefined;`
- **Before:** read `user.user_metadata?.role` etc.
- **Status:** IMPLEMENTED (CHANGED — data source only; still duplicated logic, unchanged gap AUTH-GAP-002)

### AUTH-038 — Server helper: isAcademyPlayerServer()
- **Category:** Data / Business Rule
- **Description:** Whether a player belongs to any academy (`academies.player_ids` contains the id) — routes subscription-page logic.
- **Source:** `web/lib/supabase-server.ts` lines 64-71
- **Status:** IMPLEMENTED (unchanged)

### AUTH-039 — Client auth-state hydration (CHANGED SUBSTANTIALLY — app_metadata)
- **Category:** Functional
- **Description:** Converts a raw Supabase user object into the app's `AuthUser` shape on load and on every `onAuthStateChange` event.
- **Source:** `web/lib/auth.tsx` lines 31-49:
  ```ts
  const meta = sbUser.user_metadata ?? {};
  const secureMeta = sbUser.app_metadata ?? {};
  const linkedIdentities = secureMeta.linkedIdentities as LinkedIdentity[] | undefined;
  return {
    id: sbUser.id,
    name: (meta.name as string) ?? sbUser.email ?? "",
    email: sbUser.email ?? "",
    role: (secureMeta.role as AuthUser["role"]) ?? "coach",
    approved: secureMeta.approved !== undefined ? (secureMeta.approved as boolean) : true,
    academyId: secureMeta.academy_id as string | undefined,
    coachId: secureMeta.coach_id as string | undefined,
    playerId: secureMeta.player_id as string | undefined,
    linkedIdentities: linkedIdentities && linkedIdentities.length > 1 ? linkedIdentities : undefined,
  };
  ```
  with an explicit in-code security comment: "Security-sensitive fields (role, approved, and every identity link) live in app_metadata — server-only, never client-writable. user_metadata is still where display-only `name` lives."
- **Before:** every field (`role`, `approved`, `academy_id`, `coach_id`, `player_id`, `linkedIdentities`) was read off `user_metadata`, including `name`.
- **Business rules (unchanged):** `role` defaults to `"coach"` if absent; `approved` defaults to `true` if absent; `linkedIdentities` only surfaced when >1 entry.
- **Status:** IMPLEMENTED (CHANGED — this is the client-side half of AUTH-051's migration)

### AUTH-040 — Demo-account quick-login (dead code)
- **Category:** Functional
- **Description:** `DEMO_ACCOUNTS` and a commented-out demo-login UI block remain in the codebase, fully disabled.
- **Source:** `web/lib/auth.tsx` lines 224-229; `web/app/login/page.tsx` lines 6-24, 67-73, 188-213
- **Status:** NOT_IMPLEMENTED (unchanged — still dead/disabled code, not reachable)

---

### AUTH-041 — NEW: "Always-public" pages, visible whether or not signed in
- **Category:** Business Rule
- **Description:** A second, distinct public-page category from AUTH-002: these pages are visible to a signed-out **and** a signed-in visitor alike (no bounce to `/players` the way `isPublicPage` pages get, per AUTH-004).
- **Component:** Edge middleware
- **Source:** `web/middleware.ts` lines 66-73:
  ```ts
  const isAlwaysPublicPage =
    pathname.startsWith("/about") ||
    pathname.startsWith("/contact") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/register");
  ```
- **Business rules:** `/about`/`/contact`/`/terms`/`/privacy` are legal/info pages — "no reason to bounce someone reading the Terms just because they're logged in" (in-code comment). `/register` (the new public player self-registration page, AUTH-042) is included here deliberately so "a coach/staff member should be able to open it too (e.g. to demo it to a parent) without getting bounced."
- **Permissions:** None.
- **Status:** IMPLEMENTED (NEW — this whole category did not exist in the prior analysis)

### AUTH-042 — NEW: Public player self-registration page (/register) — code gate
- **Category:** Functional / Security-Authorization (weak)
- **Description:** A brand-new, publicly reachable page that lets a parent/player register a player's basic details directly, gated by a shared plaintext code rather than any login.
- **Component:** `web/app/register/page.tsx` (332 lines, entirely new)
- **Source:** `web/app/register/page.tsx` `handleUnlock()` (lines 62-84); `web/app/api/public-register-player/route.ts` `POST()` `validateOnly` branch (lines 58-70)
- **Inputs:** `code` (free text)
- **Outputs:** On a valid code, `unlocked=true` and the registration form is shown; on an invalid code, an inline error, form stays locked.
- **Validation:** Code is checked against a hardcoded allowlist server-side (see AUTH-043) — client never validates the code itself, only that it's non-empty before calling the API.
- **Business rules (explicit in-code comment):** "Simple shared access codes gating the public registration page at /register — intentionally not a security boundary (no login, no per-parent identity), just enough to keep the form from being wide open to random internet traffic."
- **Permissions:** None — anyone with the code.
- **Error handling:** `checkingCode`/`codeError` UI states; network failure shows "Could not verify the code — check your connection and try again."
- **Edge cases:** Code is case-insensitive and trimmed server-side (`code?.trim().toLowerCase()`).
- **Dependencies:** `POST /api/public-register-player` (AUTH-043/044).
- **Status:** IMPLEMENTED (NEW)

### AUTH-043 — NEW: POST /api/public-register-player — new player creation
- **Category:** Functional / Data / API
- **Description:** For a valid code and no `playerId` in the request, creates a brand-new `players` row directly (no Supabase Auth account) with sensible starter defaults, and adds it to a single hardcoded academy's roster.
- **Source:** `web/app/api/public-register-player/route.ts` `POST()` lines 123-159
- **Inputs:** `code`, `name`, `email`, `phone`, `ageGroup`, `bowlingStyle`, `club?`
- **Outputs:** `{ success: true }`; new `players` row with `guardian_consent_status: "Pending"`, `sub_plan: "Free"`, `coach_id: null`, `registration_code: <the code used>`.
- **Validation:** Code validity (403); `name`/`email`/`phone` non-empty (400 each); `ageGroup` must be one of a fixed 8-value list (400); `bowlingStyle` must be one of a fixed 6-value list (400) — explicit in-code rationale: "No silent defaulting here — a record only counts as actually registered once a parent has deliberately picked both of these."
- **Business rules:** `TARGET_ACADEMY_ID = "ac1786871143102"` and `VALID_CODES = {"silverwater","marsden","oran"}` are hardcoded constants — this only works for one specific academy today (see AUTH-GAP-014).
- **Order of checks:** 403 invalid code → (skip if `validateOnly`) → 400 missing/invalid fields (in field order: name, email, phone, ageGroup, bowlingStyle) → 500 no service key → 500 academy lookup failure → 500 insert failure → 500 academy roster-update failure → 200.
- **Dependencies:** `freeSessionsLimit()` (`web/lib/server-plans.ts`) for the new player's `sub_sessions_limit`.
- **Status:** IMPLEMENTED (NEW)

### AUTH-044 — NEW: POST /api/public-register-player — complete a pre-entered ("pending") player
- **Category:** Functional / Data / API
- **Description:** When a coach has pre-entered a roster of player names ahead of time (a `players` row with no `email` yet, tagged with a `registration_code`), a parent can pick their child from a list and fill in the rest, updating that same row instead of creating a duplicate.
- **Source:** `web/app/api/public-register-player/route.ts` `POST()` lines 104-121
- **Inputs:** `playerId` (in addition to the fields in AUTH-043)
- **Validation:** The target `playerId` must exist **and** carry the exact same `registration_code` as the code just entered (404 otherwise) — "scoped to this same code so a parent can't complete an arbitrary player id just by guessing one."
- **Outputs:** `{ success: true }`; updates `name`, `email`, `phone`, `bowling_style`, `age_group`, `club` on the existing row (does not touch `guardian_consent_status`/subscription fields, since those were already set when the row was pre-entered).
- **UI:** `web/app/register/page.tsx` lines 175-215 (`selectedPlayerId === null` → "Find your child" list screen; `pickPending()`/`registerFresh()`)
- **Status:** IMPLEMENTED (NEW)

### AUTH-045 — NEW: GET /api/public-register-player — registered + pending list (code-scoped)
- **Category:** Data / API
- **Description:** Once a code is entered, shows "N players registered so far" (name + age group only) and, separately, the pre-entered "pending" roster (AUTH-044) for that same code.
- **Source:** `web/app/api/public-register-player/route.ts` `GET()` lines 29-56
- **Outputs:** `{ players: [{name, ageGroup}], pending: [{id, name}] }` — completed rows are those with a non-empty `email`; pending rows are those without one.
- **Validation:** 403 if code missing/invalid (same allowlist as AUTH-043).
- **Business rules:** Scoped strictly to players sharing the **same** `registration_code` as the one just entered — "someone with the 'marsden' code shouldn't see who registered under 'silverwater'/'oran'." Never exposes email/phone, matching the privacy stance of `lookup-player` (AUTH-017).
- **Status:** IMPLEMENTED (NEW)

### AUTH-046 — NEW: POST /api/complete-signup — server-side app_metadata assignment
- **Category:** Security-Authorization / API
- **Description:** The single place a brand-new self-serve account's `role`/`approved`/scope fields get decided, run by the client immediately after `supabase.auth.signUp()` returns. This is the concrete replacement for the old client-side "write role into `user_metadata` at signup time" behavior (AUTH-011).
- **Source:** `web/app/api/complete-signup/route.ts` (123 lines, entirely new)
- **Inputs:** `userId`, `name`, `email`, `role`, optional `playerLookupEmail`, `academyName`, `academyLocation`
- **Validation:** All of `userId`/`name`/`email`/`role` required (400); `role` must be one of `SELF_SERVE_ROLES = ["academy_admin","coach","player","parent"]` (400) — `platform_admin` structurally cannot be granted through this route.
- **Business rules:** Verifies the account actually exists and its email matches the claim (`auth.admin.getUserById(userId)`, 400 on mismatch) before touching anything — "guards against a forged userId pointing at some other account."
- **Order of checks:** 400 missing fields → 400 invalid role → 500 no service key → 400 signup-verification failure (userId/email mismatch) → 409 already has a role (AUTH-049) → role-specific branch (player/parent: AUTH-047; academy_admin: AUTH-048; else: queue as before).
- **Status:** IMPLEMENTED (NEW)

### AUTH-047 — NEW: complete-signup — player/parent auto-approval + multi-sibling linking
- **Category:** Business Rule / API — **the most significant new product behavior in this domain**
- **Description:** A `player`/`parent` self-signup **auto-approves immediately** (`approved:true`, no admin review) once the submitted `playerLookupEmail` resolves to at least one existing `players` row — and links **every** matching row (not just the first) into `linkedIdentities`, so a parent with two children on file at the same email gets both linked in one signup.
- **Source:** `web/app/api/complete-signup/route.ts` lines 55-81:
  ```ts
  const { data: playerMatches } = await supabase.from("players").select("id").ilike("email", playerLookupEmail);
  if (!playerMatches || playerMatches.length === 0) return NextResponse.json({ error: `No player found with email ${playerLookupEmail}. Add the player first, then sign up.` }, { status: 400 });
  const appMetadata: Record<string, unknown> = { role, approved: true, player_id: playerMatches[0].id };
  if (playerMatches.length > 1) appMetadata.linkedIdentities = playerMatches.map((p) => ({ role, playerId: p.id }));
  const { error } = await supabase.auth.admin.updateUserById(userId, { app_metadata: appMetadata });
  ...
  return NextResponse.json({ success: true, approved: true });
  ```
- **Before:** every self-signup, regardless of role, was queued `approved:false` in `user_requests` for platform-admin review — there was no auto-approval path at all.
- **Outputs surfaced in UI:** `web/app/signup/page.tsx`'s "done" screen shows a distinct "You're all set" message ("Your player record was already on file, so there's no admin review for this account") instead of the generic "Request submitted / pending approval" copy.
- **Validation:** 400 if `playerLookupEmail` missing; 400 if it resolves to zero players ("Add the player first, then sign up.").
- **Status:** IMPLEMENTED (NEW — flagged for validation of the underlying assumption that "player already exists in our DB" is a sufficient substitute for identity verification; see AUTH-GAP-015)

### AUTH-048 — NEW: complete-signup — duplicate-academy-name guard
- **Category:** Validation / Business Rule / API
- **Description:** A fresh `academy_admin` signup is rejected (409) if an academy with the same name (case-insensitive) already exists, instead of silently queuing a confusing duplicate.
- **Source:** `web/app/api/complete-signup/route.ts` lines 87-96:
  ```ts
  if (role === "academy_admin" && academyName?.trim()) {
    const { data: existingAcademy } = await supabase.from("academies").select("id").ilike("name", academyName.trim()).limit(1);
    if (existingAcademy && existingAcademy.length > 0) {
      return NextResponse.json({ error: `An academy named "${academyName.trim()}" already exists. If this is your academy, ask its existing admin to add you instead of signing up again.` }, { status: 409 });
    }
  }
  ```
- **Status:** IMPLEMENTED (NEW)

### AUTH-049 — NEW: complete-signup — re-run idempotency backstop (409)
- **Category:** Security-Authorization / API
- **Description:** Refuses to touch an account that already has `app_metadata.role` set, rather than blindly overwriting it — the actual backstop against a known Supabase quirk (a repeat `signUp()` call against an unconfirmed email silently returns the *same* user id instead of erroring).
- **Source:** `web/app/api/complete-signup/route.ts` lines 44-53: `if (userData.user.app_metadata?.role) return NextResponse.json({ error: "This email already has an account. Sign in instead, or use 'request an additional role' from your account settings." }, { status: 409 });`
- **Business rules:** Explicit in-code rationale: without this, a second signup attempt for the same unconfirmed email could reach this route and "blindly overwrite `app_metadata`, silently wiping out whatever role/approval/academy_id the first signup already established" — even though `check-existing-account` + `request-additional-role` are supposed to catch this earlier in the normal flow.
- **Status:** IMPLEMENTED (NEW)

### AUTH-050 — NEW: POST /api/players/linked-names — role-switcher display names
- **Category:** Data / Security-Authorization / API
- **Description:** Resolves real player names (+ academy name) for the NavBar role switcher (AUTH-031), since RLS only lets a player/parent read their currently-*active* player row, not every linked one.
- **Source:** `web/app/api/players/linked-names/route.ts` (new file, discovered via `NavBar.tsx`'s dependency, not in the originally-listed file set but squarely in this domain)
- **Inputs:** `playerIds: string[]`
- **Validation:** 400 if `playerIds` missing/empty; 401 if not signed in.
- **Business rules:** The requested ids are filtered down to only those already present in the caller's **own** `linkedIdentities`/`player_id` (`app_metadata`) before any DB lookup — "never an arbitrary id a client might pass in." IDs outside that set are silently dropped, not errored.
- **Outputs:** `{ players: [{ id, name, academyName }] }` for the allowed subset only (empty array short-circuits before any service-role query).
- **Status:** IMPLEMENTED (NEW)

### AUTH-051 — NEW (cross-cutting): security-sensitive identity fields relocated to server-only app_metadata
- **Category:** Security-Authorization — **the single most consequential change in this domain this merge**
- **Description:** `role`, `approved`, `academy_id`, `coach_id`, `player_id`, and `linkedIdentities` now live exclusively on Supabase's `app_metadata` (writable only via the Admin API using the service-role key) rather than `user_metadata` (writable by any signed-in client via `supabase.auth.updateUser()`). `user_metadata` is now used only for the display-only `name`.
- **Source:** Confirmed in every file re-read for this domain: `web/lib/auth.tsx` lines 31-49 (client hydration, AUTH-039) and 136-159 (signup, AUTH-011); `web/lib/server-auth.ts` lines 21-29 (`getCaller()`, AUTH-035); `web/lib/supabase-server.ts` lines 42, 46, 52 (`canAccessPlayerServer()`, AUTH-037), 79 (`getViewerRoleServer()`); `web/app/api/complete-signup/route.ts` (AUTH-046); `web/app/api/approve-user/route.ts` line 32 and every `updateUserById` call in it; `web/app/api/reject-user/route.ts` line 19; `web/app/api/pending-approvals/route.ts` line 16; `web/app/api/reactivate-player/route.ts` line 17; `web/app/api/invite-coach/route.ts` line 44-46; `web/app/api/switch-role/route.ts` lines 26, 47-55; `web/app/api/confirm-consent/route.ts` lines 17-18; `web/app/api/players/linked-names/route.ts` line 33; `web/app/api/request-additional-role/route.ts` line 41.
- **Business rules:** Explicit in-code security rationale appears in at least two places verbatim: `web/lib/auth.tsx` ("Security-sensitive fields... live in app_metadata — server-only, never client-writable") and `web/app/api/invite-coach/route.ts` ("`data` option only ever writes to `user_metadata`... never `app_metadata`... `data` here is display-only").
- **Security impact:** This closes a real privilege-escalation surface that existed before this merge — under the old scheme, `role` (and every scope id) lived in `user_metadata`, which any authenticated client could, in principle, overwrite for their own account via a direct `supabase.auth.updateUser({ data: {...} })` call, without ever touching a server route. That is no longer structurally possible: every write to these fields now requires the service-role key, held only server-side.
- **What did NOT change:** No privileged route was found to additionally check `approved` before acting — the pre-existing gap where an unapproved-but-role-bearing `academy_admin`/`coach` account can still call role-gated routes (e.g. `invite-coach`) survives this migration unchanged (see AUTH-GAP-001, carried forward).
- **Status:** IMPLEMENTED (NEW — documented here as its own requirement because of its cross-cutting importance, even though no single file's diff is "this requirement")

### AUTH-052 — NEW: Login — unconfirmed-email detection + resend-confirmation flow
- **Category:** Functional / UX
- **Description:** A login attempt against an email that hasn't confirmed yet surfaces a distinct, actionable message and a "Resend confirmation email" action, instead of the generic wrong-credentials message.
- **Source:** `web/lib/auth.tsx` lines 70-79 (`if (error.message.toLowerCase().includes("email not confirmed")) return "EMAIL_NOT_CONFIRMED";`), lines 162-165 (`resendConfirmation()`: `supabase.auth.resend({ type: "signup", email })`); `web/app/login/page.tsx` lines 44-65 (`emailUnconfirmed`/`resending`/`resent`/`resendError` state, `handleResend()`)
- **Business rules (in-code comment):** "a just-signed-up user who hasn't confirmed yet (or whose confirmation link was consumed by an email-scanning bot before they clicked it) needs a way to get a fresh link, not a message that reads like their password is wrong."
- **Error handling:** Resend failures show inline (`resendError`); success shows "✓ Confirmation email sent" and disables the button.
- **Status:** IMPLEMENTED (NEW — absent from the prior analysis entirely)

### AUTH-053 — NEW: Signup — live "email already has an account" warning
- **Category:** Validation / UX
- **Description:** As the visitor types into the account-email field (not the player-lookup email field, which already had this pattern per AUTH-016), a 500ms-debounced call to `/api/check-existing-account` shows an inline amber warning if the email is already in use, before submission.
- **Source:** `web/app/signup/page.tsx` lines 63-86 (`emailCheck`/`emailCheckForCurrent`), lines 304-311 (warning UI: "This email already has a CRIC HQ account. If it's yours, sign in instead — submitting this form will queue a request to link a &lt;role&gt; role to it rather than create a new account.")
- **Business rules:** Purely advisory — does not block submission; the actual branching still happens server-side via the existing `check-existing-account` → `request-additional-role` path (AUTH-010) at submit time.
- **Status:** IMPLEMENTED (NEW)

### AUTH-054 — (see AUTH-024) approve-user auto-creates a coaches row for an independent coach
- Folded into AUTH-024 above (kept as a cross-reference so this specific sub-behavior is independently searchable). See AUTH-024 for the full before/after.
- **Status:** IMPLEMENTED (NEW sub-behavior of AUTH-024)

### AUTH-055 — (see AUTH-025) per-(role,playerId) dedup for player/parent linked identities
- Folded into AUTH-025 above. See AUTH-025 for the full before/after.
- **Status:** IMPLEMENTED (NEW sub-behavior of AUTH-025)

---

## 3. Business Rules (Consolidated Decision Logic)

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

## 4. Key Workflows (Decision Logic)

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

## 5. Requirement-to-Code Traceability

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

## 6. Test Cases

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

## 7. Test Case Tags

**TEST_TYPE:** `E2E` | `Integration` | `Component` | `Unit` | `Security`
**PRIORITY:** `P0` (blocking/security-critical) | `P1` (core business rule) | `P2` (secondary/UX)
**AUTOMATION:** `AUTOMATED` (a currently-passing-against-old-code test exists — verify before trusting) | `AUTOMATION_CANDIDATE` (no working automated test currently confirmed against this code)
**REQUIREMENT_TYPE:** `Functional` | `Security-Authorization` | `Business Rule` | `Validation` | `Data` | `Integration` | `API` | `UX`
**RISK:** `High` (auth bypass / data leak / account takeover potential) | `Medium` (business-rule violation, no direct security exposure) | `Low` (UX/cosmetic)
**COVERAGE:** `EXISTING_TEST` (a test file exists and once targeted this behavior) | `STALE_TEST` (test file exists but its fixtures/assertions no longer match current source — see §8) | `MISSING` (no test file found at all) | `RECOMMENDED` (net-new, not previously recommended either)

---

## 8. Existing Test Coverage vs Recommended

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

## 9. Gaps and Ambiguities

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
