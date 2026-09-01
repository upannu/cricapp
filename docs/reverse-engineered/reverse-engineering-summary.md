# Reverse-Engineering Summary — Fresh Analysis

One-page executive summary of this fresh pass. For detail: [`architecture.md`](./architecture.md) (system overview), [`reverse-engineering-delta.md`](./reverse-engineering-delta.md) (itemized before/after), [`requirements.md`](./requirements.md) (all 270 requirements), [`gaps.md`](./gaps.md) (65 gaps, ranked).

---

## Why this pass happened

The prior `docs/reverse-engineered/` analysis (2026-08-20) described a codebase that, by the time anyone tried to rely on it, was 120 commits and 133 changed files out of date. A merge of `origin/master` into the working branch surfaced this concretely: 118 of 345 Vitest tests began failing, and typecheck produced ~25 new errors. Rather than patch the old documentation, the whole reverse-engineering exercise was redone from scratch against current source, with the old documentation demoted to "historical reference only, verify everything."

## What's actually true about the app right now

CricHQ is a live cricket fast-bowling coaching platform (Next.js/Supabase/Stripe/Anthropic) that has grown substantially since the last analysis. **270 requirements** are now documented across 6 domains (up from 194), reflecting real new product surface: coaches can now buy their own subscription and refer new business for commission; multi-currency support means the platform can genuinely serve non-Australian customers; AI reports now go through a coach-review gate before a player sees them; three new scheduled jobs (including one that auto-debits session-pack credits with no human confirmation) run daily/hourly; and four new public pages plus a contact form give the product a real pre-signup web presence for the first time.

**The single most important change** is architectural, not feature-shaped: RBAC identity data moved from a client-writable Supabase field (`user_metadata`) to a server-only one (`app_metadata`), closing a real privilege-escalation vector. This one change also explains nearly all of the test-suite breakage that triggered this whole re-analysis — the shared test-mock helper was never updated to match, so dozens of tests now fail for a reason that has nothing to do with the features they're meant to test.

## What's genuinely concerning

Two new, real defects were found this pass that didn't exist before because the features themselves are new: the referral-commission cron sums revenue across different currencies with no conversion and reports it as a flat AUD figure, and the new `pack-auto-consume` cron automatically debits a paying customer's session-pack credit with no human confirmation step. Both are documented as Tier-1 findings in `gaps.md`. Several previously-known defects (the "Credit to Pack" no-op, bulk messaging never sending, the broken Stripe Connect onboarding, webhook idempotency) were re-verified against current source and confirmed still present, unfixed.

Three brand-new subsystems — the cron expansion, the Email Templates admin panel, and the referral system — shipped with **zero automated test coverage**, a pattern worth addressing before they see more real usage.

## What this pass explicitly does not claim

Per this phase's own rules: nothing was executed, nothing is marked pass/fail, no application code or existing test was touched, and behavior that couldn't be confirmed by reading source alone is labeled `REQUIRES VALIDATION` rather than asserted. Test-case density in this fresh pass is measurably thinner than the original analysis in places (see `QA-readiness.md`'s honesty note) — a consequence of the real time/rate-limit pressure this pass ran under, disclosed rather than hidden, and compensated for in the Phase 2 QA rebuild.

## Where to go next

If you read one more file after this: `gaps.md`, for the ranked list of what actually needs a human decision before the next release. If you're about to start manual testing: `docs/testing/QA-readiness.md`, or the standalone `docs/QA-Manual-Testing-Guide.docx`.
