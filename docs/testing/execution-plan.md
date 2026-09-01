# Testing Execution Plan (Refreshed)

Prioritized run order for `test-cases.md`'s ~275 test cases, rebuilt against the current codebase. Same 11-group structure as the prior plan, with priorities re-derived for this merge's new Tier-1 findings. Nothing here has been executed.

---

## 0. Prerequisite, before any of the 11 groups below

**Fix `web/tests/mocks/caller.ts`'s `rawUser()` helper to build `app_metadata` instead of `user_metadata`.** This is out of scope for this document to perform (test files are not modified in this phase), but it is the single highest-leverage action available — until it's done, the existing automated suite's 118 Vitest failures will continue masking real signal underneath them. Treat this as execution-order-zero, ahead of Smoke.

## 1. Smoke

Unchanged in shape — 5-role login, dashboard/portal loads, no crashes on primary nav. **Add**: the 4 new public pages (`/about`, `/contact`, `/privacy`, `/terms`) load without error — they're the first pages a prospective customer sees, and a smoke failure there is now customer-facing in a way nothing pre-merge was.

## 2. P0 Critical

Every `P0`-tagged case, now including: the two **new** Tier-1 defect-tracking cases (`SEC-TC-003` referral currency, `SEC-TC-004` pack-auto-consume auto-debit) alongside the six carried-forward ones; every new-route authorization case (`SEC-TC-001/002/007`); the coach-subscription and report-review happy paths (`SCN-HAPPY-013/015`).

## 3. Security

Unchanged in shape — the 9 `SEC-TC-*` cases plus Exploratory Charter 8, now covering the substantially larger new-route surface this merge added.

## 4. Core Functional

Unchanged in shape — the bulk of each domain's happy-path/standard-branch coverage, now including the new subsystems' happy paths once P0/Security clear.

## 5. P1

Unchanged in shape.

## 6. Integration

Unchanged in shape, now including the new Coach Pro Stripe checkout flow.

## 7. Negative

Unchanged in shape — the 7 new `NEG-TC-*` cases plus the per-route validation cases embedded throughout the domain sections, now covering currency/cron/referral edge cases specifically.

## 8. Boundary

Unchanged in shape, now including the report-review state-transition boundaries and the booking/session-reminder time-window boundaries.

## 9. UI/UX

Unchanged in shape.

## 10. Exploratory

Unchanged in shape — 12 charters, refreshed content (`exploratory-tests.md`). **Recommend running Charter 9 (Data Integrity) early**, out of its normal late-sequence position, specifically to hand-verify the two new Tier-1 defects before anything else — this is cheap to do (a few manual DB queries) and confirms/denies the highest-stakes findings in this whole document set quickly.

## 11. Regression

**Materially blocked right now** — the existing automated suite has 118 Vitest failures stemming from the stale-mock issue (§0), so "the CI-gated suite is the regression gate" isn't true again until that's fixed. Once fixed, same principle as before: it runs continuously, not as a one-time pass in this sequence.

---

## Practical notes

- Groups 0-3 (fixture fix, Smoke, P0, Security) are the minimum viable pre-release gate for this merge specifically — do not ship past this point with an unresolved P0/Security finding, and do not consider the regression suite meaningful until §0 is done.
- Given 112 of 268 requirements currently show zero test-case coverage in this pass (`coverage-matrix.md`), groups 4-9 for this merge should be understood as "exercise what's designed" more than "confirm broad coverage already exists" — closing the NONE-coverage gap is itself a work item, tracked in `QA-readiness.md`, not assumed done by following this execution order.
- This ordering is a default, not a rule — same caveat as before.
