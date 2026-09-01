# Implemented Requirements

Reverse-engineered from the live codebase at `c:\Development\Cricket\CricApp` (Next.js 16 / React 19 app in `web/`, Supabase Auth+DB+Storage, Stripe, Anthropic Claude). Every requirement below documents **actual implemented behavior**, sourced to specific files/functions — not assumed business intent. Status labels used throughout: `IMPLEMENTED`, `PARTIALLY_IMPLEMENTED`, `INFERRED`, `UNKNOWN`, `NOT_IMPLEMENTED`, `CONFLICTING`. Requirements are grouped by domain, each with its own ID prefix (AUTH-, PLAYER-, MKT-, ADMIN-, PORTAL-, PAY-).

See [`architecture.md`](./architecture.md) for the system overview and [`gaps.md`](./gaps.md) for cross-domain ambiguities.

---

## AUTH — Auth & RBAC — Authentication, Sessions, Account Lifecycle

*Source: [`domains/auth.md`](./domains/auth.md)*


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


---

## PLAYER — Player — Players, Sessions, Video/Pose Pipeline, Reports, Performance

*Source: [`domains/player.md`](./domains/player.md)*


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


---

## MKT — Marketplace — Coach Discovery, Bookings, Session Packs, B2C Stripe Commerce

*Source: [`domains/marketplace.md`](./domains/marketplace.md)*


### MKT-001 — Player Pro subscription checkout
- **Category:** Functional / API / Integration
- **Description:** Creates a Stripe Checkout session (`mode: "subscription"`) for a player. Price is read from the `plans` table (`player-pro` or `coach-pro` slug) and resolved through `resolvePlanPrice()` against the player's own `currency`.
- **Component:** `web/app/api/stripe/create-checkout-session/route.ts`
- **Inputs:** `{ playerId, plan }`. `plan` validated via `isPaidPlan()` against `["Player Pro", "Coach Pro"]` (unchanged set — see MKT-040 below for why this is now a latent inconsistency).
- **Authorization:** Caller identified via `user.app_metadata` (CHANGED from `user_metadata`). 401 if not signed in. If caller role is `player`/`parent`, 403 unless `app_metadata.player_id === playerId`. Non-player/parent roles pass through unchecked (same asymmetry as before — MKT-GAP-02 still applies).
- **Business rules:** Creates a Stripe Customer on first purchase, persists `stripe_customer_id`. `metadata`/`subscription_data.metadata`/`client_reference_id` carry `{ player_id, plan }`. Checkout line item currency/amount now comes from `resolvePlanPrice(planRow.price_aud, planRow.prices_by_currency, player.currency)` rather than a flat AUD amount (CHANGED).
- **Error handling:** 500 if `plans` row missing; 404 if player not found; 502 on Stripe API failure.
- **Status:** IMPLEMENTED

### MKT-002 — Stripe Billing Portal session creation
- **Category:** Functional / API / Integration
- **Component:** `web/app/api/stripe/create-portal-session/route.ts`
- **Change from prior analysis:** Authorization now reads `app_metadata` (CHANGED); business logic otherwise identical — still requires an existing `stripe_customer_id` (400 if absent), still does **not** wrap `stripe.billingPortal.sessions.create(...)` in try/catch (confirmed by direct source read this pass — the same unguarded-call shape as MKT-008's confirmed defect).
- **Status:** IMPLEMENTED (PARTIALLY — same unverified Stripe-failure-path gap as before, MKT-GAP-06)

### MKT-003 — Session-pack purchase checkout (Stripe Connect destination charge)
- **Category:** Functional / API / Business Rule / Integration / Security-Authorization
- **Component:** `web/app/api/stripe/create-pack-checkout-session/route.ts`
- **Change from prior analysis:** Checkout `currency` is now the **academy's own `currency`** (`isSupportedCurrency(academy.currency) ? academy.currency : DEFAULT_CURRENCY`), not hardcoded AUD (CHANGED — code comment: "Same currency as the academy's Connect payout account — a transfer requires the charge and destination currencies to match"). Authorization now via `app_metadata` (CHANGED). Payout-destination resolution (head-coach vs. split-by-coach with silent fallback) and 10%-default platform fee are otherwise unchanged from the prior analysis.
- **Status:** IMPLEMENTED

### MKT-004 — One-off booking payment checkout (Stripe Connect destination charge)
- **Category:** Functional / API / Business Rule / Integration / Security-Authorization
- **Component:** `web/app/api/stripe/create-booking-checkout-session/route.ts`
- **Change from prior analysis:** Same academy-currency change as MKT-003, same `app_metadata` migration. Payout-destination logic (split pays the booked coach directly and hard-fails if not onboarded; head_coach pays the academy head coach) is unchanged.
- **Status:** IMPLEMENTED

### MKT-005 — One-time AI-assessment credit checkout
- **Category:** Functional / API / Integration
- **Component:** `web/app/api/stripe/create-assessment-checkout-session/route.ts`
- **Change from prior analysis:** Price now resolved via `resolvePlanPrice(plan.price_aud, plan.prices_by_currency, player.currency)` instead of flat AUD (CHANGED). `app_metadata` migration.
- **Status:** IMPLEMENTED

### MKT-006 — Content-library subscription checkout
- **Category:** Functional / API / Integration
- **Component:** `web/app/api/stripe/create-library-checkout-session/route.ts`
- **Change from prior analysis:** Same `resolvePlanPrice`/currency change, same `app_metadata` migration.
- **Status:** IMPLEMENTED

### MKT-007 — Stripe Connect Express onboarding (coach payouts)
- **Category:** Functional / API / Integration / Security-Authorization
- **Component:** `web/app/api/stripe/connect/onboard/route.ts`
- **Change from prior analysis:** `stripe.accounts.create()` now passes an explicit **`country`** — resolved from the coach's academy's `country` (defaulting to `"AU"` for an unaffiliated coach) — because "the connected account's payout currency is tied to its country and can't be changed later" (code comment). This is a genuinely new parameter versus the prior analysis's read of this route (CHANGED). Authorization logic (`app_metadata`-based; coach restricted to own id; `platform_admin`/`academy_admin` allowed) is otherwise the same shape.
- **Previously-confirmed defect status:** The prior analysis cited `connect/onboard.test.ts` asserting a hard 502 for any new coach because this Stripe test account rejected Express account creation entirely. **Not independently re-verified this pass** (test assertions are unreliable evidence right now per the `rawUser()`/`app_metadata` mismatch documented above, and this pass did not execute live Stripe calls). Whether the new `country` parameter changes that outcome is **REQUIRES VALIDATION**.
- **Status:** PARTIALLY_IMPLEMENTED (code path complete and correctly authorized; live Stripe-account capability REQUIRES VALIDATION)

### MKT-008 — Stripe Connect Express dashboard login-link
- **Category:** Functional / API / Integration / Security-Authorization
- **Component:** `web/app/api/stripe/connect/login-link/route.ts`
- **Confirmed by direct source read this pass:** `stripe.accounts.createLoginLink(coach.stripe_connect_account_id)` (line 49) is still called with **no try/catch**, unlike every sibling Stripe route in this file and domain — a Stripe-side rejection still becomes an unhandled exception/raw 500 rather than the app's structured `{ error }` JSON. `app_metadata` migration applied to the authorization check.
- **Status:** PARTIALLY_IMPLEMENTED (functional happy path; confirmed-by-source-read unhandled-exception defect persists, MKT-GAP-03)

### MKT-009 — Marketplace visibility gate (Free-plan paywall)
- **Category:** Business Rule / Functional / Security-Authorization
- **Description:** `Find a Coach` is gated behind `canUseMarketplace(player.subscription.plan, plans)`.
- **Component:** `web/lib/plan-features.ts:canUseMarketplace`, enforced in `web/components/FindCoachClient.tsx`.
- **CHANGED — no longer a fixed rank comparison:** `canUseMarketplace(tier, plans)` now does `findPlayerTierPlan(tier, plans)?.marketplaceEnabled ?? tier !== "Free"` — it looks up the tier's Plan Catalog row (`slug: free/player-pro/coach-pro`) and reads its admin-editable `marketplaceEnabled` boolean, falling back to "true for any non-Free tier" only if that row is missing. This means a platform admin can now, e.g., turn marketplace access off for Player Pro or on for Free entirely from `/admin/plans`, with no code change — a materially different (and more powerful) gating mechanism than the old hardcoded `PLAN_RANK[plan] >= 1`.
- **Security note (unchanged):** Still a **client-side, render-only gate** — confirmed this pass that `upsertBooking()` (`web/lib/db.ts`) is still a bare, unguarded `sb.from("bookings").upsert(b)` with no server-side plan-tier check. MKT-GAP-07 (server-side marketplace-bypass risk) persists unchanged.
- **Status:** IMPLEMENTED (client-side); server-side enforcement UNKNOWN

### MKT-010 — Coach discovery / search / filtering (Find a Coach)
- **Category:** Functional / Business Rule
- **Component:** `web/components/FindCoachClient.tsx`
- **Confirmed unchanged this pass** (full file re-read): same-academy-only filter for an academy-assigned player (`coach.academyId === myAcademy.id`), same free-text/age-group/geocoded-radius filtering, same distance sort. The prior analysis's MKT-GAP-08 (paywall copy promises "coaches beyond your own academy assignment" but the filter does the opposite for the common case) still applies verbatim — confirmed present in the current copy (line 95) and filter (line 104).
- **Status:** IMPLEMENTED (with the same cross-academy-visibility discrepancy)

### MKT-011 — Marketplace booking request (player → coach)
- **Category:** Functional / Business Rule
- **Component:** `FindCoachClient.tsx:RequestBookingModal`
- **Confirmed unchanged this pass:** `durationMins` hardcoded 60, fee via `getSessionFee(coach, academies, type, plans)`, `status: "Pending"` always, `source: "marketplace"` stamped. Fee display now currency-aware (`formatMoney(fee, academy?.currency ?? DEFAULT_CURRENCY)`, CHANGED cosmetically).
- **New gap this pass:** Unlike a staff-created booking (`BookingsClient.tsx:handleSave`, MKT-012/MKT-032), a marketplace booking request created here **never calls `/api/bookings/notify-created`** — the coach receives no automatic email/SMS confirmation that a new marketplace request landed on their schedule; they only find out by visiting Bookings. See MKT-GAP-23.
- **Status:** IMPLEMENTED

### MKT-012 — Booking creation (staff-side)
- **Category:** Functional / Validation
- **Component:** `web/components/BookingsClient.tsx:handleSave`
- **Confirmed unchanged this pass** for the core rules: fee auto-fill/override, waived-fee academies force `$0` and disable the input, pack-drawn bookings force `paymentStatus: "Paid"`, coach dropdown restricted to `Active` coaches and pre-filled/disabled for a `coach` caller.
- **NEW behavior:** On a brand-new booking (not an edit), `handleSave` now also fires a best-effort, fire-and-forget `POST /api/bookings/notify-created` (see MKT-032) — a failed send never blocks or rolls back the booking save.
- **Status:** IMPLEMENTED

### MKT-013 — Booking status lifecycle
- **Category:** Business Rule / State Machine
- **Confirmed unchanged this pass.** States, quick-action transitions, and the "only `api/bookings/complete` has server-side enforcement" observation all still hold.
- **Status:** IMPLEMENTED

### MKT-014 — Booking completion (session logging + XP + pack draw-down)
- **Category:** Functional / API / Business Rule / Security-Authorization
- **Component:** `web/app/api/bookings/complete/route.ts`
- **Confirmed byte-for-byte unchanged this pass** against the prior analysis: same validation order, same `xp += 50` / `sessions_count += 1` / `sub_sessions_used` pack-skip rule, same non-atomic fetch-then-write pack draw-down (MKT-GAP-09 persists), same `callerCanAccessPlayer()`-based authorization (now reading `app_metadata` inside `getCaller()`, CHANGED transitively).
- **Status:** IMPLEMENTED

### MKT-015 — "Credit to Pack" on a cancelled booking (BookingsClient) — confirmed-unfixed defect
- **Category:** Functional / Business Rule — **CONFIRMED DEFECT, STILL PRESENT**
- **Component:** `web/components/BookingsClient.tsx`, `BookingCard`, line ~942 (confirmed by direct source read this pass).
- **Description:** The "Credit to Pack" button still calls `updatePackPaymentStatus(activePack.id, activePack.paymentStatus)` — a no-op write of the pack's own current, unchanged payment status — and never increments `sessionCredits`, while still showing a "✓ Session credited" success state. The correct implementation continues to exist only on the Session Packs page (`SessionPacksClient.tsx:handleCredit`, confirmed this pass at line 417-425, which correctly does `sessionCredits: pk.sessionCredits + 1` via `upsertSessionPack`).
- **Status:** NOT_IMPLEMENTED — this merge did not touch or fix this defect. HIGH risk, unchanged from prior analysis (MKT-GAP-10).

### MKT-016 — Session-pack purchase & pack lifecycle (staff-created)
- **Category:** Functional / Validation / Business Rule
- **Component:** `web/components/SessionPacksClient.tsx:handleSave` (and the bulk-CSV import path, `handlePackCsvImport`)
- **Confirmed unchanged this pass:** required `playerId`/`academyId`, `feePerSession > 0` unless waived, `agreedDays.length > 0`, waived-fee packs immediately `paymentStatus: "Paid"`, `canAddPack = user?.role !== "coach"`.
- **Status:** IMPLEMENTED

### MKT-017 — Session-pack draw-down accounting
- **Category:** Business Rule / Data
- **Component:** `web/lib/utils.ts` — `getSessionFee`, `packPaceWeeks`, `packCreditExpiryDate`, `isPackCreditExpired`
- **Confirmed unchanged this pass** (full file re-read, function bodies identical to prior analysis).
- **Status:** IMPLEMENTED

### MKT-018 — Pack payment status tracking & "Fees Due" tab
- **Category:** Functional / Business Rule
- **Component:** `SessionPacksClient.tsx`, `pageTab === "Fees Due"`
- **Confirmed unchanged this pass** for the core tab logic. `MarkPaidButton`/`handleMarkPaid` now additionally triggers the new fee-due ledger flow — see MKT-035.
- **Minor new observation:** `handleMarkPaid` calls `markPackPaid(packId, paidDate)` **without `await`** (line 135) — unlike `BookingsClient.tsx`'s equivalent `handleMarkPaid`, which does `await markBookingPaid(...)`. The local state update (`setPacks(...)`) proceeds immediately regardless, so the UI is optimistic either way; a failed `markPackPaid` write would surface no error to the user. Minor inconsistency, not independently confirmed as user-visible.
- **Status:** IMPLEMENTED

### MKT-019 — Coach directory / roster management
- **Category:** Functional / Validation / Business Rule
- **Component:** `web/components/CoachesClient.tsx`
- **Confirmed unchanged this pass:** coach deletion guard (sole-head-coach block, reassignment modal), `marketplaceVisible`/`available`/`status` independence, fire-and-forget geocoding, email-uniqueness validation, `academyId` required on the staff "New/Edit Coach" form.
- **NEW business rule (this merge):** For an independent coach (`!editingCoach?.academyId`) editing their **own** profile (`user?.role === "coach" && user.coachId === editingId`), the `marketplaceVisible` checkbox is now **locked off** (`marketplaceLocked`) unless `editingCoach.subPlan === "Coach Pro"` — an inline note reads "Requires Coach Pro. [Upgrade](/coach/subscription) to become discoverable and get booked by players." Staff (who can also reach this form for any coach) are **not** subject to this lock — only a coach editing their own record. See MKT-026.
- **NEW UI section:** A "Your plan" panel (visible only to `user.role === "coach"` viewing their own, academy-less coach card) shows `Free`/`✓ Coach Pro` and a "Manage plan"/"Upgrade" link to `/coach/subscription`.
- **Status:** IMPLEMENTED

### MKT-020 — Fee/platform-fee calculation helpers
- **Category:** Business Rule / Data
- **Component:** `web/lib/utils.ts` — `getSessionFee`, `getPlatformFeePercent`
- **Confirmed unchanged this pass**, including the same client/server duplication caveat (MKT-GAP-11) — the checkout routes and the new fee-tracking routes (`record-fee-due`) each re-implement the identical `academy.plan_id → plans.platform_fee_percent ?? 10` lookup independently rather than sharing code.
- **Status:** IMPLEMENTED

### MKT-021 — Dead/orphaned local-storage payment & credit stores
- **Category:** Data — **Not wired to any UI**
- **Component:** `web/lib/payment-store.ts`, `web/lib/credits-store.ts`
- **Confirmed unchanged this pass** (both files re-read in full, byte-for-byte identical to the prior analysis; still zero import sites found).
- **Status:** NOT_IMPLEMENTED / dead code (MKT-GAP-12)

---

### MKT-022 — Coach Pro subscription checkout (NEW)
- **Category:** Functional / API / Integration / Security-Authorization
- **Description:** A coach's own paid subscription — separate from any academy's org billing and from a player's Free/Player Pro — priced from the same `coach-pro` Plan Catalog row the player-facing route used to also offer (Coach Pro is now conceptually "repurposed to be coach-only," per an in-code comment).
- **Component:** `web/app/api/stripe/create-coach-checkout-session/route.ts`
- **Inputs:** `{ coachId }` only — no `plan` parameter, since there is exactly one paid coach tier.
- **Authorization:** `app_metadata`-based; `role === "platform_admin"` or (`role === "coach" && ownCoachId === coachId`); 403 "You can only manage your own subscription" otherwise. 401 if not signed in.
- **Business rules:** Creates a Stripe Customer on first purchase and persists it on the `coaches` row (not `players`). Price resolved via `resolvePlanPrice(planRow.price_aud, planRow.prices_by_currency, coach.currency)`. `metadata`/`subscription_data.metadata`: `{ coach_id, type: "coach_subscription" }` — the webhook's handoff key (confirmed present in `web/app/api/stripe/webhook/route.ts` for both `checkout.session.completed` and subscription update/delete events, out of this domain).
- **Error handling:** 500 if plan row missing; 404 if coach not found; 502 on Stripe failure.
- **Status:** IMPLEMENTED

### MKT-023 — Coach Pro billing portal (NEW)
- **Category:** Functional / API / Integration
- **Component:** `web/app/api/stripe/create-coach-portal-session/route.ts`
- **Description:** Same shape as `create-portal-session` but for a coach's own `stripe_customer_id`. 400 "No billing account yet" if absent. Same authorization pattern as MKT-022.
- **Error handling gap (confirmed by direct source read):** `stripe.billingPortal.sessions.create(...)` (line 44) is **not** wrapped in try/catch — same unguarded shape as MKT-002/MKT-008.
- **Status:** IMPLEMENTED (PARTIALLY — same unverified Stripe-failure-path gap)

### MKT-024 — Coach subscription management UI (NEW)
- **Category:** Functional / UI
- **Component:** `web/components/CoachSubscriptionClient.tsx` (fetches the caller's own `Coach` row via `user.coachId`), `web/components/CoachSubscriptionPage.tsx` (plan cards, checkout/portal triggers, invoice history), `web/app/(dashboard)/coach/subscription/page.tsx` (trivial wrapper).
- **Business rules:** Plan cards built from `coachPlanFeatureLines(tier, plans)` for `"Free"`/`"Coach Pro"` (slugs `coach-free`/`coach-pro` — deliberately separate Plan Catalog rows from the player's `free`/`player-pro`, per an in-code comment: "an admin tightening the player Free tier's session cap shouldn't silently also change what an independent coach's Free roster cap is"). "Subscribe" disabled until a different plan than the current one is selected and the selection is a paid plan (`isPaidPlan`). Once `subscriptionStatus` is `active`/`trialing`, the only action offered is "Manage Billing" (portal), matching the player-side `SubscriptionPage` pattern.
- **Reuses `InvoiceHistoryList` with `scope="coach"`** — the invoice-history route (`api/stripe/invoices`, out of this domain) was extended to support a coach scope alongside player/academy.
- **Status:** IMPLEMENTED

### MKT-025 — Coach-tier plan-feature gating functions (NEW)
- **Category:** Business Rule / Data
- **Component:** `web/lib/plan-features.ts` — `canUseMarketplaceForCoach`, `canGenerateAiReportsForCoach`, `rosterCapForCoachPlan`, `coachPlanFeatureLines`
- **Business rules (verified):**
  - `canUseMarketplaceForCoach(tier, plans)`: `findCoachTierPlan(tier, plans)?.marketplaceEnabled ?? tier !== "Free"` — same admin-Plan-Catalog-driven pattern as the player-side `canUseMarketplace`, but reads `coach-free`/`coach-pro` rows.
  - `rosterCapForCoachPlan(tier, plans)`: an independent coach's own roster size cap — reuses the org-plan `seatCap` field; defaults `5` for Free, `null` (unlimited) for Coach Pro if the row is missing. **Confirmed enforced** in `web/components/PlayersClient.tsx` (`atRosterCap = rosterCap !== null && players.length >= rosterCap`, gating an independent coach's "Add Player" action) — this is the concrete, currently-wired consequence of Coach Pro for roster size.
  - `canGenerateAiReportsForCoach(tier, plans)`: same pattern for AI report generation — documented in `plan-features.ts` as gating "AI biomechanics reports for your players," but the actual enforcement call site was not read in this pass (out of this domain's file list) — INFERRED from the doc comment and the shared pattern with the confirmed player-side/roster-cap equivalents.
- **Status:** IMPLEMENTED (marketplace + roster cap confirmed wired; AI-report gate INFERRED, cross-domain)

### MKT-026 — Marketplace visibility gated behind Coach Pro for independent coaches (NEW)
- **Category:** Business Rule / Security-Authorization
- **Component:** `web/components/CoachesClient.tsx` (`marketplaceLocked`, confirmed at lines 410-415), cross-referenced with MKT-019.
- **Business rule:** An independent coach (no `academyId`) cannot turn on their own `marketplaceVisible` flag while on the Free coach tier — the checkbox is disabled and an "Upgrade" link to `/coach/subscription` is shown instead. Staff (`platform_admin`/`academy_admin`) editing any coach's record, and an academy-employed coach, are unaffected — the lock only fires for `user.role === "coach" && user.coachId === editingId && !editingCoach?.academyId`.
- **Security note:** Like MKT-009, this is a **client-side, render-only gate** — the checkbox is merely `disabled` in the React form; whether `upsertCoach()`/the underlying `coaches` table itself rejects a `marketplace_visible: true` write from a Free-tier independent coach bypassing the UI is UNKNOWN (RLS, hosted, out of this repo). See MKT-GAP-24.
- **Status:** IMPLEMENTED (client-side); server-side enforcement UNKNOWN

### MKT-027 — Referral creation (platform-admin only) (NEW)
- **Category:** Functional / API / Validation / Business Rule / Security-Authorization
- **Component:** `web/app/api/referrals/create/route.ts`
- **Authorization:** `getCaller()?.role !== "platform_admin"` → 403. No other role may create a referral.
- **Inputs:** `referrerName`, `referredName` required; `referredType` ∈ `{academy, coach, player, other}`; `commissionType` ∈ `{one_off, ongoing}`.
- **Business rules (verified):**
  - An `ongoing` commission **requires** a real linked entity (`referredAcademyId`/`referredCoachId`/`referredPlayerId`) — 400 if `referredType === "other"` with `commissionType === "ongoing"` ("there's no revenue to calculate from otherwise").
  - `one_off` requires `oneOffAmountAud > 0`; `ongoing` requires `ongoingRatePercent > 0` and a valid `ongoingRevenueSource` ∈ `{session_packs, bookings, both}`.
  - **A `one_off` referral immediately inserts a `referral_payouts` row** (`status: "pending"`, `period_label: null`) at creation time — "no monthly cron will ever create its payout the way an ongoing referral's does, so the ledger entry has to be created here" (code comment). An `ongoing` referral creates **no** payout row until the monthly cron runs (MKT-030).
  - New referral is always `status: "active"`; `created_by: caller.userId`.
- **Status:** IMPLEMENTED

### MKT-028 — Referral ending (NEW)
- **Category:** Functional / API / Security-Authorization
- **Component:** `web/app/api/referrals/end/route.ts`
- **Authorization:** `platform_admin` only.
- **Business rule:** Sets `referrals.status = "ended"`. Explicitly documented as **not retroactive** — "Ending a referral only stops future cron accrual — payouts already created stay exactly as they are, paid or not" (code comment). No way to resume an ended referral found in this route or `ReferralsClient.tsx` (one-directional).
- **Status:** IMPLEMENTED

### MKT-029 — Referral payout "mark paid" (NEW)
- **Category:** Functional / API / Security-Authorization
- **Component:** `web/app/api/referrals/mark-payout-paid/route.ts`
- **Authorization:** `platform_admin` only. Inputs `{ payoutId, paidDate }` both required.
- **Business rule:** Sets `referral_payouts.status = "paid", paid_date, paid_by: caller.userId`. Purely a manual reconciliation record — no Stripe/payment-rail integration; the actual money movement to the referrer happens off-platform (bank transfer, PayID, etc., per the `referrerPaymentDetails` free-text field captured at referral creation).
- **Status:** IMPLEMENTED

### MKT-030 — Monthly referral commission cron job (NEW)
- **Category:** Functional / API / Business Rule / Integration / Scheduled Job
- **Component:** `web/app/api/cron/referral-commissions/route.ts`; triggered by `.github/workflows/referral-commissions.yml` (`cron: '0 1 1 * *'` — once monthly, 01:00 UTC on the 1st — plus manual `workflow_dispatch`), via `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://crichq.com.au/api/cron/referral-commissions`.
- **Authorization:** `Authorization: Bearer <CRON_SECRET>` header, compared against `process.env.CRON_SECRET`; 401 on mismatch, 500 if `CRON_SECRET` isn't configured at all.
- **Business rules (verified):**
  - Computes the **previous calendar month's** window (`previousMonthRange`, UTC-based) relative to when the job runs.
  - Fetches every `referrals` row with `status: "active"` and `commission_type: "ongoing"`.
  - Skips (no payout row, `action: "skipped_ended"`) a referral whose `ongoing_end_date` is before the window start.
  - Skips (`"skipped_unlinked"`) a referral with no linked academy/coach/player.
  - Revenue is summed per the referral's `ongoing_revenue_source`:
    - `session_packs` (or `both`): `sum(total_sessions * fee_per_session)` for packs whose `purchase_date` falls in the window, filtered by the linked entity's column (`player_id`/`coach_id`/`academy_id`; for an academy, both its `player_ids` and `coach_ids` are checked).
    - `bookings` (or `both`): `sum(fee_aud)` for bookings whose `date` falls in the window, same per-entity-type column resolution (an academy sums bookings across **both** its players' and its coaches' bookings).
  - `amount = round(revenue * ongoing_rate_percent) / 100` (i.e. `revenue * rate% `, rounded to cents). Skipped (`"skipped_zero_revenue"`) if `amount <= 0`.
  - Writes one `referral_payouts` row per referral per period via `upsert(..., { onConflict: "referral_id,period_label", ignoreDuplicates: true })` — **re-running the job for an already-processed period is a safe no-op per referral** (the unique-constraint upsert prevents a duplicate payout row), but see MKT-GAP-19 for what that idempotency guarantee does *not* cover.
  - Returns a per-referral `results[]` array with `{ referralId, amount, action }` for observability — no email/Slack notification found; the workflow's own success/failure is only visible via GitHub Actions run history.
- **Status:** IMPLEMENTED

### MKT-031 — Referrals admin UI (NEW)
- **Category:** Functional / UI / Security-Authorization
- **Component:** `web/components/ReferralsClient.tsx` (463 lines), `web/app/(dashboard)/admin/referrals/page.tsx` (trivial wrapper)
- **Authorization:** Client-side redirect (`if (user && user.role !== "platform_admin") router.replace("/players")`) — same render-only pattern as other admin-only client components in this codebase; the actual data reads (`fetchReferrals`, `fetchReferralPayouts`) rely on RLS to enforce this server-side (UNKNOWN, out of this repo), and the mutating routes (MKT-027/028/029) do enforce `platform_admin` server-side independently.
- **Business rules (verified):** "New Referral" form lets an admin pick `referredType` and then a live-fetched picker of academies/coaches/players (or free-text name for `"other"`); "Ongoing" commission type is disabled in the UI when `referredType === "other"` (mirrors the server-side 400). Each referral row expands to show its payout history, a "Mark Paid" per-payout action (MKT-029), and, for an active ongoing referral, an "End this referral" action (MKT-028). **Referral commission amounts are always displayed/created in AUD** regardless of the referred entity's own currency — explicit code comment: "Referral commissions are a fixed platform payout structure..., independent of whatever currency the referred academy/player/coach happens to bill in — always AUD, not derived from the referred entity." See MKT-GAP-20 for why this is a real currency-correctness risk given the cron's revenue math.
- **Status:** IMPLEMENTED

### MKT-032 — Booking-created confirmation email/SMS (NEW)
- **Category:** Functional / API / Integration
- **Component:** `web/app/api/bookings/notify-created/route.ts`
- **Description:** Fired once, best-effort, immediately after a **new** (not edited) booking is saved from `BookingsClient.tsx:handleSave` (MKT-012). Never called from the marketplace request flow (MKT-011) — see MKT-GAP-23.
- **Authorization:** `getCaller()` + `callerCanAccessPlayer()` (role-scoped, same helper as MKT-014). 401/403/404 as appropriate.
- **Business rules:** Sends, independently and non-blocking on each other's failure:
  - An email to the **player** (if `player.email` and Gmail SMTP env vars are configured) confirming the booking, including the fee line only if `fee_aud > 0`.
  - An email to the **coach** (if `coach.email` present) notifying them of the new booking on their schedule.
  - An SMS to the player (if `player.phone` present) via `lib/sms.ts:sendSms`.
  - Returns `{ success: true, emailsSent, smsSent }` — a failed individual send is swallowed (`.catch(() => {})`) and never surfaces as a route-level error; the route always returns success once past auth/lookup.
- **Status:** IMPLEMENTED

### MKT-033 — Manual "mark booking paid" (cash/bank transfer) (NEW as a dedicated route)
- **Category:** Functional / API / Security-Authorization
- **Component:** `web/app/api/bookings/mark-paid/route.ts`
- **Authorization:** `getCaller()?.role` ∈ `{platform_admin, academy_admin, coach}` — explicitly staff-only; a player/parent must pay via `BookingPayOnlineButton` → Stripe Checkout (MKT-004) instead.
- **Business rule:** Sets `bookings.payment_status = "Paid", paid_date`. No Stripe involvement. `BookingsClient.tsx`'s `handleMarkPaid` calls this (via the pre-existing `lib/db.ts:markBookingPaid`, actually — see note) then immediately also calls `record-fee-due` (MKT-034) to log the platform's uncollected cut.
  - **Note on route vs. existing db helper:** `BookingsClient.tsx`'s actual `handleMarkPaid` calls `markBookingPaid()` from `lib/db.ts` (a direct client-side Supabase `.update()`, pre-existing) rather than this new `api/bookings/mark-paid` route — this new route exists as a **staff-authorized, server-side equivalent** but was not observed to be the one actually wired to the current Bookings UI in the files read. Its concrete caller (if any beyond direct API use) is `REQUIRES VALIDATION`.
- **Status:** IMPLEMENTED (route); UI wiring to this specific route vs. the pre-existing client-side helper REQUIRES VALIDATION

### MKT-034 — Booking platform-fee-due ledger & "Platform Fees" tab (NEW)
- **Category:** Functional / API / Business Rule / Security-Authorization
- **Components:** `web/app/api/bookings/record-fee-due/route.ts` (creates the ledger entry), `web/app/api/bookings/mark-fee-collected/route.ts` (closes it out), `BookingsClient.tsx` (`tab === "Platform Fees"`, `BookingMarkFeeCollectedButton`)
- **Description:** When a booking is paid outside Stripe, the platform's own commission is never automatically collected the way a real Checkout payment collects it (via `application_fee_amount`). This subsystem tracks what's owed as an explicit ledger row so it can be chased down/reconciled separately.
- **`record-fee-due` business rules (verified):** Any signed-in caller with `callerCanAccessPlayer()` access to the booking's player may trigger it (fired automatically by `BookingsClient.tsx:handleMarkPaid` right after `markBookingPaid`, MKT-018-parallel pattern). Resolves the academy via the booking's coach (`bookings` has no `academy_id` column of its own) — if the coach has no academy, silently `{ success: true, skipped: "no_academy" }` (no fee tracked for an unaffiliated coach's booking). `feePercent` = the academy's plan override or 10% default (same duplicated-lookup pattern as MKT-020/MKT-GAP-11). `amount = round(fee_aud * feePercent) / 100`; skipped if `<= 0`. **Upserts** with `onConflict: "booking_id", ignoreDuplicates: true` — id `bfd_{bookingId}` — so a double "Mark Paid" click/retry cannot create a duplicate ledger row for the same booking, but also means the fee % is **snapshotted at this moment and never recalculated** if the academy's plan later changes (explicit code comment).
- **`mark-fee-collected` business rules:** `platform_admin`-only. Sets `booking_fee_dues.status = "collected", collected_date, collected_by`.
- **UI:** A new "Platform Fees" tab (visible to `platform_admin`/`academy_admin`/`coach`) on the Bookings page shows pending vs. collected totals (via `sumMoneyByCurrency`, correctly currency-grouped per academy this time, unlike the referral cron — see MKT-GAP-20 contrast), and a per-due-row "Mark Collected" button visible only to `platform_admin`.
- **Status:** IMPLEMENTED

### MKT-035 — Session-pack platform-fee-due ledger (NEW)
- **Category:** Functional / API / Business Rule / Security-Authorization
- **Component:** `web/app/api/packs/record-fee-due/route.ts`
- **Description:** Direct pack-side mirror of MKT-034. `amount = round(total_sessions * fee_per_session * feePercent) / 100`. Upserts on `onConflict: "pack_id"` — id `pfd_{packId}`. Triggered from `SessionPacksClient.tsx:handleMarkPaid` right after `markPackPaid` (unawaited, per the MKT-018 minor note).
- **Status:** IMPLEMENTED

### MKT-036 — Session-pack platform-fee collection tracking & "Platform Fees" tab (NEW)
- **Category:** Functional / API / Security-Authorization
- **Component:** `web/app/api/packs/mark-fee-collected/route.ts`, `SessionPacksClient.tsx` (`pageTab === "Platform Fees"`)
- **Description:** Byte-for-byte the same shape as MKT-034's `mark-fee-collected` (`platform_admin`-only, sets `pack_fee_dues.status = "collected"`), surfaced in its own "Platform Fees" tab on the Session Packs page, alongside the pre-existing "Fees Due" tab (MKT-018, which tracks the pack's *own* payment status, a different concept from the *platform's* fee cut tracked here).
- **Status:** IMPLEMENTED

### MKT-037 — Multi-currency support across the marketplace (NEW, cross-cutting)
- **Category:** Business Rule / Data / Functional
- **Component:** `web/lib/currency.ts` (new file), consumed throughout `web/lib/types.ts` (`Coach.currency`, `Player.currency`, `Academy.currency`, `Plan.pricesByCurrency`), every checkout route (MKT-001 through MKT-006, MKT-022), the Connect destination-charge routes (MKT-003/004, which use the **academy's** currency), and every currency-aware UI surface (`BookingsClient`, `SessionPacksClient`, `FindCoachClient`, `CoachesClient`, `CoachSubscriptionPage`, `ReferralsClient`).
- **Business rules (verified):**
  - `SUPPORTED_CURRENCIES = [aud, usd, gbp, nzd, inr]`; `COUNTRY_OPTIONS` (the four Connect-eligible academy countries — AU/NZ/GB/US) each map 1:1 to a currency; **India/INR has no country option** — an academy cannot be created "in India" (Stripe Connect Express doesn't support it as a connected-account country) even though INR is a valid currency for an individual (non-Connect) player/coach purchase.
  - `resolvePlanPrice(priceAud, pricesByCurrency, preferred)`: if `preferred` is a supported non-default currency AND the plan has an override price for it, charge that; otherwise always fall back to the AUD price in AUD — **never** a currency-converted AUD amount. A plan simply not offered in a buyer's currency silently bills them in AUD instead, with no warning surfaced in any of the checkout routes read.
  - `sumMoneyByCurrency`: groups mixed-currency amounts into per-currency subtotals for display (e.g., `"A$120.00 + NZ$45.00"`) rather than summing raw numbers — used correctly by the new Platform Fees tabs (MKT-034/036) and pack/booking fee summaries.
  - An academy's `country` (and therefore `currency`) is described as locked once a Stripe Connect payout account exists for it (per `Academy.country`'s doc comment) — the enforcement site for that lock was not read in this pass (academy-settings UI, out of this domain's file list) — INFERRED.
- **Status:** IMPLEMENTED

### MKT-038 — Plan-Catalog-driven feature gating, 2-argument signature (NEW/CHANGED, cross-cutting)
- **Category:** Business Rule / Data — see the Domain Overview note above for the full description.
- **Component:** `web/lib/plan-features.ts` (entire file effectively rewritten, +108 lines)
- **The second argument, confirmed:** every gating function now takes `plans: Plan[]` — the caller's already-fetched, active Plan Catalog rows — as its second parameter, and looks up the tier's row by a fixed slug map (`PLAYER_TIER_SLUGS`/`COACH_TIER_SLUGS`) rather than any hardcoded rank. A caller passing only one argument (the historical 1-arg call shape) fails to typecheck — this is the direct cause of the `tests/unit/lib/plan-features.test.ts` "Expected 2 arguments, but got 1" failures referenced in this task's brief; not independently re-verified by running the suite, per this task's rules.
- **Full function inventory (all confirmed by direct source read):** `canGenerateAiReports(tier, plans)`, `canUseMarketplace(tier, plans)`, `sessionsLimitForPlan(tier, plans)`, `chatMessagesLimitForPlan(tier, plans)`, `isUnlimited(sessionsLimit)` (unchanged, 1-arg — not tier-based), `planFeatureLines(tier, plans)`, `canUseMarketplaceForCoach(tier, plans)`, `canGenerateAiReportsForCoach(tier, plans)`, `rosterCapForCoachPlan(tier, plans)`, `coachPlanFeatureLines(tier, plans)`.
- **Fallback semantics:** every lookup falls back to a hardcoded default (`tier !== "Free"` for booleans, `4`/`null` for the player session cap, `3`/`null` for chat messages, `5`/`null` for coach roster cap) **only if the expected Plan Catalog row is missing entirely** — i.e., the system degrades gracefully if `/admin/plans` seed data is incomplete, but an admin actively setting `marketplaceEnabled: false` on, say, `player-pro` takes full effect with no code-level override.
- **Status:** IMPLEMENTED

### MKT-039 — RBAC migration to `app_metadata` (NEW/CHANGED, cross-cutting)
- **Category:** Security-Authorization — see the Domain Overview note above.
- **Component:** Every route in this domain: `create-checkout-session`, `create-portal-session`, `create-pack-checkout-session`, `create-booking-checkout-session`, `create-assessment-checkout-session`, `create-library-checkout-session`, `connect/onboard`, `connect/login-link`, `create-coach-checkout-session`, `create-coach-portal-session`, and (via `lib/server-auth.ts:getCaller()`) `bookings/complete`, `bookings/mark-paid`, `bookings/notify-created`, `bookings/record-fee-due`, `bookings/mark-fee-collected`, `packs/record-fee-due`, `packs/mark-fee-collected`, `referrals/create`, `referrals/end`, `referrals/mark-payout-paid`.
- **Confirmed by direct source read of every one of the above files this pass:** each reads `user.app_metadata?.role` / `.academy_id` / `.coach_id` / `.player_id` (Stripe routes, inline via `createServerClient(...).auth.getUser()`) or the equivalent via `getCaller()` (booking/pack/referral routes). None read `user_metadata` anywhere in this domain's route code.
- **Status:** IMPLEMENTED

### MKT-040 — Legacy "Coach Pro for a player" checkout path still technically permitted (NEW finding — CONFLICTING)
- **Category:** Business Rule / Security-Authorization — **CONFLICTING**
- **Observed behavior:** `web/lib/stripe-client.ts:isPaidPlan` still validates against `["Player Pro", "Coach Pro"]` (unchanged), and `create-checkout-session/route.ts` still accepts `plan === "Coach Pro"` for a **playerId**, mapping it to the same `coach-pro` Plan Catalog slug the new coach-only route (MKT-022) uses, and would still create/update a **player's** `subscription.plan = "Coach Pro"` via the webhook if hit. However, the player-facing `SubscriptionPage.tsx` no longer offers "Coach Pro" as a card at all — confirmed by direct source read: `buildPlanCards` explicitly iterates only `["Free", "Player Pro"] as const`, with the comment "Coach Pro used to be offered here too, but it's now a coach's own plan... a player only ever chooses between Free and Player Pro."
- **Why it's ambiguous:** Either this is simply dead/unreachable server-side surface area now that no UI ever sends `plan: "Coach Pro"` with a `playerId` (harmless, low-risk), or it's a genuine latent authorization/business-logic gap — a technically-savvy player could still call `create-checkout-session` directly with `plan: "Coach Pro"` and end up with a `Player.subscription.plan` value the rest of the player-facing app (`plan-features.ts`'s `PLAYER_TIER_SLUGS`, which does include a `"Coach Pro": "coach-pro"` mapping) was arguably never meant to see on a player row now that Coach Pro is coach-only conceptually.
- **Status:** REQUIRES VALIDATION — see MKT-GAP-14.

### MKT-041 — Independent coach creation via self-serve signup approval (NEW, supporting finding)
- **Category:** Functional / Business Rule
- **Component:** `web/app/api/approve-user/route.ts` (confirmed via targeted grep: inserts a `coaches` row with `academy_id: null, marketplace_visible: false` when approving a self-serve coach signup with no academy link)
- **Description:** This is the creation path that produces the "independent coach" (no `academyId`) that MKT-022 through MKT-026 (Coach Pro subscription, marketplace-visibility gating, roster cap) are all specifically written around — as distinct from a coach created by academy staff via `CoachesClient.tsx`, which always requires an `academyId` (MKT-019's "Academy *" required field). Not fully read in this pass (out of this domain's file list); cited here only to establish where the "independent coach" concept this domain's new subsystems assume actually originates.
- **Status:** INFERRED (creation path confirmed to exist; full route logic not read this pass)

---


---

## ADMIN — Academy & Platform Admin — Org Management, B2B Billing, Admin Surfaces

*Source: [`domains/academy_admin.md`](./domains/academy_admin.md)*


### ADMIN-001 — Academy CRUD (create, edit, activate/deactivate)
- **Category:** Academy management
- **Description:** `platform_admin` can create a new academy, edit any academy's core fields (name,
  description, location, phone, country, start date, stage, status), and toggle Active/Inactive via a
  3-dot menu with a confirmation dialog. `academy_admin` can edit (but not create/deactivate) their own
  academy via an "Edit" button shown only when `user.academyId === academy.id`.
- **Component/Module:** `web/components/AcademyClient.tsx` (`openAdd`, `openEdit`, `handleSave`,
  `handleMenuAction`, `handleConfirmToggle`)
- **Source files:** `web/app/(dashboard)/academy/page.tsx` (thin wrapper), `web/components/AcademyClient.tsx`,
  `web/lib/db.ts` (`upsertAcademy`, `fetchAcademies`, `dbToAcademy`)
- **Inputs:** name* (required, trimmed non-empty), description, location, phone, **country** (new, see
  ADMIN-022), start date, stage (`Foundation|Mechanics|Velocity|Elite`), status (`Active|Inactive`), Head
  Coach (`headCoachId`, required — ADMIN-002), additional coach IDs, player IDs, session fee, per-session-
  type fees, per-age-group fees, payout model.
- **Outputs:** upsert into `academies` table; new academy IDs are client-generated as `` `ac${Date.now()}` ``.
- **Validation rules:** `name` non-empty; `headCoachId` non-empty (blocking "Academy Owner Required" modal).
- **Business rules:** `player_counts` (per-age-group headcount) is recomputed client-side on every save,
  not DB-triggered. A coach created inline via "+ Create New Coach" is inserted with `academy_id: null`
  and back-filled (`setCoachesAcademy`) only after the academy row itself saves — see Gaps for the
  two-step consistency risk.
- **Permissions:** `platform_admin` — full CRUD, all academies. `academy_admin` — edit only, own academy
  only. `coach`/`player` — no create/edit affordances rendered.
- **Error/exception behavior:** Save failure → `` `Save failed: ${msg}` ``, modal stays open. A subsequent
  coach-backfill failure after a successful academy save → `` `Academy saved, but linking coaches failed: ${msg}` ``
  — i.e. a save can partially succeed with no rollback.
- **Status:** IMPLEMENTED (unchanged in mechanics from the prior analysis; inputs gained `country`)

### ADMIN-002 — Academy Owner (Head Coach) requirement
- **Description:** Every academy must have exactly one designated owner (`headCoachId`), always kept a
  member of `coachIds` (cannot be removed from the additional-coaches list while owner).
- **Component:** `AcademyClient.tsx` (`setOwner`, `toggleCoach`, `ownerMissing`/`ownerSuggested`)
- **Status:** IMPLEMENTED (unchanged)

### ADMIN-003 — Academy roster: player assignment (manual, new-player, CSV import)
- **Description:** Within the Edit-Academy modal, `playerIds` can be toggled from the full player list, a
  brand-new player created inline and auto-assigned, or a CSV bulk-imported.
- **Source:** `AcademyClient.tsx`; `web/lib/db.ts` (`insertPlayer`, `insertPlayers`, `updateAcademyFields`)
- **Inputs (CSV):** `name*, email*, ageGroup, bowlingStyle, club, phone` (case-insensitive headers);
  downloadable template provided.
- **Validation:** row `skipped` if name/email blank; `duplicate` if email exists among current players or
  elsewhere in-file (case-insensitive); unrecognized age group/bowling style are defaulted and flagged
  `warning`.
- **Business rule:** CSV import commits immediately (`updateAcademyFields`) on click, independent of the
  outer "Save Changes" — deliberately, per an in-code comment, to avoid losing a bulk import to an
  accidentally-closed modal. Manual single-player add inserts the player row immediately too, but is only
  added to `draft.playerIds` pending the outer save.
- **Change this session:** a newly-created player/coach's `currency` field is now set from
  `currencyForCountry(draft.country)` rather than a hardcoded value — see ADMIN-022.
- **Status:** IMPLEMENTED

### ADMIN-004 — Academy roster: coach assignment
- **Description:** Additional coaches can be toggled per academy; a coach already assigned elsewhere is
  annotated ("In: {academy names}") but not blocked from a second assignment.
- **Source:** `AcademyClient.tsx` (`toggleCoach`, `coachAcademyMap`, `additionalCoaches`)
- **Status:** IMPLEMENTED (unchanged)

### ADMIN-005 — Academy pricing configuration
- **Description:** Three independent, optional pricing layers per academy: a flat "Default Session Fee",
  a per-session-type override grid, and a per-age-group override grid. Stored as `session_fee_aud`
  (numeric) and `session_type_fees`/`age_fees` (jsonb).
- **Business rule:** `ageFees` entries `<= 0` are stripped before persisting.
- **Change this session:** every money amount in this tab is now rendered through
  `formatMoney(amount, academy.currency)` (`web/lib/currency.ts`) instead of a hardcoded `$` — the
  session fee, per-type fees, and per-age fees are now displayed in the academy's own currency (derived
  from its country), not always AUD. The stored numeric fields are still literally named
  `session_fee_aud`/`sessionFeeAud` in the schema/type even though they may represent a non-AUD amount
  for a non-AU academy — **REQUIRES VALIDATION**: this is either an intentional "the field name is legacy,
  the value is currency-agnostic" design, or a naming trap that could confuse a future refactor into
  thinking these are always AUD-denominated.
- **Derived display:** live platform-fee split (`getPlatformFeePercent(academyId, academies, plans)` ×
  `sessionFeeAud`), formatted in `academy.currency`.
- **Status:** IMPLEMENTED

### ADMIN-006 — Payout model selection
- **Description:** Radio choice between `head_coach` and `split_by_coach`, persisted as
  `academies.payout_model`.
- **Note:** Only configures the model; actual Stripe Connect payout-splitting logic lives outside this
  domain's files (not re-traced this session).
- **Status:** IMPLEMENTED (config surface only)

### ADMIN-007 — Academy list scoping (self-view for academy_admin)
- **Description:** `academy_admin` sees only their own academy in the `/academy` list; "+ New Academy"
  and the platform-admin-only 3-dot menu are hidden for them.
- **Source:** `AcademyClient.tsx`, `displayed` filter:
  `if (user?.role === "academy_admin" && user.academyId && a.id !== user.academyId) return false;`
  — `user.academyId` is now sourced from `app_metadata.academy_id` (Section 0), not `user_metadata`.
- **Caveat (unchanged from prior analysis, HIGH RISK, still unresolved — ADMIN-GAP-001):**
  `fetchAcademies()` (`web/lib/db.ts`) still issues an **unfiltered** `select("*")` regardless of caller
  role; academy_admin scoping is applied client-side only, after every academy row has already reached
  the browser. Whether Postgres RLS on `academies` genuinely enforces this at the DB layer is **UNKNOWN**
  from this repo (no migrations/policy definitions found). The same unfiltered pattern was newly observed
  this session on `fetchNets()` — see ADMIN-025.
- **Status:** PARTIALLY_IMPLEMENTED / UNKNOWN (client filter confirmed; DB-level enforcement UNKNOWN)

### ADMIN-008 — Academy self-serve billing: plan selection & Checkout (now multi-currency)
- **Description:** `/academies/[id]/billing` shows the academy's current plan/subscription and a grid of
  selectable organization-audience plans. Clicking "Subscribe" POSTs to
  `/api/stripe/create-academy-checkout-session` and redirects to the returned Stripe Checkout URL.
- **Component:** `web/components/AcademyBillingClient.tsx` (`handleCheckout`)
- **API route:** `web/app/api/stripe/create-academy-checkout-session/route.ts`
- **Inputs:** `{ academyId, planId }`
- **Authorization:** caller must be `platform_admin`, or `academy_admin` whose
  `user.app_metadata.academy_id === academyId`; else `403`. No session ⇒ `401`.
- **Validation:** `academyId`/`planId` required (`400`); academy exists (`404`); plan exists, `active`,
  `audience === "organization"` (`400`).
- **CHANGED this session — currency resolution:** the route now calls
  `resolvePlanPrice(plan.price_aud, plan.prices_by_currency, academy.currency)` (`web/lib/currency.ts`)
  to pick the amount **and currency** to actually charge: if the academy's currency has a configured
  override price on the plan, that override amount is charged in that currency; otherwise it falls back
  to `price_aud`/AUD. The Stripe Checkout line item's inline `price_data.currency` is now this resolved
  currency, not always `"aud"` as implied by the pre-merge analysis. The UI card
  (`AcademyBillingClient.tsx`) shows the same resolved amount via the same `resolvePlanPrice` call, so
  what's displayed and what's charged can't drift.
- **Business rules (unchanged mechanics):** creates a Stripe Customer on first purchase if none exists
  (head coach's email as contact); inline `price_data` (not a stored Stripe Price ID) — price/currency
  are whatever `resolvePlanPrice` returns *at the moment of checkout*, not versioned; `mode: subscription`,
  metadata tags `academy_subscription`.
- **Status:** IMPLEMENTED

### ADMIN-009 — Academy billing: manage subscription (Stripe Billing Portal)
- **Description:** Once an academy has an active/trialing subscription, the CTA becomes "Manage Billing",
  opening a Stripe-hosted Billing Portal session.
- **API route:** `web/app/api/stripe/create-academy-portal-session/route.ts`
- **Authorization:** same pattern as ADMIN-008, now reading `user.app_metadata?.role`/`academy_id`.
- **Validation:** `academyId` required (`400`); academy must have `stripe_customer_id` set (`400`
  otherwise).
- **Status:** IMPLEMENTED (auth source changed per Section 0; behavior otherwise unchanged)

### ADMIN-010 — Academy subscription state sync (Stripe webhook)
- **Description:** `web/app/api/stripe/webhook/route.ts` keeps `academies` rows in sync for
  `metadata.type === "academy_subscription"` events (`checkout.session.completed`,
  `customer.subscription.updated`, `customer.subscription.deleted`) — sets/refreshes
  `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `plan_id`, computed
  `access_expires_at`.
- **Status:** IMPLEMENTED (not re-read line-by-line this session beyond confirming it's unlisted in the
  changed-files set; carried forward as INFERRED-stable)

### ADMIN-011 — Academy billing: invoice history (read-only)
- **Description:** `<InvoiceHistoryList scope="academy" id={academy.id} />` fetches
  `/api/stripe/invoices?academyId=...` and lists past invoices with a Download link. Display-only.
- **Status:** IMPLEMENTED

### ADMIN-012 — Plan seat-cap warning (advisory only)
- **Description:** While editing an academy, if assigned players exceed the active org plan's `seatCap`,
  an amber warning appears: `` `${playerIds.length} bowlers assigned, but the ${plan.name} plan is capped at ${seatCap}.` ``
  — confirmed still present verbatim in `AcademyClient.tsx`.
- **Business rule:** Soft, advisory-only — nothing blocks saving an over-cap roster; no server-side
  seat-cap enforcement found in this domain's routes.
- **Status:** IMPLEMENTED (warning); NOT_IMPLEMENTED (enforcement)

### ADMIN-013 — Platform admin: cross-academy KPI dashboard
- **Description:** `/admin/kpis` shows platform-wide stats (total/active academies, total coaches, total
  unique players, "needs attention" count), a plan-distribution breakdown, and a full academies table.
- **Component:** `web/components/PlatformKpisClient.tsx`
- **Calculations (unchanged):** `totalPlayers` de-duplicated across academies via `Set`; `needsAttention`
  = `subscriptionStatus` past_due/unpaid, or `status === "Active"` with no `planId`; table sorted
  attention-first then alphabetical.
- **Change this session:** the plan-distribution row's price display now goes through
  `formatMoney(plan.priceAud, "aud")` (explicitly pinned to AUD here, unlike the academy-currency-aware
  displays elsewhere) — this cross-academy view always shows each plan's AUD list price regardless of
  which academies bought it in another currency, which is consistent (one canonical reference price per
  plan) but means this table cannot be used to read what a specific academy is actually being billed in
  its own currency.
- **Permissions:** client-side redirect to `/players` for non-`platform_admin`; the underlying fetches
  (`fetchAcademies`, `fetchCoaches`, `fetchAllPlans`) still have **no server-side role check** — same gap
  as before (ADMIN-GAP-002).
- **Status:** IMPLEMENTED

### ADMIN-014 — Platform admin: plan catalog CRUD (`/admin/plans`) — now multi-currency and feature-gated
- **Description:** Create, edit, activate/deactivate rows in the `plans` table — B2C and B2B pricing tiers
  (Library, one-time Assessments, Academy/Club/Board org licenses) **and, per the in-UI copy, "B2C and
  B2B pricing tiers beyond Player Pro / Coach Pro"**. This is the single admin surface for the entire
  configurable catalog now that platform-wide pricing has no separate page (see Section 1).
- **Component:** `web/components/PlansAdminClient.tsx`
- **API route:** `web/app/api/plans/update/route.ts` (single endpoint: insert when no `id`, update
  when `id` present)
- **Fields (CHANGED — grew substantially this session):**
  `slug*, name*, audience* (individual|organization), billingType* (subscription|one_time),
  billingInterval (month|year, subscription only), priceAud* (>= 0 — CHANGED, was previously required
  > 0; a $0 plan is now valid, e.g. for an internal/test tier), **pricesByCurrency** (NEW — optional
  per-currency override map, one field per non-AUD supported currency: usd/gbp/nzd/inr), seatCap,
  accessDurationMonths, includedNotes, waivesSessionFees (bool), platformAdminOnly (bool),
  platformFeePercent (0–100, default 10), active (bool), sortOrder,
  **sessionsPerMonthLimit** (NEW, individual tiers), **chatMessagesPerDayLimit** (NEW, Coach AI chat cap),
  **aiReportsEnabled** (NEW, bool), **marketplaceEnabled** (NEW, bool), **locked** (NEW, read-only flag —
  see below).
- **NEW — "locked" system plans:** a plan row can be `locked: true` (currently the three seeded tier
  plans, slug `free`/`player-pro`/`coach-pro`, per the in-UI copy "This is a system plan (Free / Player
  Pro / Coach Pro)"). For a locked plan, the edit modal disables `slug`, `audience`, and `billingType`
  inputs client-side, and the API route independently re-asserts the same lock server-side: on update, if
  `plans.locked` is true for that row, the route overwrites the incoming `slug`/`audience`/`billing_type`/
  `billing_interval` with the existing DB values before writing, regardless of what the client sent — a
  genuine server-side enforcement, not just a disabled input.
- **Validation (server-side, in the route):**
  - `slug`, `name` non-empty; `audience` ∈ {individual, organization}; `billingType` ∈
    {subscription, one_time}; `priceAud >= 0` (CHANGED from `> 0`) — else `400`.
  - `billingType === "subscription"` requires `billingInterval` ∈ {month, year}; `one_time` forbids one —
    else `400`.
  - `platformFeePercent`, if provided, `0 ≤ x ≤ 100` — else `400`.
  - NEW: `sessionsPerMonthLimit`/`chatMessagesPerDayLimit`, if provided, must be non-negative numbers —
    else `400`.
  - NEW: every key in `pricesByCurrency` must be a `isSupportedCurrency()` value other than `"aud"`
    (aud is the base `priceAud` field, not an override), with a non-negative numeric value — else `400`
    `` `Invalid price override for currency "${currency}".` ``.
- **Authorization:** `caller?.app_metadata?.role !== "platform_admin"` → `403` (CHANGED from
  `user_metadata` per Section 0; the route still does its own direct cookie-based check rather than the
  shared `getCaller()` helper — same duplication noted pre-merge, see ADMIN-GAP-003). No distinct 401 for
  "not signed in" — an absent session simply fails the role check too.
- **Business rules (unchanged from before):** `waivesSessionFees` is a live, read-time flag, not
  snapshotted per-academy at subscribe time; `platformAdminOnly` plans are filtered from
  `AcademyBillingClient`'s `selectablePlans` unless the viewer is `platform_admin`.
- **Status:** IMPLEMENTED

### ADMIN-015 — REMOVED: Platform admin: flat B2C subscription pricing (`/admin/pricing`)
- **Prior description:** `/admin/pricing` edited the two flat, platform-wide `platform_settings.player_pro_price_aud`/`coach_pro_price_aud` values.
- **Confirmed removed this session:** `web/app/(dashboard)/admin/pricing/page.tsx`,
  `web/components/PlatformPricingClient.tsx`, `web/app/api/platform-settings/update/route.ts`, and the
  `PlatformSettings` type in `web/lib/types.ts` are all gone. See Section 1 for the direct-verification
  detail and Section 9 for the full removal writeup.
- **What replaced it — REQUIRES VALIDATION:** the merge did not obviously re-implement flat Player Pro /
  Coach Pro price editing anywhere. `Plan` rows with slug `player-pro`/`coach-pro` now exist as `locked`
  entries in the same Plan Catalog (ADMIN-014) and their `priceAud`/`pricesByCurrency` fields are editable
  there like any other plan — so editing Player Pro's price plausibly now happens through `/admin/plans`
  by editing the `player-pro` plan row instead of a dedicated pricing page. This is a **strong inference**
  from the `locked` mechanism's own description ("system plan (Free / Player Pro / Coach Pro)... Price,
  limits, and everything else are still editable") but this session did not trace the actual player-facing
  Player Pro/Coach Pro Stripe checkout route(s) to confirm they read `priceAud` from the `plans` table
  (by slug) rather than from some other still-existing config source — that would need a follow-up read of
  the individual (player/coach) subscription checkout routes, which are outside this domain's file list.
- **Status:** REMOVED (page/component/route/type all confirmed gone); its likely replacement (editing the
  locked `player-pro`/`coach-pro` rows via ADMIN-014) is REQUIRES_VALIDATION, not confirmed.

### ADMIN-016 — Quote-based / negotiated B2B pricing model (per `PACE_HQ_B2B_Platform_Spec.md`)
- **Description:** A companion spec document proposes per-institution negotiated pricing, a lead-intake
  surface, and Stripe Invoicing, explicitly stating none of it is built.
- **Status:** NOT_IMPLEMENTED (not re-verified this session; carried forward unchanged — no files in this
  session's review scope touched this area, and the spec doc's own disclaimer stands)

### ADMIN-017 — Platform admin: approvals queue consumption (UI)
- **Description:** `/admin/approvals` renders pending account requests (from `/api/pending-approvals` —
  see `auth.md`) and drives Approve/Reject, including the academy-assignment sub-flow.
- **Component:** `web/app/(dashboard)/admin/approvals/page.tsx` — a client component (whole page is
  `"use client"`), unchanged structurally from the prior analysis.
- **This domain's specific piece:** Approving an `academy_admin`-role request opens an "Assign Academy"
  dialog defaulting to "New Academy" (pre-filled from the requester's self-reported name/location), with
  an explicit toggle to "Existing Academy". "Create Academy" here calls the same `upsertAcademy` as
  ADMIN-001.
- **CHANGED this session (small, ~11 lines):** the inline academy object constructed by
  `handleCreateAcademy` after a successful create now includes `country: "AU", currency: "aud"` and
  `payoutModel: "head_coach"` in the client-side optimistic state update — bringing this ad-hoc academy
  object in line with the now-required `Academy.country`/`.currency` fields (ADMIN-022). The actual
  `upsertAcademy()` DB write in this flow still does **not** send a `country`/`currency` field explicitly
  (only `id, name, description, location, player_ids, ..., session_fee_aud, session_type_fees, age_fees`)
  — relying on `dbToAcademy`'s `?? "AU"` / `?? DEFAULT_CURRENCY` fallback (ADMIN-022) when the row is
  later re-fetched, rather than writing an explicit country at creation time. This is a minor
  inconsistency (client optimistic state assumes AU explicitly; the DB write leaves it to a column
  default/fallback) but not a functional bug given the fallback exists.
  Choosing "Existing Academy" with nothing selected still allows Approve (advisory-only warning, not a
  block, same as before).
- **Status:** IMPLEMENTED

### ADMIN-018 — Platform admin: grant/revoke platform_admin
- **Description:** `/admin/admins` lists every non-rejected user (split "Platform Admins" / "Everyone
  Else") with Promote/Demote actions.
- **Component:** `web/components/PlatformAdminsClient.tsx`
- **API routes:** `web/app/api/platform-admins/list/route.ts` (GET), `.../toggle/route.ts` (POST)
- **CHANGED this session (auth source, Section 0):**
  - `list`: authorization via `getCaller()`; filters out `u.app_metadata?.approved === false` (was
    `user_metadata`); maps `role: u.app_metadata?.role ?? "coach"` (was `user_metadata`); `name` is still
    read from `u.user_metadata?.name` (display-only field, correctly still there).
  - `toggle`: `caller.role !== "platform_admin"` via `getCaller()` → `403`; self-modification guard
    unchanged (`caller.userId === userId` → `400`); on success now calls
    `supabase.auth.admin.updateUserById(userId, { app_metadata: { role: makeAdmin ? "platform_admin" : fallbackRole } })`
    — **CHANGED from `user_metadata`**. Still replaces `role` only, leaving `academy_id`/`coach_id`
    untouched — the same demote-to-unscoped-role gap as before (ADMIN-GAP-004) persists unchanged, just on
    the new metadata field.
- **UI safeguard:** caller's own row never renders Promote/Demote (`isSelf` check), unchanged.
- **Status:** IMPLEMENTED

### ADMIN-019 — Platform admin: Academy Content (curriculum) publishing
- **Description:** `/admin/academy` manages `articles` (4-stage curriculum) and `daily_tips` backing the
  player-facing Academy learning module.
- **Component:** `web/components/AcademyContentAdminClient.tsx`
- **Source:** `web/lib/db.ts` (`fetchAllArticlesForAdmin`, `upsertArticle`, `deleteArticle`,
  `fetchTipArchive`, `upsertDailyTip`, `deleteDailyTip`) — all via the browser (anon-key) Supabase client,
  not a service-role route; same authorization-implication gap as before (ADMIN-GAP-002/003).
- **Business rule — new-article notification:** on save, if the article is newly flipped to
  `published: true` (not already published before this save), a fire-and-forget POST to
  `/api/notify-new-article` fires. Re-saving an already-published article does not re-notify.
- **Status:** IMPLEMENTED (unchanged this session — file not in the substantially-changed set, verified
  it still matches the prior description)

### ADMIN-020 — Plan-edit propagation to existing academies (live lookup, not a snapshot)
- **Description:** Editing a plan row's `platformFeePercent`, price(s), `seatCap`,
  `accessDurationMonths`, `waivesSessionFees`, or `active` flag takes effect immediately for every academy
  currently pointing at that `plan_id` — no snapshotting at subscribe-time.
- **CHANGED this session:** the live-lookup now also applies to `pricesByCurrency` — editing a plan's
  currency override table changes what `AcademyBillingClient`'s picker displays via `resolvePlanPrice`
  immediately, the same as `priceAud` always did. As before, an *already-subscribed* academy's actual
  Stripe-billed amount is unaffected until they re-subscribe (their subscription's price was fixed into a
  Stripe object at their own checkout time) — only the on-screen "what does this plan cost" projection and
  any *new* checkout are live.
- **Status:** IMPLEMENTED (as designed) — same blast-radius risk as before (ADMIN-GAP-008), now also
  covering currency-override edits.

---

### ADMIN-021 — NEW: Multi-currency plan pricing infrastructure (`lib/currency.ts`)
- **Category:** B2B billing / platform admin
- **Description:** A new shared currency module underpins ADMIN-008, ADMIN-014, ADMIN-020, ADMIN-022, and
  approve-user's plan-summary email. Defines `Currency = "aud" | "usd" | "gbp" | "nzd" | "inr"`,
  `SUPPORTED_CURRENCIES`, `DEFAULT_CURRENCY = "aud"`, and `COUNTRY_OPTIONS` (AU/NZ/GB/US only — deliberately
  excludes India from the *country* list even though INR is a supported currency, because Stripe Connect
  Express doesn't support India as a connected-account country per the in-code comment citing Stripe's own
  docs; INR is usable only for individual, non-Connect purchases).
- **Key functions:**
  - `currencyForCountry(code)`: derives currency from country code, defaulting to `DEFAULT_CURRENCY` for
    an unrecognized code.
  - `resolvePlanPrice(priceAud, pricesByCurrency, preferred)`: returns `{amount, currency}` — the
    preferred-currency override if one exists and preferred isn't already `"aud"`, else `{priceAud, "aud"}`.
    Shared by every plan-based Stripe checkout route (per its own doc comment) "so 'does this plan support
    the buyer's currency' is decided in exactly one place" — confirmed used by
    `create-academy-checkout-session`, `AcademyBillingClient`, and `plan-email.ts`.
  - `sumMoneyByCurrency(entries)`: sums same-currency entries, renders mixed-currency totals as
    `"A$120.00 + NZ$45.00"` style rather than a meaningless cross-currency sum. **Not observed being
    called anywhere in this domain's files** in this session's review — REQUIRES_VALIDATION whether it's
    used elsewhere in the app (e.g. a cross-academy revenue report outside this domain) or currently dead
    code.
  - `formatMoney(amount, currency)`: the one shared money formatter (`Intl.NumberFormat("en-AU", ...)`),
    used pervasively across `AcademyClient.tsx`, `AcademyBillingClient.tsx`, `PlansAdminClient.tsx`,
    `PlatformKpisClient.tsx`.
- **Status:** IMPLEMENTED

### ADMIN-022 — NEW: Academy country → currency binding, locked once payouts exist
- **Category:** Academy management
- **Description:** `Academy` gained a required `country: string` field (ISO 3166-1 alpha-2, e.g. `"AU"`)
  and `currency: Currency` is now always *derived* from it via `currencyForCountry`, never picked
  independently. Set at academy creation via a Country dropdown (`COUNTRY_OPTIONS`) in the Academy
  edit/create modal.
- **Component:** `AcademyClient.tsx` — `academyCountryLocked` (computed once, shared by both the disabled-
  dropdown UI state and `handleSave`'s enforcement, "so the two can never disagree" per the in-code
  comment).
- **Business rule — lock condition:** the Country field becomes disabled once **either** the head coach
  or any assigned coach has a `stripeConnectAccountId` — because "a Connect account's payout currency is
  tied to the country it was created with" (Stripe can't move a connected account's country after the
  fact). UI copy: "Locked — a coach here already has a Stripe payout account set up."
- **Server-side enforcement of the lock:** on save, if `academyCountryLocked` is true, `handleSave` uses
  the **existing** academy row's `country` (looked up fresh from `academies` state, not the draft) rather
  than whatever the (disabled but still form-bound) `draft.country` currently holds — explicitly to
  guard against "a stale/injected draft value" slipping through. This is a client-side-only guard,
  however — **REQUIRES VALIDATION** whether `/api/plans/update`-style server-side re-validation exists
  anywhere for a direct `upsertAcademy()` call bypassing the UI (it goes straight to the anon-key Supabase
  client with no dedicated academy-write API route in this domain, so the lock's only enforcement is this
  one client-side branch plus whatever RLS may or may not exist — same category of risk as ADMIN-GAP-001).
- **Backward compatibility:** `dbToAcademy()` defaults `country: r.country ?? "AU"` and
  `currency: (r.currency as Currency) ?? DEFAULT_CURRENCY` — pre-migration academy rows with no `country`
  column value read back as AU/AUD rather than erroring or crashing.
- **Downstream effects:** every money display for an academy (session fees, plan prices in
  `AcademyBillingClient`, KPI table currency-agnostic AUD reference) now flows through this field; new
  players/coaches created inline during academy editing get `currency: currencyForCountry(draft.country)`
  rather than a hardcoded AUD.
- **Status:** IMPLEMENTED

### ADMIN-023 — NEW: Welcome Email Templates admin (`/admin/email-templates`)
- **Category:** Platform admin console (new subsystem)
- **Description:** A platform-admin-only editor for the four role-scoped welcome-email templates sent
  automatically by `/api/approve-user` on account approval — **not** a general "platform settings" page
  despite occupying the URL/route the old `platform-settings/update` route used to (see Section 1). Each
  of the 4 fixed rows (`player`, `coach`, `academy_admin`, `parent` — `WelcomeEmailRole`) has an editable
  `subject`, `heading`, and `body`, each supporting a `{{name}}` placeholder token.
- **Page/Component:** `web/app/(dashboard)/admin/email-templates/page.tsx` (thin wrapper) →
  `web/components/EmailTemplatesAdminClient.tsx` (176 lines)
- **API route:** `web/app/api/email-templates/update/route.ts` — this is the file that occupies the old
  `platform-settings/update` route's position in git history, per the task's confirmed rename, but its
  actual body/purpose is entirely email-template-specific, not general platform settings (see below).
- **Data:** `web/lib/db.ts` `fetchEmailTemplates()` → `sb.from("email_templates").select("*").order("id")`
  → `dbToEmailTemplate`. `EmailTemplate { id: WelcomeEmailRole; subject; heading; body }`
  (`web/lib/types.ts`).
- **UI mechanics:** role-tab switcher (Player/Coach/Academy/Parent); a live split-pane preview rendered via
  `renderTemplate(draft.subject/heading/body, { name: "Alex Smith" })` (from `web/lib/email-templates.ts`)
  showing exactly what an approved user would see, including paragraph-splitting on blank lines
  (`body.split(/\n{2,}/)`); Save button disabled unless the active tab's draft differs from the last-saved
  value (`dirty` check).
- **API validation:** `id` must be one of the 4 fixed `VALID_ROLES`; `subject`/`heading`/`body` must all
  be strings — else `400` "Invalid template data."
- **Authorization:** `caller?.app_metadata?.role !== "platform_admin"` → `403` (direct cookie check,
  inline, same pattern/duplication as ADMIN-014 — see ADMIN-GAP-003).
- **Write:** `supabase.from("email_templates").update({ subject, heading, body, updated_at }).eq("id", id)`
  — update-only; rows are never inserted or deleted through this UI (the 4 rows are treated as fixed,
  seeded data, never user-created).
- **Consumption by outgoing email (confirms this is live, not just a preview tool):**
  `web/app/api/approve-user/route.ts` fetches `email_templates` by the approved request's role, runs
  `renderTemplate(...)` on subject/heading/body with `{ name: reqData.name }`, and falls back to a
  hardcoded generic subject/heading/body ("Your CRIC HQ account has been approved" / `Welcome, ${name}! 🏏`
  / "Your CRIC HQ account has been approved as a ${roleLabel}.") if the DB row is ever missing — an
  explicit design choice so approval emails "never silently go unsent" even if the templates table has a
  gap.
- **Determination on the task's specific question — "still functionally platform settings under a new
  name, or genuinely narrowed to email-template content":** **narrowed**. The route/table/UI are entirely
  and exclusively about the 4 welcome-email templates; there is no trace of the old
  `player_pro_price_aud`/`coach_pro_price_aud` fields, or any other non-email-template concept, anywhere
  in the new route, the new component, or the `email_templates` table's usage. The URL path coincidentally
  landing where the old route's git history sits does not carry forward any of its old scope.
- **Status:** IMPLEMENTED

### ADMIN-024 — NEW: On-demand "email my plan details" resend (academy billing)
- **Category:** B2B billing
- **Description:** A button on `/academies/[id]/billing` ("📧 Email Plan Details") that re-sends a summary
  of the academy's current plan — for when someone asks again after the one-time approval email. Reuses
  the exact same plan-lookup helper as the original welcome email so content can never drift.
- **Component:** `AcademyBillingClient.tsx` → `EmailPlanDetailsButton` (inline sub-component)
- **API route:** `web/app/api/send-plan-email/route.ts` (88 lines)
- **Shared logic:** `web/lib/plan-email.ts` → `fetchAcademyPlanInfo(supabase, academyId)` — looks up the
  academy's `plan_id`/`currency`, joins the `plans` row, and formats a plan-lines array via
  `resolvePlanPrice` + `formatMoney` + the plan's `included_notes`. Used by both this route and
  `approve-user`'s welcome email.
- **HTML rendering:** `web/lib/email-templates.ts` → `buildPlanDetailsEmailHtml(...)` — same visual shell
  (`shell()`, brand-green header, info-box) as the welcome email's `buildWelcomeEmailHtml`.
- **Authorization:** `getCaller()`; `platform_admin`, or `academy_admin` whose `caller.academyId ===
  academyId` — else `403`. No caller ⇒ `401`.
- **Validation:** `academyId` required (`400`); academy must exist (`404`); the academy must have a plan
  with at least one plan-info line, else `400` "This academy has no plan assigned yet — nothing to send.";
  Gmail SMTP env vars must be configured, else `500`.
- **Recipients:** **every** account with `app_metadata.role === "academy_admin"` and
  `app_metadata.academy_id === academyId` (not just the caller) — explicitly so a platform_admin
  triggering this on a customer's behalf reaches the actual academy admin(s) without needing to know who
  they are. `404` "No academy admin account found for this academy" if the list is empty.
- **Send mechanics:** `nodemailer` via Gmail SMTP, one email per recipient, best-effort
  (`.catch(() => {})` per recipient so one bad address doesn't block others); response reports `sent` count;
  `502` only if **zero** sends succeeded.
- **Status:** IMPLEMENTED

### ADMIN-025 — Physical net (bowling net) management per academy
- **Category:** Academy management
- **Description:** Within an academy's expanded accordion row, a "Nets" tab lists/creates/edits/deletes
  named practice nets (`name`, `dimensions`, e.g. "Net 1" / "30m x 3.5m") used at booking time to assign a
  specific net when an academy has more than one. Inline add/edit form, delete with an inline
  confirm-or-cancel (not a modal).
- **Component:** `AcademyClient.tsx` (`openAddNet`, `openEditNet`, `handleSaveNet`, `handleDeleteNet`,
  `showNetForm`/`editingNetId`/`netDraft` state)
- **Source:** `web/lib/db.ts` (`fetchNets`, `upsertNet`, `deleteNet`), `web/lib/types.ts` (`Net { id,
  academyId, name, dimensions }`)
- **Note on scope/verification:** this component and its net-management tab were **not covered by the
  prior (pre-merge) analysis of this domain at all** — it is documented here for the first time in this
  audit. Whether the Nets feature itself is new to this session's merge, or simply was present before and
  missed by the prior pass, could not be determined from this session's file-diff scope (Nets files were
  not called out in the task's changed-file list). Treat its "new-ness" as UNKNOWN; its current
  *implementation* is confirmed IMPLEMENTED either way.
- **Scoping gap (same shape as ADMIN-GAP-001):** `AcademyClient.tsx` calls `fetchNets()` with **no**
  `academyId` argument even though `fetchNets(academyId?)` supports server-side filtering
  (`.eq("academy_id", academyId)`) — every net for every academy is fetched into the browser regardless of
  caller role, and only filtered client-side per-academy at render time
  (`nets.filter(n => n.academyId === academy.id)`). Same unverified-RLS risk as `fetchAcademies()`.
- **Status:** IMPLEMENTED

---


---

## PORTAL — Portal & Content — Player/Parent Portal, Academy Curriculum, Messaging

*Source: [`domains/portal_content.md`](./domains/portal_content.md)*


### PORTAL-001 — Portal home dashboard data assembly
- **Category**: Data aggregation / dashboard
- **Component/Module**: `web/components/PortalClient.tsx`
- **Description**: `/portal` loads the signed-in player's profile, recent sessions, recent
  reports, today's Academy tip, and active session packs in parallel, then renders a
  single-page dashboard.
- **Verified current behavior**: `useEffect` fires `Promise.all([fetchPlayer, fetchSessions,
  fetchReports, fetchTodaysTip, fetchSessionPacks])`, filters reports to
  `reviewStatus === "completed"` before display, then fires `recordTipView(user.playerId)`
  fire-and-forget (not awaited into the initial render).
- **Loading guard (unchanged, and — notably — correct here)**: `if (loading && user?.playerId)`
  shows a spinner only when a player *is* linked; `if (!user?.playerId || !player)` renders
  "No player linked to this account" otherwise. This guard is correctly written in
  `PortalClient` — contrast with `AcademyLearnClient`'s bug (PORTAL-007).
- **Unpaid-pack banner (rule as coded)**: every pack with `status === "Active" &&
  paymentStatus !== "Paid"` is shown (not just `Overdue`), sorted Overdue-first, and suppressed
  entirely once `player.loginDisabled` is true. This is a nudge shown as soon as a pack has any
  unpaid state (Pending or Overdue), not only after it lapses — same as before, re-confirmed
  against current code.
- **Permissions/roles**: identical rendering for `role === "player"` and `role === "parent"`
  except the consent card (PORTAL-002).
- **Status**: IMPLEMENTED

### PORTAL-002 — Guardian/player consent confirmation
- **Category**: Compliance / authorization
- **Component/Module**: `PortalClient.tsx` (consent-card IIFE); `web/app/api/confirm-consent/route.ts`.
- **Business rule (exact, as coded, unchanged)**: `isMinor = player.ageGroup !== "Senior"`;
  `canConfirmHere = (role === "parent" && isMinor) || (role === "player" && !isMinor)`.
- **Server-side enforcement — re-verified against current code**: `POST /api/confirm-consent`
  resolves the caller from the session cookie, and now explicitly reads
  `user.app_metadata?.role` and `user.app_metadata?.player_id as string | undefined` — **this
  route was already on the post-migration `app_metadata` field** (no stale `user_metadata` read
  survives here), requires `role === "parent" || role === "player"` (403 otherwise), 400 if no
  `playerId`, and — for `role === "player"` — re-derives `age_group` from the `players` table
  itself and rejects with 403 if not `"Senior"`. `guardian_consent_confirmed_by` still falls
  back to `user.user_metadata?.name ?? user.email` — a display-name convenience field, not a
  privilege check, so its continued use of `user_metadata` here is not a security gap.
- **Outputs on success**: sets `guardian_consent_status = "Confirmed"`,
  `guardian_consent_confirmed_at`, `guardian_consent_confirmed_by`,
  `guardian_consent_confirmed_email` on the `players` row.
- **Error behavior**: 401 not signed in; 403 wrong role or under-19 self-confirm; 400 unlinked
  account; 500 misconfigured/DB error.
- **Status**: IMPLEMENTED

### PORTAL-003 — Academy stage unlock gate
- **Category**: Business rule / access control
- **Component/Module**: `web/lib/academy-content.ts` — `isStageUnlocked`, `isArticleUnlocked`,
  `stageLockReason`, `currentUnlockedStage`. **Byte-for-byte logic unchanged** from prior
  analysis; re-verified.
- **Exact rule as coded**: Foundation always unlocked. Every other stage requires
  `isPaidPlan(plan) || hasLibraryAccess` (plan `"Player Pro"`/`"Coach Pro"`, or
  `librarySubscriptionStatus` `"active"`/`"trialing"`) **and** a per-stage prior-stage read
  count: Mechanics ≥5 Foundation reads, Velocity ≥6 Mechanics reads, Elite ≥6 Velocity reads.
- **Status**: IMPLEMENTED (gate logic); PARTIALLY_IMPLEMENTED relative to any external product
  doc that omits the Library add-on path (see PORTAL-GAP-001)

### PORTAL-004 — Article read tracking + XP award
- **Category**: Gamification / state mutation
- **Component/Module**: `recordArticleRead()`, `web/lib/db.ts` (lines ~1136–1189). Called from
  `ArticleReaderClient.tsx` only after `unlocked === true`, once per mount (`markedRef` guard).
- **Exact XP rule as coded (unchanged, re-verified)**:
  1. Insert into `article_reads` with deterministic id `` `${playerId}_${article.id}` ``; a
     Postgres `23505` unique-violation returns `{alreadyRead: true, xpAwarded: 0}`.
  2. `xpAwarded = XP_PER_ARTICLE[article.stage]` (Foundation 50 / Mechanics 100 / Velocity 150 /
     Elite 200).
  3. If the player has now read every *currently published* article in that stage
     (`stageReadCount === stageTotal`, computed live from the passed-in `allArticles`), add
     `STAGE_COMPLETE_BONUS_XP` (500).
  4. If total distinct reads now equals `ACADEMY_TOTAL_ARTICLES` — still a hardcoded `29`, and
     the constant now carries an explicit code comment: *"matches the doc spec, not
     `articles.length`, so completion % stays meaningful even if extra monthly articles are
     added later"* — add `ALL_ARTICLES_BONUS_XP` (1000). The comment makes the tradeoff
     intentional-by-design rather than an oversight, but the underlying risk is unchanged: if
     fewer than 29 articles are currently published, 100%/the bonus is still unreachable.
  5. Updates `players.xp`, `acad_xp`, `acad_articles_read`, `acad_completion_percent =
     round(articlesRead / 29 * 100)`, and `acad_stage = currentUnlockedStage(...)`.
- **Status**: IMPLEMENTED (XP numbers exact); PARTIALLY_IMPLEMENTED for the hardcoded-29 risk
  (now explicitly acknowledged in-code, not merely an inferred risk)

### PORTAL-005 — Daily tip display + streak tracking
- **Category**: Gamification / engagement
- **Component/Module**: `fetchTodaysTip()`, `recordTipView()` (`web/lib/db.ts`); rendered in
  both `PortalClient.tsx` and `AcademyLearnClient.tsx`. Logic unchanged, re-verified line by
  line against current `db.ts`.
- **Exact rule as coded**: `fetchTodaysTip` returns the most recent `daily_tips` row with
  `publish_date <= today`. `recordTipView`: no-op if `tip_last_viewed_date === today`;
  increments by 1 if the last view was exactly yesterday; otherwise resets to 1;
  `tip_best_streak = max(prior best, new streak)`; awards `TIP_STREAK_BONUS_XP` (200) whenever
  the new streak is a positive multiple of `TIP_STREAK_TARGET_DAYS` (7) — re-fires every 7-day
  multiple, not just once.
- **Status**: PARTIALLY_IMPLEMENTED (core mechanic implemented and numerically exact; a
  player-facing tip archive / push notifications remain NOT_IMPLEMENTED — see PORTAL-GAP-003)

### PORTAL-006 — Badge computation
- **Category**: Gamification
- **Component/Module**: `web/lib/badges.ts` (`computeBadges`), `web/components/BadgeStrip.tsx`.
  Unchanged, re-verified.
- **Badge catalog as coded**: `sessions-{1,5,10,25,50,100}`, `xp-{100,500,1000,2500,5000}`,
  `first-report` (≥1 report), `five-reports` (≥5), `tip-streak` (`tipBestStreak >= 7`),
  `academy-master` (`articlesRead >= 29`). No PDF certificate anywhere in the codebase
  (confirmed via a fresh repo-wide search for "certificate" — zero matches).
- **Status**: IMPLEMENTED (badge computation, all 8 badges); NOT_IMPLEMENTED (PDF certificate)

### PORTAL-007 — Academy learn page (stage/article listing)
- **Category**: UI / navigation
- **Component/Module**: `web/components/AcademyLearnClient.tsx`.
- **Known bug — re-confirmed present in current code**: the loading guard at line 44 is still
  unconditional `if (loading) return <spinner>` (unlike `PortalClient`'s
  `loading && user?.playerId` guard), while the data-fetch `useEffect` still only runs when
  `user?.playerId` is set. An account with no linked player never flips `loading` to `false` —
  infinite spinner, "No player linked" is unreachable on this page. This is the exact same bug
  documented pre-merge; nothing in the 120-commit merge touched it.
- **Status**: PARTIALLY_IMPLEMENTED — functional for linked accounts; confirmed infinite-spinner
  bug persists for accounts with no `playerId` (PORTAL-GAP-005)

### PORTAL-008 — Article reader page
- **Category**: UI / content rendering
- **Component/Module**: `web/components/ArticleReaderClient.tsx`, `web/components/ArticleBody.tsx`.
  Unchanged, re-verified.
- **Description**: stage badge, read-time, optional video (YouTube/Vimeo regex → `<iframe>`,
  else direct `<video>`), key-takeaways list, minimal custom Markdown renderer.
- **Locked-article behavior**: shows a 🔒 message using `stageLockReason`; the read-tracking
  effect only fires when `unlocked === true`, so no XP/read can be earned by direct navigation
  to a locked article's URL.
- **Status**: IMPLEMENTED

### PORTAL-009 — Coach-to-player/parent email messaging
- **Category**: Communication
- **Component/Module**: `web/components/MessageModal.tsx`; `web/app/api/send-message/route.ts`.
  Unchanged, re-verified.
- **Provider**: `nodemailer` via Gmail SMTP app-password
  (`nodemailer.createTransport({ service: "gmail", auth: {...} })`); `from` is always the
  shared Gmail mailbox, `fromName` only changes the display name.
- **API contract**: `POST { to, subject, body, fromName }` → 400 missing fields; 500 not
  configured; 500 provider error; 200 `{success:true}`. Subject defaults `"(No subject)"`,
  `fromName` defaults `"CRIC HQ"`. This route performs **no auth/role check at all** — it is
  reachable by anyone who can reach it with a valid session (mounted only from coach-facing
  UI, but the API itself is not role-gated), unaffected by the RBAC migration since it never
  read role metadata to begin with.
- **Post-send side effect**: `insertMessage()` logs the send only after a successful API call,
  client-orchestrated (not atomic).
- **Status**: IMPLEMENTED

### PORTAL-010 — Coach-to-player/parent SMS messaging
- **Category**: Communication
- **Component/Module**: `MessageModal.tsx`; `web/app/api/send-sms/route.ts`; `web/lib/sms.ts`.
  Unchanged, re-verified.
- **Provider**: ClickSend REST API, Basic-Auth base64(`CLICKSEND_USERNAME:CLICKSEND_API_KEY`).
- **Phone normalization (unchanged)**: strips whitespace; `04xxxxxxxx` → `+61`+rest; bare
  9-digit starting `4` → `+61`+number; else prefixes bare `+`. AU-specific, silently
  mis-normalizes non-AU numbers not already `+`-prefixed.
- **`sendSms` never throws**; SMS body capped at 160 chars client-side only (`maxLength`), not
  re-validated in `/api/send-sms` or `sendSms()`.
- **Status**: IMPLEMENTED

### PORTAL-011 — Bulk messaging to multiple players
- **Category**: Communication
- **Component/Module**: `web/components/BulkMessageModal.tsx`.
- **Critical finding — re-confirmed unchanged**: `handleSend` still calls `insertMessage()`
  directly for every target player and shows "Sent to N players" — it still **never** calls
  `/api/send-message` or `/api/send-sms`. No actual email/SMS is delivered; only `messages`
  rows are written. This is the exact same behavior as before the merge, byte-for-byte in the
  relevant logic.
- **SMS eligibility filtering**: unchanged — players without `phone` excluded from SMS sends,
  named in an amber warning; submit disabled when zero SMS-eligible players.
- **Status**: PARTIALLY_IMPLEMENTED — UI and DB-logging complete; actual email/SMS dispatch
  NOT_IMPLEMENTED (PORTAL-GAP-006)

### PORTAL-012 — Message history display
- **Category**: Communication / audit trail
- **Component/Module**: `web/components/PlayerMessages.tsx`; `fetchMessages()`,
  `insertMessage()` (`web/lib/db.ts`).
- **Change from prior analysis**: `fetchMessages` now carries an explicit
  `.order("date", { ascending: false })` clause — confirmed newest-first DB ordering, no longer
  an inference. (The prior analysis flagged this as unverified from an incomplete excerpt; it
  is now directly confirmed in the current full function body.)
- **Status**: IMPLEMENTED

### PORTAL-013 — Dead code: `lib/messages-store.ts`
- **Category**: Code health finding
- **Description**: a complete localStorage-backed message store (`getMessagesForPlayer`,
  `saveMessage`) still exists at `web/lib/messages-store.ts` with **zero importers anywhere in
  the codebase** — re-confirmed via a fresh repo-wide search for the string `messages-store`,
  which returns no matches outside the file itself. Untouched by the merge.
- **Status**: NOT_IMPLEMENTED (orphaned/unreachable code)

### PORTAL-014 — New-Academy-article broadcast email
- **Category**: Communication
- **Component/Module**: `web/app/api/notify-new-article/route.ts`, triggered from
  `web/components/AcademyContentAdminClient.tsx` (`handleSaveArticle`, on the
  unpublished→published transition, `articleDraft.published && !wasPublished`).
- **CHANGED — RBAC migration touchpoint**: the admin-role check now reads
  `caller?.app_metadata?.role !== "platform_admin"` (confirmed against current source);
  pre-migration this read `user_metadata`. This is the concrete "2 lines changed" diff named in
  the task scope for this route.
- **Behavior otherwise unchanged**: bcc's every distinct non-null `players.email`, subject
  `"New Academy Lesson: {title}"`, links to `{NEXT_PUBLIC_APP_URL}/portal/learn/{articleId}`.
  Silently no-ops (`{success:true, skipped:true}`) when Gmail creds are unset/placeholder, when
  `SUPABASE_SERVICE_ROLE_KEY` is unset, or when there are zero player emails.
- **Test-evidence note (verified, not assumed)**: `tests/api/notify-new-article.test.ts` builds
  its "platform_admin caller" fixture via `tests/mocks/caller.ts`'s `rawUser({ role:
  "platform_admin" })`, which returns `{ id, user_metadata: { role: "platform_admin" } }` —
  **still the stale pre-migration shape**. Since the route now reads
  `caller?.app_metadata?.role`, every test in that file asserting the admin-authorized (200)
  path is very likely now exercising the 403 branch instead — a directly-traced instance of the
  exact stale-mock problem flagged for the whole app. See PORTAL-GAP-017. Do not treat this
  test file's outcomes as evidence either way without independently re-checking `app_metadata`
  wiring.
- **Status**: IMPLEMENTED

### PORTAL-015 — Academy content admin CRUD
- **Category**: Content management
- **Component/Module**: `web/components/AcademyContentAdminClient.tsx`. Unchanged, re-verified
  (`user.role !== "platform_admin"` redirect check — this reads the client-side `AuthUser.role`
  field, already resolved server-side post-migration, not a raw metadata object, so it is
  unaffected by the `user_metadata`→`app_metadata` migration directly).
- **Status**: IMPLEMENTED (admin tool)

### PORTAL-016 — Geocoding API
- **Category**: Cross-cutting utility
- **Component/Module**: `web/app/api/geocode/route.ts`. Unchanged, re-verified.
- **Contract**: `POST {address}` → 400 missing; 500 not configured; 404 on non-`"OK"`
  Google status/no results; 200 `{lat, lng, formattedAddress}`. No auth/role check (by design,
  "non-fatal by design" per its own code comment) — unaffected by the RBAC migration.
- **Status**: IMPLEMENTED

### PORTAL-017 — Coach-assigned articles (documented, not implemented)
- **Category**: Coach integration (doc-only feature)
- **Re-confirmed absent**: a fresh repo-wide search for `assignArticle`/`articleAssign`/any
  "assign...article" pattern returns zero matches, same as before.
- **Status**: NOT_IMPLEMENTED

### PORTAL-018 — Public About page (NEW)
- **Category**: Public marketing content
- **Component/Module**: `web/app/about/page.tsx` (51 lines), wrapped in `LegalPageShell`.
- **Description**: static server-rendered page — mission statement, "What we do," "Who it's
  for" (coaches/academy directors vs. players/parents), and a "Get in touch" section linking
  `mailto:support@crichq.com.au` and `/contact`.
- **Access**: no auth required; reachable even when signed in (`isAlwaysPublicPage` in
  `middleware.ts`); sits outside `(dashboard)`, so no `NavBar`/`Footer`/`AuthGuard` wraps it —
  only `LegalPageShell`'s own header (logo, About/Login/Contact links) and footer
  (About/Contact/Terms/Privacy links + copyright line).
- **Content is entirely hardcoded JSX** — no CMS, no DB table, no admin-editable surface;
  changing the copy requires a code deploy.
- **Status**: IMPLEMENTED

### PORTAL-019 — Public Contact page + form (NEW)
- **Category**: Public marketing content / lead capture
- **Component/Module**: `web/app/contact/page.tsx` (80 lines), `"use client"`, wrapped in
  `LegalPageShell`.
- **Description**: a name/email/message form (all three HTML5 `required`) that `POST`s to
  `/api/contact` on submit.
- **Client behavior (exact, as coded)**: on submit, disables the button (`sending`), clears any
  prior error, awaits the fetch, and on `!res.ok || data.error` throws and displays the message
  inline; on success flips to a persistent "✓ Thanks — your message has been sent" confirmation
  screen that replaces the form (no "send another" option, unlike `MessageModal`).
- **No client-side email-format validation beyond the browser's native `type="email"`** — no
  regex/library validation layer.
- **Status**: IMPLEMENTED

### PORTAL-020 — Contact form API (NEW)
- **Category**: Communication / lead capture
- **Component/Module**: `web/app/api/contact/route.ts` (40 lines).
- **Contract (exact, as coded)**: `POST {name, email, message}` → 400 if any of the three is
  falsy; 500 `"Contact form isn't configured on this deployment."` if `GMAIL_USER`,
  `GMAIL_APP_PASSWORD`, or `PLATFORM_ADMIN_EMAIL` is unset; otherwise sends one email via the
  same Gmail/nodemailer transport pattern as PORTAL-009/014 — `from` the shared Gmail mailbox
  display-named `"CRIC HQ"`, `to: "support@crichq.com.au"` (hardcoded, not env-configurable),
  `cc: PLATFORM_ADMIN_EMAIL`, `replyTo: <visitor's submitted email>` (so a reply goes straight
  to the visitor — but note this is **user-supplied, unverified** input used directly as
  `replyTo`), subject `` `Contact form — ${name}` ``, plain-text body, and an HTML body built by
  `buildContactFormEmailHtml()` in `web/lib/email-templates.ts` (escapes `name`/`email`/
  `message` via `escapeHtml`, wraps them in the shared email `shell()` used by every other
  templated email in the app). Returns 200 `{success:true}` on send, 500 with the underlying
  error message on `sendMail()` rejection.
- **No auth required** — `pathname.startsWith("/api/contact")` is in `middleware.ts`'s
  `isAuthApi` allowlist, explicitly commented "Contact form can be submitted by a signed-out
  visitor."
- **No persistence**: unlike coach messaging (`messages` table), a contact submission is
  **never written to any database table** — its only record, if the send succeeds, is the
  email itself in `support@crichq.com.au`'s and the admin's inbox. If `sendMail()` fails after
  passing validation, the visitor sees an inline error and the submission leaves no trace
  anywhere. See PORTAL-GAP-015.
- **No rate limiting / spam protection**: no CAPTCHA, no per-IP/per-email throttling, no
  honeypot field found anywhere in the route or the client form. See PORTAL-GAP-014.
- **Status**: IMPLEMENTED

### PORTAL-021 — Public Privacy Policy page (NEW)
- **Category**: Public legal content
- **Component/Module**: `web/app/privacy/page.tsx` (103 lines), wrapped in `LegalPageShell`.
- **Description**: 9 sections — Information We Collect, Children's Information, How We Use
  Information, Who We Share Information With, Data Security & Retention, Cookies, Your Rights,
  Changes to This Policy, Contact. Names the actual third-party processors used elsewhere in
  the codebase (Stripe, Supabase, Anthropic, ClickSend, Google Maps, Gmail/Google Workspace) —
  cross-checked against this domain's own findings (Gmail/nodemailer for PORTAL-009/014/020,
  ClickSend for PORTAL-010, Google Maps for PORTAL-016) and matches.
- **"Last updated" date** is computed client-render-time via
  `new Date().toLocaleDateString("en-AU", {...})` — i.e. it always shows *today's* date on every
  page load, not a fixed policy-revision date. This means the page can never actually indicate
  when the policy text last changed; every visit displays "today."
- **Legal entity named**: "CRIC HQ PTY LTD (ABN 34 701 245 641)" — identical entity/ABN string
  also appears in `LegalPageShell` and `Footer`'s copyright lines (internally consistent).
- **Content is entirely hardcoded JSX**, same caveat as PORTAL-018.
- **Status**: IMPLEMENTED

### PORTAL-022 — Public Terms & Conditions page (NEW)
- **Category**: Public legal content
- **Component/Module**: `web/app/terms/page.tsx` (115 lines), wrapped in `LegalPageShell`.
- **Description**: 11 sections — The Service, Accounts & Eligibility, Payments &
  Subscriptions, AI-Generated Content, Acceptable Use, Intellectual Property, Termination,
  Liability, Changes to These Terms, Governing Law, Contact. Explicitly names "Player Pro" /
  "Coach Pro" subscriptions and Stripe billing, matching the Payments domain's actual plan
  names. Section 4 ("AI-Generated Content") echoes the same disclaimer text theme as the new
  global `Footer` (PORTAL-024): AI content "can make mistakes" and "is not a substitute for
  professional coaching or medical advice."
- **Same "last updated = today, always" behavior** as PORTAL-021 (identical `toLocaleDateString`
  pattern).
- **Status**: IMPLEMENTED

### PORTAL-023 — Shared `LegalPageShell` layout component (NEW)
- **Category**: UI infrastructure
- **Component/Module**: `web/components/LegalPageShell.tsx` (50 lines).
- **Description**: shared chrome for About/Contact/Privacy/Terms — a header (logo linking to
  `/login`, plus About/`/login#signin`/Contact nav links) and a footer (About/Contact/Terms &
  Conditions/Privacy cross-links + a copyright line: `` Copyright © {currentYear} CRIC HQ PTY
  LTD. All rights reserved. Design & Developed by Kaus Milestone Pty Ltd ``), wrapping a
  `<h1>{title}</h1>` and arbitrary children in a max-w-3xl centered column.
- **Note — two different "Login" targets across the app's public surface**: this shell's header
  links to `/login#signin` specifically (an anchor/tab hint), while its own logo links to plain
  `/login`. Not a bug per se, but worth noting as an inconsistency if `/login#signin` assumes a
  tabbed login page that must actually honor that hash.
- **Does not include the new global `Footer` component** (PORTAL-024) — it has its own,
  differently-styled footer with different content (legal cross-links + copyright, but no AI
  disclaimer line). A visitor moving from a public legal page into the authenticated app will
  see two visually different footers in the same session.
- **Status**: IMPLEMENTED

### PORTAL-024 — Global `Footer` component, mounted in the authenticated app (NEW)
- **Category**: UI infrastructure / compliance messaging
- **Component/Module**: `web/components/Footer.tsx` (12 lines); mounted in
  `web/app/(dashboard)/layout.tsx` between `<main>{children}</main>` and `<CoachChatWidget />`.
- **Description**: two lines — an amber AI-disclaimer (`⚠ AI-generated content can make
  mistakes. Discuss the details with a coach before acting on it.`) and a right-aligned
  copyright line identical in wording to `LegalPageShell`'s (`Copyright © {year} CRIC HQ PTY
  LTD. All rights reserved. Design & Developed by Kaus Milestone Pty Ltd`).
- **Scope — confirmed via `grep` for every importer**: mounted in exactly one place,
  `(dashboard)/layout.tsx`, meaning it now renders on **every** authenticated page across the
  whole app — `/portal`, `/portal/learn`, `/players`, `/sessions`, admin tools, everything
  inside `(dashboard)`. It does **not** render on `/about`/`/contact`/`/privacy`/`/terms`
  (outside `(dashboard)`) or on `/login`/`/signup` (also outside `(dashboard)`).
- **For this domain specifically**: every player/parent viewing `/portal` or `/portal/learn`
  now sees the AI-content disclaimer on every page load, which is directly relevant given
  `PortalClient`'s AI-generated biomechanics report summaries and `ArticleReaderClient`'s
  admin-authored (not AI-authored) Academy content — the disclaimer's wording ("AI-generated
  content") is broader than just Academy articles and applies platform-wide, not scoped to
  actual AI-output surfaces on the page it's shown on.
- **Status**: IMPLEMENTED

### PORTAL-025 — Middleware public-page allowlist for the new pages (NEW/CHANGED)
- **Category**: Access control / routing
- **Component/Module**: `web/middleware.ts` (confirmed 28-line diff area).
- **Verified current state**: two distinct allowlists now exist.
  - `isPublicPage` (pre-existing): `/login`, `/signup`, `/forgot-password`, `/reset-password` —
    a signed-in user hitting one of these (except `/signup`, which doubles as the
    additional-role-request flow) is redirected to `/players`.
  - `isAlwaysPublicPage` (**new**): `/about`, `/contact`, `/terms`, `/privacy`, `/register` —
    reachable by both signed-out and signed-in users with no redirect either way, per an
    explicit code comment: *"no reason to bounce someone reading the Terms just because
    they're logged in."*
  - `isAuthApi` gained `/api/contact` (commented "Contact form can be submitted by a
    signed-out visitor") alongside the AUTH-domain's own new entries
    (`/api/public-register-player`, `/api/complete-signup` — documented in the AUTH domain,
    noted here only for completeness per task instructions).
- **Confirmed correct**: all four new pages (`/about`, `/contact`, `/privacy`, `/terms`) and
  `/api/contact` are properly public and do not require the `SUPABASE_SERVICE_ROLE_KEY`/session
  machinery to load — verified by direct reading of the route/page source (none of them call
  `createServerClient`/`cookies()`/`auth.getUser()` except `/api/contact`'s own transport setup,
  which has no auth gate).
- **Status**: IMPLEMENTED

---


---

## PAY — Payments Core — Stripe Webhook, Cron, Invoicing, AI Coach Chat

*Source: [`domains/payments_core.md`](./domains/payments_core.md)*


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


---

