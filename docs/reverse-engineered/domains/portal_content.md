# Portal, Academy Content, Cross-Cutting Messaging & Public Marketing/Legal Pages — Reverse-Engineered Domain Spec

Scope: the player/parent-facing portal home, the Academy curriculum/learn/article system
(unlock gates, XP, badges, daily tips), cross-cutting messaging (coach→player/parent email +
SMS) and geocoding usage, **plus the brand-new public marketing/legal surface** (About,
Contact, Privacy, Terms, a shared Footer, and the Contact form's API). Reverse-engineered
directly from source in `c:\Development\Cricket\CricApp\web` **after** a 120-commit merge from
`origin/master` that, among other things, migrated all RBAC data (`role`, `approved`,
`academy_id`, `coach_id`, `player_id`, `linkedIdentities`) from Supabase `user_metadata`
(client-writable) to `app_metadata` (server-only). This document supersedes the prior
(pre-merge) version of itself in full; every claim below was re-verified against the current
source, not carried over from the old analysis or from test assertions.

**Test-evidence caveat**: existing tests are weak/historical evidence only in this pass. Where
a test's mock construction was traced and found to use the stale `user_metadata` pattern
against code that now reads `app_metadata`, that is called out explicitly (see PORTAL-GAP-017)
rather than assumed to still pass.

---

## 1. Domain Overview

**This domain is not a peripheral feature — it is the entire player/parent product, plus the
platform's only pre-auth public surface.** `web/components/AuthGuard.tsx` force-redirects any
account with `role === "player"` or `role === "parent"` to `/portal` for any pathname that does
not start with `/portal`, with one deliberate exception added since the last analysis: their own
`/players/{playerId}/subscription` page (`isOwnSubscriptionPage`, still server-enforced via
`canAccessPlayerServer`, just no longer bounced client-side before reaching it). Combined with
`NavBar.tsx`, which still renders only two links for these roles — `Academy` (`/portal/learn`)
and `Find a Coach` (`/portal/find-coach`) — the authenticated reachable surface for a player or
parent account is still exactly those page trees, **plus** the newly-added public pages, which
require no authentication at all and sit entirely outside `(dashboard)`/`AuthGuard`:

- `/portal` — dashboard home (`PortalClient.tsx`)
- `/portal/learn`, `/portal/learn/[id]` — the Academy curriculum (`AcademyLearnClient.tsx`,
  `ArticleReaderClient.tsx`)
- `/portal/find-coach` — marketplace search (owned by the Marketplace domain)
- `/about`, `/contact`, `/privacy`, `/terms` — **new**, top-level `app/` routes (siblings of
  `(dashboard)`, not children of it), reachable by anyone, signed in or not, and — unlike
  `/login`/`/signup` — never bounced away from a signed-in user either (see PORTAL-025).

There is still **no separate parent view** — the same `PortalClient`/`AcademyLearnClient`/
`ArticleReaderClient` components render for both `player` and `parent` roles, gated only by
`user.role` checks inline (PORTAL-002). Cross-cutting messaging (email via Gmail/nodemailer,
SMS via ClickSend) is still coach/admin → player-record only — there is no in-portal UI for a
player or parent to send a message, and the new Contact page's messaging (visitor → CRIC HQ
support) is architecturally unrelated (different table-less delivery path, different audience).

Geocoding (`/api/geocode`, Google Geocoding API) is unchanged and remains cross-domain
plumbing, documented here only because the task scope names it.

### What's new in this merge, at a glance
- Four new public, unauthenticated marketing/legal pages (About, Contact, Privacy, Terms),
  sharing one new layout component (`LegalPageShell`).
- A new `Footer` component, mounted globally inside the **authenticated** `(dashboard)` layout
  (every player/parent/coach/admin page now shows a persistent AI-disclaimer + copyright
  footer that didn't exist before).
- A new public Contact form + `/api/contact` route that emails `support@crichq.com.au`
  (cc'd to `PLATFORM_ADMIN_EMAIL`) via the same Gmail/nodemailer transport as PORTAL-009/014,
  using the newer `web/lib/email-templates.ts` HTML-shell system for the notification's HTML
  body.
- `middleware.ts` grew an `isAlwaysPublicPage` allowlist (`/about`, `/contact`, `/terms`,
  `/privacy`, `/register`) distinct from the pre-existing `isPublicPage` set (`/login`,
  `/signup`, `/forgot-password`, `/reset-password`) — the new pages stay visible to a
  signed-in user, unlike the auth pages which bounce a logged-in visitor to `/players`.
  `/api/contact` was added to the auth-exempt API allowlist alongside it.
- `notify-new-article`'s admin-role check now reads `caller?.app_metadata?.role` instead of
  the pre-migration `user_metadata` field — the one concrete RBAC-migration touchpoint inside
  this domain's own route code (confirmed via the "2 lines changed" diff called out in the
  task). `confirm-consent`'s role/`player_id` derivation was **already** on `app_metadata` and
  needed no change here (documented for completeness, primarily an AUTH-domain finding).
- The core gamified reading loop (unlock gates, XP, badges, tip streak), the messaging stack
  (`MessageModal`/`BulkMessageModal`/`PlayerMessages`), `academy-content.ts`, `badges.ts`,
  `sms.ts`, and `messages-store.ts` are **functionally unchanged** — every business rule and
  every previously-found bug (AcademyLearnClient's infinite spinner, BulkMessageModal never
  actually sending) was re-verified line-by-line against current source and still reproduces
  exactly as before. `web/lib/db.ts`'s `fetchMessages` now carries an explicit
  `.order("date", { ascending: false })` that the prior analysis could not confirm from the
  excerpt it read — this is now a confirmed, not inferred, ordering guarantee.

### High-level architecture (unchanged from prior analysis, re-verified)
- **Article curriculum**: `articles` table, `fetchArticles()` (published-only) /
  `fetchAllArticlesForAdmin()` (all).
- **Unlock/XP rules**: `web/lib/academy-content.ts`, shared by the reading UI and
  `recordArticleRead` (`db.ts`).
- **Badges**: computed on the fly (`web/lib/badges.ts`), nothing stored as "earned."
- **Daily tips**: `daily_tips` table; streak fields live on `players`.
- **Messaging**: `messages` table is a delivery-log, not a queue; actual delivery is via
  `/api/send-message` / `/api/send-sms`, called *before* `insertMessage()` logs the send.
- **NEW — public content**: no table at all. About/Privacy/Terms are static server-rendered
  JSX (no CMS, no DB read). Contact is a stateless mailer — a submission's only persisted
  trace, if any, is in the recipient's inbox; nothing is written to Supabase.

---

## 2. Implemented Requirements

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

## 3. Business Rules

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

## 4. Key Workflows (Decision Logic)

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

## 5. Requirement-to-Code Traceability

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

## 6. Test Cases

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

## 7. Test Case Tags

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

## 8. Existing Test Coverage vs Recommended

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

## 9. Gaps and Ambiguities

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
