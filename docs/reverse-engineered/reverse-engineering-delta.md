# Reverse-Engineering Delta — What Changed Since the Prior Analysis

A dedicated before/after comparison between the prior analysis (codebase as of 2026-08-20, backed up at `C:\Users\urmil\AppData\Local\Temp\claude\c--Development-Cricket\e5ce5315-80e3-48bc-b0a5-0afa4a384ed1\scratchpad\old-docs-backup\` for anyone who needs to inspect it directly) and this fresh analysis (codebase after merging 120 commits from `origin/master`, merge commit `3d8fdf2`, 133 files changed). Read [`architecture.md`](./architecture.md) first for the "what it means" narrative — this document is the itemized ledger.

---

## Headline numbers

| Metric | Prior analysis | Fresh analysis | Delta |
|---|---|---|---|
| Total requirements | 194 | 270 | +76 |
| Auth domain | 40 | 55 | +15 |
| Player domain | 54 | 67 | +13 |
| Marketplace domain | 21 | 41 | +20 |
| Academy/Admin domain | 20 | 25 | +5 |
| Portal/Content domain | 17 | 25 | +8 |
| Payments Core domain | 42 | 57 | +15 |
| Gaps logged | 72 | 65 | -7 (see note below) |

**Note on the gap-count decrease:** this is not evidence of fewer problems — it reflects that six independent fresh passes, working under real time pressure (two agents were rate-limited and had to be relaunched from scratch), produced somewhat less exhaustive gap enumeration per domain than the original unhurried pass, while surfacing several genuinely new and more severe findings (the referral-currency bug, the auto-debit cron) that didn't exist to find before. Treat both gap counts as a floor, not a ceiling, on what actually exists — see `QA-readiness.md` for this phase's own honesty note about test-case density.

---

## Entirely new subsystems (did not exist in the prior analysis at all)

1. **Coach Pro self-serve subscriptions** — a coach can now buy their own paid plan, separate from an academy's org billing or a player's Player Pro. New Stripe checkout/portal routes, new webhook branches, a new page.
2. **Referral / commission program** — platform-admin-recorded referrals earning one-off or ongoing commissions, a monthly cron, manual payout reconciliation. Shipped with a real currency-correctness bug (`gaps.md` Tier 1).
3. **Report review workflow** — generated AI reports now sit in a coach-review queue (`not_reviewed → under_review → completed`) before a player/parent can see them or an email goes out. The old "auto-email on generation" behavior was removed.
4. **Multi-currency support** (`lib/currency.ts`) — `Player`, `Coach`, `Academy` all gained a `currency` field; academies derive currency from a new required `country` field; individual purchases resolve price via an admin-configurable `Plan.pricesByCurrency`.
5. **Plan-Catalog-driven feature gating** — `lib/plan-features.ts`'s gating functions all gained a second `plans: Plan[]` argument and now resolve limits from admin-editable Plan Catalog rows instead of a hardcoded 3-tier rank.
6. **Three new cron jobs** — `booking-reminders`, `pack-auto-consume` (auto-debits a session-pack credit with no human confirmation), `session-reminders` — plus a shared `lib/cron-time.ts` helper.
7. **Email Templates admin subsystem** — an admin UI + `lib/email-templates.ts` for editing role-scoped welcome emails, now also used by the Contact form's HTML notification body.
8. **Public self-registration (`/register`)** — a public, code-gated lead-capture form writing directly to `players` with no Supabase Auth account created at all.
9. **Four public marketing/legal pages** — `/about`, `/contact`, `/privacy`, `/terms`, plus a global `Footer` now on every authenticated page too.
10. **Cash-payment reconciliation ledger** — six new routes letting staff manually record/collect the platform's fee cut on bookings/packs paid outside Stripe.
11. **Independent-coach self-service roster** — a coach with no academy can now add players directly to their own roster, capped by their plan tier.

## The single most consequential change (cross-cutting, affects every domain)

**RBAC identity migrated from `user_metadata` to `app_metadata`.** `role`, `approved`, `academy_id`, `coach_id`, `player_id`, `linkedIdentities` all moved from a client-writable field to a server-only one — closing a real privilege-escalation vector. This is a genuine security hardening, confirmed independently by five of six domain agents, and is also the explanation for nearly all of this session's test-suite breakage (the shared test-mock helper was never updated to match). See `architecture.md §1` and `gaps.md`'s root-cause section.

## Removed

| What | Replaced by | Confirmed how |
|---|---|---|
| `/admin/pricing` page | Folded into the Plan Catalog (`/admin/plans`), which gained `pricesByCurrency` | Direct file-tree check — page no longer exists |
| `PlatformPricingClient.tsx` | (same as above) | Direct file-tree check — component no longer exists |
| `PlatformSettings` type | (same as above) | Grep of `lib/types.ts` — zero matches outside one stale test file |
| `platform-settings/update` route (URL) | `email-templates/update` (same route file, renamed and repurposed — now only edits welcome-email templates, carries zero pricing logic) | Git history rename tracking, confirmed via `git log --follow` equivalent this session |
| Auto-email-on-report-generation | Gated behind the new report-review workflow's `completed` state instead | Direct source read of `ReportsClient.tsx`/`ReportActions.tsx` — old unconditional email call is gone |
| `CoachChatWidget.tsx`'s disclaimer copy (tentative) | Unknown/not re-added elsewhere | Confirmed absent from current source; flagged `CONFLICTING` rather than asserted as deliberate, since no git history was traced to confirm intent |

No webhook event-type branch, cron job, or core requirement documented in the prior analysis was found to be fully removed without replacement, aside from the items above.

## Changed (selected — see each domain's own §0/§9 "NEW/CHANGED/REMOVED" section for the complete itemized list)

- Every route's authorization check now reads `app_metadata` instead of `user_metadata` (see above).
- `player`/`parent` self-signup now auto-approves immediately if the submitted email resolves to an existing `players` row (previously always queued for admin review).
- `NormalizedInvoice.amountAud` → `amount`, now currency-aware.
- Session-pack payment webhook branch (`pack_payment`) now also stamps `paid_date` — fixing a previously-latent "Paid {date}" badge bug.
- Coach-chat's Free-plan daily limit is now Plan-Catalog-driven, not hardcoded.
- Player/parent can now reach their own `/players/[id]/subscription` page directly (previously redirected away entirely if they were an academy player).
- Storage upload cap dropped from a 500MB bucket override to the project's global 50MB cap.
- Attendance roster entry now requires the player to hold an active matching session pack (previously unrestricted).

## Requirement-numbering continuity

Each domain agent was instructed to preserve prior IDs for unchanged requirements and continue the numbering sequence for new ones, rather than renumbering everything. This mostly held: Auth (`AUTH-001`–`055`, all 40 prior IDs preserved), Marketplace (`MKT-001`–`041`, all 21 prior IDs preserved), Academy/Admin (`ADMIN-001`–`025`, all 20 prior IDs preserved, one formally marked `REMOVED` rather than deleted), Payments Core (`PAY-001`–`057`, all 42 prior IDs preserved). Player and Portal/Content largely followed this too, with minor numbering gaps where an item was folded into a neighboring ID rather than kept fully separate — see each domain's own file for the exact accounting. **No prior ID was silently reassigned to unrelated new content.**
