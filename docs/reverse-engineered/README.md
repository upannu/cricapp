# CricHQ / PACE HQ — Reverse-Engineered Requirements & Test Coverage (Fresh Analysis)

This is a **complete fresh reverse-engineering pass**, superseding the prior analysis (2026-08-20), produced after a 120-commit merge from `origin/master` (133 files changed) landed on the working branch. It describes **what the application does now**, sourced entirely from current code — not from the prior analysis, and not from existing tests (many of which are currently failing for reasons unrelated to the features they test — see below). No application source code or existing test file was modified to produce it.

**Start here if you're short on time:** [`reverse-engineering-summary.md`](./reverse-engineering-summary.md) (one page) → [`gaps.md`](./gaps.md) (ranked findings) → [`reverse-engineering-delta.md`](./reverse-engineering-delta.md) (what changed since last time).

---

## Document index

| File | Content |
|---|---|
| [`reverse-engineering-summary.md`](./reverse-engineering-summary.md) | One-page executive summary of this fresh pass |
| [`reverse-engineering-delta.md`](./reverse-engineering-delta.md) | Itemized before/after: new subsystems, removed pages, changed behavior, requirement-numbering continuity |
| [`architecture.md`](./architecture.md) | System overview, the `app_metadata` migration (the single most important change), component map |
| [`requirements.md`](./requirements.md) | All 270 implemented requirements, grouped by domain |
| [`business-rules.md`](./business-rules.md) | Consolidated business-rule tables per domain |
| [`workflows.md`](./workflows.md) | End-to-end decision-logic traces, with decision tables |
| [`test-cases.md`](./test-cases.md) | Test cases as authored by each fresh domain pass (233 unique, uneven density — see §4 below) |
| [`traceability.md`](./traceability.md) | Requirement → code evidence, and a requirement → test-case coverage matrix |
| [`gaps.md`](./gaps.md) | 77 gaps/ambiguities/confirmed defects, with a ranked cross-domain synthesis — **two genuinely new Tier-1 findings this pass** (referral-commission currency bug, auto-debiting cron) |
| [`testability.md`](./testability.md) | **Stale — written against the prior 194-requirement analysis, not yet refreshed against current code.** Directionally still useful (test-level strategy, mocking approach) but don't trust specific requirement/gap references in it until refreshed. |
| [`domains/*.md`](./domains/) | The six full fresh source analyses — read these for maximum detail; every file above is derived from them |

---

## 1. Executive Summary

See [`reverse-engineering-summary.md`](./reverse-engineering-summary.md) for the full version. In short: the app grew substantially (270 requirements, up from 194) with real new functionality — coach subscriptions, a referral/commission program, multi-currency support, an AI report-review gate, three new cron jobs, and a public marketing/legal web presence. The single most consequential change is a security hardening (RBAC data moved to server-only `app_metadata`), which also happens to explain nearly all of this session's test-suite breakage (a stale shared test-mock helper, not a real regression). Two genuinely new, real defects were found (a multi-currency commission-calculation bug, and a cron that auto-debits customer credits with no human confirmation); several previously-known defects were re-verified as still present.

## 2. Scope

Same as the prior analysis: every `app/api/**/route.ts` route, every page, every `components/*Client.tsx` and supporting `lib/*.ts` module, plus everything genuinely new this merge (see `reverse-engineering-delta.md`). Existing tests were read as weak evidence only, never as spec, and were neither executed nor modified during this pass.

## 3. Actors / Roles

Unchanged: `platform_admin`, `academy_admin`, `coach`, `player`, `parent` — now scoped via `app_metadata` instead of `user_metadata`. See `architecture.md §1/§3`.

## 4. Test Cases and Coverage — an honesty note

This fresh pass's test-case authoring is **measurably thinner** than the prior analysis in several domains — a direct consequence of the real constraints it ran under (two of six agents were interrupted by a session rate limit mid-research and had to be relaunched from scratch, and all six were working against a much larger requirement surface than before). Concretely: Auth went from 116 test cases (40 requirements) to 41 (55 requirements); Player from 90 (54 reqs) to ~40 (67 reqs); Marketplace from 40 (21 reqs) to 20 (41 reqs). This is disclosed here rather than hidden, and is explicitly compensated for in the Phase 2 QA documentation rebuild under `docs/testing/`, which ensures every one of the 270 requirements gets at least one designed test case regardless of what this raw reverse-engineering pass produced.

## 5. Requirement-to-Code and Requirement-to-Test Traceability

[`traceability.md`](./traceability.md) — per-domain evidence tables, plus a coverage matrix for the three domains (Auth, Player, Marketplace) whose test-case tables carry an explicit Requirement ID column. The other three (Academy/Admin, Portal/Content, Payments Core) used a condensed table format this pass too — same methodology limitation as the prior analysis, disclosed the same way.

## 6. Requirements Gaps and Ambiguities

[`gaps.md`](./gaps.md) — 77 gaps, with a ranked Tier 1/2/3 cross-domain synthesis. Read the "root cause" section at the top of that synthesis first — it explains why so much of the existing test suite is currently red without any of the underlying features actually being broken.

## 7. Risks

- **HIGH — two new, real Tier-1 defects**: the referral-commission currency-summing bug, and the `pack-auto-consume` cron's no-human-confirmation auto-debit.
- **HIGH — several previously-known Tier-1 defects remain unfixed**: unapproved-account approval bypass, broken Stripe Connect onboarding, "Credit to Pack" no-op, bulk messaging never sending, webhook idempotency.
- **MEDIUM-HIGH — three brand-new subsystems shipped with zero test coverage**: the cron expansion, Email Templates admin, and the referral system.
- **MEDIUM — test-case density gap** in this fresh pass itself (§4) — mitigated in `docs/testing/`, but worth knowing about if you go looking for exhaustive coverage in `docs/reverse-engineered/test-cases.md` specifically and don't find it.
- **Carried forward, unchanged**: RLS is still an unverified trust boundary underneath a large fraction of "authorization confirmed" claims; the two root-level planning documents are now even further from describing current reality than before.

## 8. Final Metrics

| Metric | Count |
|---|---|
| Total requirements | **270** (up from 194) |
| Requirements by domain | Auth 55 · Player 67 · Marketplace 41 · Academy/Admin 25 · Portal/Content 25 · Payments Core 57 |
| Total gaps logged | **77** (up from 72) |
| Gaps ranked Tier 1 (confirmed, severe) | **8** (2 genuinely new this pass, 6 carried forward unresolved) |
| Total unique test cases in this raw reverse-engineering pass | 233 (see §4's honesty note — this undercounts intended final coverage; see `docs/testing/test-cases.md` for the compensated master list) |
| Entirely new subsystems this merge | 11 (see `reverse-engineering-delta.md`) |
| Domains with zero-coverage new subsystems | 3 of 6 (Marketplace/referrals, Academy-Admin/email-templates, Payments-Core/crons) |

**Second-pass verification note:** unlike the prior analysis's session, this pass's highest-stakes claims (the `app_metadata` migration, the referral currency bug, the pricing-page removal) were each independently confirmed by 2+ domain agents reading different files and arriving at the same conclusion, rather than a single agent's claim taken on faith — a natural cross-check emerging from the domain split, not a separate verification step performed afterward.
