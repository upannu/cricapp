# QA Readiness Report (Fresh Pass)

Final summary for this fresh QA rebuild, superseding the prior report. Nothing in this document has been executed — every count is a design/documentation metric, not a pass/fail result.

---

## 1. Scale

| Metric | Count |
|---|---|
| Total implemented requirements | **270** (up from 194; see `docs/reverse-engineered/reverse-engineering-delta.md`) |
| Total test cases in the master suite | **275** (`docs/testing/test-cases.md`) |
| Total gaps/ambiguities logged | **77** (`docs/reverse-engineered/gaps.md`), **8 ranked Tier-1** (2 genuinely new, 6 carried-forward-unresolved) |
| Corrections made during this phase's own cross-check | 1 in Phase 1 group-work re-verification prior to the merge review; the fresh pass itself surfaced the `app_metadata` root cause independently across 5 of 6 domain agents, functioning as its own natural cross-check |

## 2. Priority Distribution

| Priority | Count | % of 275 |
|---|---|---|
| P0 (Critical) | 92 | 33% |
| P1 (Important) | 109 | 40% |
| P2 (Normal) | 69 | 25% |
| P3 (Low-risk) | 5 | 2% |

## 3. Coverage

**This is the headline finding of this fresh pass, stated plainly:** of 268 requirements matched against the test-case master list, **62 are FULL** (2+ linked test cases), **94 are PARTIAL** (exactly 1), and **112 are NONE** (zero) — see `coverage-matrix.md` for the complete per-requirement breakdown. This is a real, disclosed consequence of the constraints this fresh pass ran under (real time/rate-limit pressure across six domain agents re-analyzing a much larger requirement surface than before), not a hidden gap. It is **not** evidence the application is untested — the existing 386-test automated suite still covers a meaningful share of this surface; it means the *documentation* of that coverage, specifically the fresh requirement-to-test linkage, is thinner than the prior pass achieved, and closing the 112 NONE-coverage requirements is real follow-up work, tracked here rather than pretended away.

**Where the 112 NONE-coverage requirements concentrate:** disproportionately in Auth (server-helper functions, several signup/validation requirements) and Player (large domain, many "carried forward unchanged" requirements that didn't get a fresh test case re-authored since the prior pass's coverage was wiped in the full rewrite). See `coverage-matrix.md`'s AUTH and PLAYER sections for the exact list.

## 4. Automation

| Status | Count | % of 275 |
|---|---|---|
| `EXISTING_TEST` | 72 | 26% |
| `DESIGNED_TEST` | 203 | 74% |

**Existing automated tests actually running in this repo's CI, independent of the above:** 386 tests exist as files, but **118 of the ~345 Vitest tests are currently failing** due to the stale `user_metadata` test-mock issue (`gaps.md`'s root-cause finding) — not a real regression, but a real current-state fact: the automated suite is not green right now, and won't be until `tests/mocks/caller.ts` is updated to match the `app_metadata` migration.

## 5. Major Risks

1. **The regression gate itself is not currently green** (118 failing tests, all traceable to one stale fixture) — the single most actionable item in this whole report, and the one recommended to fix first, ahead of everything else.
2. **Two new, real Tier-1 defects**: the referral-commission currency-summing bug, and the `pack-auto-consume` cron's no-human-confirmation auto-debit.
3. **Six carried-forward Tier-1 defects remain unresolved**: unapproved-account approval bypass (re-flagged, not confirmed fixed), broken Stripe Connect onboarding, "Credit to Pack" no-op, bulk messaging never sending, webhook idempotency, plus the stale-mock root cause itself.
4. **Three brand-new subsystems shipped with zero test coverage**: the cron expansion (booking-reminders, pack-auto-consume, session-reminders), Email Templates admin, and the referral system.
5. **112 of 268 requirements have zero test-case linkage in this pass** (§3) — a documentation-coverage gap layered on top of, but distinct from, actual application risk.

## 6. Requirements Gaps

Full detail in `docs/reverse-engineered/gaps.md` (77 rows) and its Tier 1/2/3 synthesis.

## 7. Recommended Execution Order

See `execution-plan.md`. Compressed: **fix the stale test mock → Smoke → P0 → Security → everything else**, with Exploratory Charter 9 (Data Integrity) recommended early, out of its normal late sequence, specifically to hand-verify the two new Tier-1 defects quickly.

---

## 8. What DESIGNED_TEST vs EXISTING_TEST vs EXECUTED_TEST mean here

Unchanged discipline from the prior pass: `EXISTING_TEST` = a real committed test covers this (cited); `DESIGNED_TEST` = specified here, not yet automated/run; nothing is marked PASS/FAIL. Every `DESIGNED_TEST` row is implicitly `NOT_EXECUTED`.

## 9. Where This Fresh Pass Differs From the Prior One (stated plainly, not glossed over)

- **Requirement count grew 39%** (194 → 270), reflecting genuine new product surface, not scope creep in the documentation itself.
- **Test-case density per requirement dropped** — the prior pass achieved fuller per-requirement linkage in 3 of 6 domains; this pass achieved it in fewer, more constrained circumstances (§3), and required more manual gap-filling to reach even the current 62 FULL / 94 PARTIAL split.
- **Two genuinely new, real defects were found** that the prior pass could not have found (the features didn't exist yet) — a sign this fresh-analysis approach is finding real things, not just re-describing what was already known.
- **The root-cause analysis of the test-suite breakage** (`app_metadata` migration + stale mock) is new and high-value — it converts "118 mysterious failures" into "one fix, one file" for whoever picks this up next.

---

## 10. To Start Executing These Tests Manually — Exact Setup

Same environment/commands as the prior report (`web/`, `npm ci`, `npm run seed`, `npm run test`, Playwright commands, same env var list), **with one required addition before anything else**: apply the `app_metadata` fix to `web/tests/mocks/caller.ts` (or accept that ~118 tests will continue failing for a reason unrelated to what you're testing). See `test-strategy.md §0/§10` and `execution-plan.md §0` for exactly what needs to change and why.

**New test data needed beyond the prior seed** (per `test-data.md §9-10`, none of which exist in the current seed): an academy in a non-AUD currency, a Coach Pro-subscribed coach, an active referral, at least one report in each of the 3 review states, and bookings/packs/group-sessions positioned inside and outside each of the 3 new crons' action windows.

**Roles to test as:** unchanged — the 5 seeded accounts via `/login`, or the Playwright `storageState` fixtures.

**Where to record results:** same as before — set up a live execution tracker separately; do not edit these design documents to claim execution that's happening elsewhere.
