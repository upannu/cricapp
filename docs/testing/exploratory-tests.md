# Exploratory Testing Charters (Refreshed)

Same 12 charters as the prior pass, refreshed for this merge's new functionality. Time-box each session to 60-90 minutes; log findings as new rows in `docs/reverse-engineered/gaps.md` or `QA-readiness.md`'s risk list.

---

## Charter 1 — Authentication

**Mission:** Explore the new public self-registration (`/register`) and complete-signup flows end to end, plus the auto-approval rule for player/parent signups.

**Areas to explore:** the `/register` → later `/signup` linkage (does it actually feel connected to a real user, or is the "same email" matching fragile in practice?); what happens if a player/parent's auto-approval email-match is ambiguous (multiple `players` rows, or a near-miss like trailing whitespace); the unconfirmed-email resend flow on `/login`.

**Risks:** the `app_metadata` migration is a real security improvement, but `AUTH-GAP-001` (approval never checked server-side on some routes) was re-flagged, not confirmed fixed — this charter is one of the few ways to sanity-check it by hand before deciding whether it's still exploitable.

**Suggested attacks/actions:** try `/register` with a gating code that's almost-but-not-quite valid; try completing signup twice for the same pre-registered player; try the auto-approval path with an email that matches two different `players` rows with different guardians.

**Expected observations:** note whether the auto-approval rule ever feels like it approved the *wrong* thing, and whether an unapproved staff account can, in practice, reach anything it shouldn't via direct URL/API before a human clicks Approve.

## Charter 2 — Core Business Workflows

**Mission:** Walk the new coach-subscription and referral-commission workflows end to end, plus the report-review gate inserted into the existing report-generation flow.

**Areas to explore:** a coach subscribing to Coach Pro and immediately checking whether marketplace visibility/roster cap actually unlocked; a platform admin recording a referral and watching a commission actually appear (or not) after the monthly cron; a coach generating a report and confirming a player genuinely cannot see it until review is marked complete.

**Risks:** the referral-commission currency bug (`MKT-GAP-20`) and the report-review workflow's total lack of test coverage make this charter unusually likely to surface something real, not just UX friction.

**Suggested attacks/actions:** set up a referral for a non-AUD academy and manually verify the commission math by hand; walk the report-review flow as a coach and then immediately switch to the player's own login to confirm visibility.

**Expected observations:** any commission figure that doesn't match a hand calculation; any report a player can see before review completes.

## Charter 3 — Validation

**Mission:** Probe the new input surfaces (currency selection, Plan Catalog multi-currency pricing, Email Templates, referral creation) for validation gaps.

**Areas to explore:** every new admin form's client-vs-server validation consistency, same methodology as before.

**Suggested attacks/actions:** submit a Plan Catalog price override with a currency the UI doesn't offer, via a direct API call bypassing the dropdown; submit a referral with a negative/absurd commission percentage.

## Charter 4 — Error Handling

**Mission:** Trigger error conditions in the new subsystems and evaluate message quality and non-leakiness.

**Areas to explore:** what a coach sees if their Coach Pro checkout fails; what happens if `pack-auto-consume` hits a malformed record mid-batch (does it abort the whole run or skip and continue?); what the Contact form shows on a delivery failure.

## Charter 5 — State Transitions

**Mission:** Explore the report-review state machine and the coach-subscription/referral state machines for transitions that shouldn't be possible.

**Areas to explore:** can a report skip `under_review` entirely? Can two coaches simultaneously transition the same report in two tabs? Does ending a referral immediately stop future commission accrual, or does an in-flight cron run still count it?

**Suggested attacks/actions:** open the same report in two tabs as two different coach-role accounts and race the review transition; end a referral mid-month and check whether the next cron run pro-rates or fully excludes it.

## Charter 6 — API Failures

**Mission:** Explore frontend behavior when the new API routes (referrals, fee-tracking, currency, report-review) fail in ways the API tests don't reach.

**Suggested attacks/actions:** use devtools network throttling/blocking on the Coach Pro checkout flow, the referral creation form, and the report-review action buttons.

## Charter 7 — Integration Failures

**Mission:** Explore behavior when Stripe/Anthropic/Gmail misbehave for the new flows specifically.

**Suggested attacks/actions:** use Stripe's decline-reason test cards against the new coach-checkout route; throttle network during a report-review email send.

## Charter 8 — Security

**Mission:** Adversarially probe the new attack surface — every new route, the currency/referral money-math, and the auto-debit cron — within safe, non-destructive limits appropriate to a dev environment.

**Areas to explore:** IDOR substitution on every new route (`referrals/*`, `bookings/mark-*`, `packs/*`, `players/update-currency`, `reports/review`); whether the `app_metadata` migration is airtight (no production code path still trusts `user_metadata`); the RLS probes from `test-cases.md`'s `SEC-TC-009`, still the single highest-value unresolved unknown in the whole audit; a hand-verification of the referral-commission currency bug and the pack-auto-consume no-human-confirmation debit, personally confirming both Tier-1 findings rather than taking the domain docs' word for it.

**Suggested attacks/actions:** systematically walk every `SEC-TC-*` case in `test-cases.md` manually; specifically try to make `pack-auto-consume` debit a session it shouldn't (a genuinely cancelled session, not just an unmarked one) and see what actually happens.

**Expected observations:** every successful bypass is a P0 finding; every blocked attempt converts an `UNKNOWN` to a `CONFIRMED` in `gaps.md`.

## Charter 9 — Data Integrity

**Mission:** Independently verify the two new Tier-1 defects, and look for siblings of the same pattern elsewhere in the new subsystems.

**Areas to explore:** after a referral-commission cron run, manually query the DB and re-derive the commission figure by hand in each currency involved; after a `pack-auto-consume` run, manually verify every debited pack actually should have been debited; after a booking-reminders/session-reminders run, verify the log rows match what was actually sent, not just what was attempted.

**Expected observations:** this charter is the most likely to find a *third* Tier-1-caliber defect, given how much new automated-financial-action surface landed in one merge.

## Charter 10 — UI/UX

**Mission:** General usability pass over the new coach-subscription, referral admin, Email Templates admin, and report-review UIs.

**Areas to explore:** whether a coach genuinely understands what Coach Pro unlocks before paying for it; whether the report-review workflow's states are clear to a coach seeing them for the first time; whether the new public pages (About/Contact/Privacy/Terms) feel coherent with the rest of the brand.

## Charter 11 — Browser Compatibility

**Mission:** Same as before (still zero automated coverage), now also covering the new public pages — arguably higher-stakes than before since these are the first pages a prospective customer sees pre-signup.

## Charter 12 — Responsive Behaviour

**Mission:** Same as before, now also covering the new public pages and the global Footer, which renders on every authenticated page and so has the widest blast radius of any single new UI element if it breaks a layout at some viewport width.
