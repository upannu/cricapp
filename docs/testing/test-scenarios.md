# Master Test Scenarios (Refreshed)

Rebuilt against the fresh 270-requirement analysis. Scenarios carried forward from the prior pass are noted as such (still valid, feature unchanged); most content below is new, reflecting the merge's new functionality. IDs: `SCN-<CATEGORY>-###`, continuing the numbering from the prior pass where a scenario is genuinely a continuation, using fresh numbers for new ground.

---

## 1. Happy Paths

| ID | Scenario | Refs | Priority |
|---|---|---|---|
| SCN-HAPPY-001–012 | All prior happy paths (signup→approval, session logging, report generation, subscription upgrade, marketplace booking, academy billing, article reading, coach-chat, booking completion, guardian consent, plan-catalog edit, group-session attendance) — carried forward, re-verified as still structurally valid against current source, with two now gated by new behavior: HAPPY-001 (signup) must account for the new player/parent auto-approval rule; HAPPY-003 (report generation) must now continue through the coach-review gate before the report is player/parent-visible. | Prior pass + `AUTH-047`, `PLAYER-061/062` | P0 |
| SCN-HAPPY-013 | Coach subscribes to their own Coach Pro plan via real Stripe Checkout, webhook lands, marketplace visibility/roster cap unlocks | MKT-022–030 | P0 |
| SCN-HAPPY-014 | Platform admin records a new referral (ongoing commission type), the monthly cron computes a commission, admin marks the payout paid | MKT-031–037 | P1 |
| SCN-HAPPY-015 | Coach completes review of a generated report (not_reviewed → under_review → completed); player/parent can now see it and receive the email | PLAYER-061/062 | P0 |
| SCN-HAPPY-016 | Independent coach (no academy) adds a new player directly to their own roster, within their plan's cap | PLAYER-056 | P1 |
| SCN-HAPPY-017 | Player/coach selects a non-AUD currency; checkout resolves the correct `pricesByCurrency` amount | PLAYER-060, MKT (currency) | P0 |
| SCN-HAPPY-018 | Visitor submits the public Contact form; support inbox receives the email | PORTAL-021 (contact) | P1 |
| SCN-HAPPY-019 | Visitor completes public `/register` self-registration; a `players` row is created with no Auth account; the same person later signs up normally at `/signup` with the same email and gets linked | AUTH-042–045 | P1 |
| SCN-HAPPY-020 | Staff records a cash/bank-transfer payment on a booking (`mark-paid`) and separately reconciles the platform's fee cut (`record-fee-due` → `mark-fee-collected`) | MKT (fee-tracking routes) | P1 |

## 2. Negative Paths

| ID | Scenario | Refs | Priority |
|---|---|---|---|
| SCN-NEG-001–012 | All prior negative paths — re-verified structurally valid; SCN-NEG-011/012 (Credit-to-Pack and bulk-message no-ops) re-confirmed as **still reproducing identically** against current source, per `gaps.md` Tier 1. | Prior pass | P0 |
| SCN-NEG-013 | Report viewed by player/parent while still `not_reviewed`/`under_review` → not visible, no error leak of the unreviewed content | PLAYER-062 | P0 |
| SCN-NEG-014 | Referral commission cron runs against a mix of AUD and non-AUD academies → **currently produces a silently wrong flat-AUD figure (confirmed defect, MKT-GAP-20)**; scenario exists to track/regress this | MKT-GAP-20 | P0 (defect-tracking) |
| SCN-NEG-015 | `pack-auto-consume` runs against a player with no active pack → no-ops cleanly, does not create a phantom negative-balance draw-down | PAY (pack-auto-consume) | P1 |
| SCN-NEG-016 | Checkout attempted with an unsupported/malformed currency code → rejected, not silently defaulted to AUD without the user knowing | Currency (cross-domain) | P1 |
| SCN-NEG-017 | `create-checkout-session` (player-facing) still accepts `plan: "Coach Pro"` for a `playerId` — **confirmed reachable dead path (MKT-GAP-14)**; scenario documents current behavior until resolved | MKT-GAP-14 | P2 (defect-tracking) |

## 3. Validation

| ID | Scenario | Refs | Priority |
|---|---|---|---|
| SCN-VAL-001–009 | Prior validation scenarios — re-verified structurally valid. | Prior pass | P1-P2 |
| SCN-VAL-010 | Plan Catalog edit form validates `pricesByCurrency` entries (non-negative, correct currency keys) | ADMIN (plan catalog) | P1 |
| SCN-VAL-011 | Email Templates admin form validates required template fields before save | ADMIN-023 | P2 |
| SCN-VAL-012 | `/register` public form validates required fields and the gating code before accepting a submission | AUTH-042–045 | P1 |

## 4. Boundary Conditions

| ID | Scenario | Refs | Priority |
|---|---|---|---|
| SCN-BOUND-001–010 | Prior boundary scenarios (session limits, unlock gates, XP bonuses, pose-detection threshold) — re-verified structurally valid, now sourced from the Plan Catalog rather than hardcoded constants (verify the *value* still matches, not just the mechanism). | Prior pass, PLAYER (plan-features rewrite) | P0-P2 |
| SCN-BOUND-011 | Independent-coach roster cap at exactly the cap vs. one over | PLAYER-056 | P1 |
| SCN-BOUND-012 | Booking/session-reminder cron's "0–3 hours before" window — a booking exactly at the 3-hour boundary vs. 3h01m | PAY (booking-reminders, session-reminders) | P1 |
| SCN-BOUND-013 | Report-review state transitions at each edge (not_reviewed→under_review, under_review→completed) | PLAYER-061 | P0 |

## 5. Business Rules

| ID | Scenario | Refs | Priority |
|---|---|---|---|
| SCN-BR-001–008 | Prior business-rule scenarios — re-verified structurally valid. | Prior pass | P0-P1 |
| SCN-BR-009 | Marketplace access, AI report generation, and session/chat limits are now determined by the admin-editable Plan Catalog row, not a hardcoded 3-tier rank — editing a plan's `marketplaceEnabled`/`aiReportsEnabled` flag immediately changes gating for every player on that plan | PLAYER/MKT (plan-features rewrite) | P0 |
| SCN-BR-010 | An academy's currency is fixed at creation from its `country` and cannot later be changed while a Stripe Connect payout relationship exists (per ADMIN-022) | ADMIN-022 | P1 |
| SCN-BR-011 | Pack-funded booking completion still does not consume the subscription session quota — re-verify this rule survived the merge unchanged | PLAYER (session completion) | P0 |

## 6. Authentication

| ID | Scenario | Refs | Priority |
|---|---|---|---|
| SCN-AUTHN-001–007 | Prior authentication scenarios — re-verified structurally valid, now against `app_metadata`. | Prior pass | P0-P1 |
| SCN-AUTHN-008 | Player/parent self-signup auto-approves immediately when the submitted email resolves to an existing player — confirm the exact match logic (case sensitivity, whitespace) | AUTH-047 | P1 |
| SCN-AUTHN-009 | `/register` submission followed by a normal `/signup` with the same email correctly links the two, by email match only (per AUTH-GAP-015, a known-loose linkage mechanism) | AUTH-042–045, AUTH-GAP-015 | P1 |

## 7. Authorization

| ID | Scenario | Refs | Priority |
|---|---|---|---|
| SCN-AUTHZ-001–008 | Prior authorization scenarios — re-verified structurally valid, now against `app_metadata`. **SCN-AUTHZ-004 (unapproved account bypass) remains an open, unresolved risk per this pass's re-flagging of AUTH-GAP-001 — retest, do not assume fixed.** | Prior pass, AUTH-GAP-001 | P0 |
| SCN-AUTHZ-009 | A coach cannot access another coach's Coach Pro subscription/billing portal | MKT (coach subscription) | P0 |
| SCN-AUTHZ-010 | Only a platform admin can create/end a referral or mark a payout paid | MKT (referrals) | P0 |
| SCN-AUTHZ-011 | Only a coach/admin (not the player/parent) can transition a report's review status | PLAYER-061 | P0 |

## 8. Security

| ID | Scenario | Refs | Priority |
|---|---|---|---|
| SCN-SEC-001–007 | Prior security scenarios (IDOR sweep, unapproved-account bypass, RLS probes, injection sweep, session invalidation) — re-verified structurally valid, still unexecuted. | Prior pass | P0 |
| SCN-SEC-008 | The new public `/api/contact` endpoint accepts unlimited, unauthenticated submissions with no rate limiting — confirmed exploitable for a mail-bombing/spam vector against the support inbox | PORTAL-GAP-014 | P1 |
| SCN-SEC-009 | IDOR sweep extended to every new route: `referrals/*`, `bookings/mark-*`/`record-fee-due`, `packs/*`, `players/update-currency`, `players/linked-names`, `reports/review` | Cross-domain, new routes | P0 |
| SCN-SEC-010 | Confirm the shared test-mock helper's `user_metadata`→`app_metadata` gap does not have a live-code analog — i.e., no production code path still reads the old field as a fallback that could be exploited | Root cause finding, `gaps.md` | P1 |

## 9. Error Handling

| ID | Scenario | Refs | Priority |
|---|---|---|---|
| SCN-ERR-001–007 | Prior error-handling scenarios — re-verified structurally valid. | Prior pass | P1-P2 |
| SCN-ERR-008 | `pack-auto-consume` encountering a malformed/missing session-pack record mid-run — does it skip that one record and continue, or abort the whole batch? | PAY-GAP-016 | P0 |
| SCN-ERR-009 | Currency-resolution failure (unsupported currency, missing `pricesByCurrency` entry) during checkout — clean error, not a silent AUD fallback the user doesn't expect | Currency (cross-domain) | P1 |

## 10. State Transitions

| ID | Scenario | Refs | Priority |
|---|---|---|---|
| SCN-STATE-001–007 | Prior state-transition scenarios — re-verified structurally valid. | Prior pass | P0-P1 |
| SCN-STATE-008 | Report review: `not_reviewed → under_review → completed`, and confirm no UI path skips `under_review` or reverses from `completed` | PLAYER-061 | P0 |
| SCN-STATE-009 | Coach subscription: not-subscribed → active → cancelled, mirroring the existing player-subscription state machine | MKT-022–030 | P1 |
| SCN-STATE-010 | Referral: active → ended, and confirm an ended referral stops accruing new ongoing commissions | MKT (referrals) | P1 |

## 11. Database Behaviour

| ID | Scenario | Refs | Priority |
|---|---|---|---|
| SCN-DB-001–005 | Prior DB-behavior scenarios — re-verified structurally valid. | Prior pass | P0-P2 |
| SCN-DB-006 | Confirm `booking_reminder_log` actually exists as a table in the live dev DB (undocumented in this repo's schema notes — `PAY-GAP-013`) | PAY-GAP-013 | P0 |
| SCN-DB-007 | Confirm every new column this merge requires (`players.currency`, `academies.country`/`currency`, `reports.review_status`, `plans.*`) actually exists in the dev DB before any dependent test runs | `test-strategy.md §6/§19` | P0 |

## 12. API Behaviour

| ID | Scenario | Refs | Priority |
|---|---|---|---|
| SCN-API-001–003 | Prior API-behavior scenarios — re-verified structurally valid. | Prior pass | P0-P1 |
| SCN-API-004 | Every new route's documented status-code contract holds (referrals, fee-tracking, currency, report-review, coach-subscription routes) | Cross-domain, new routes | P0-P1 per route |

## 13. External Integrations

| ID | Scenario | Refs | Priority |
|---|---|---|---|
| SCN-EXT-001–008 | Prior integration scenarios — re-verified structurally valid. | Prior pass | P0-P2 |
| SCN-EXT-009 | Real Stripe Checkout for the new Coach Pro coach-subscription product completes end-to-end in test mode | MKT (coach subscription) | P0 |
| SCN-EXT-010 | Email Templates admin's edited template content actually renders in the real outgoing email (welcome email, contact notification) | ADMIN-023, PORTAL-021 | P1 |

## 14. Retry/Failure Behaviour

| ID | Scenario | Refs | Priority |
|---|---|---|---|
| SCN-RETRY-001–004 | Prior retry/failure scenarios — re-verified structurally valid. | Prior pass | P0-P1 |
| SCN-RETRY-005 | `pack-auto-consume` or `booking-reminders`/`session-reminders` invoked twice in immediate succession (simulating a cron double-fire) — confirm no double-debit/double-notification | PAY (new crons) | P0 |

## 15. UI Behaviour

| ID | Scenario | Refs | Priority |
|---|---|---|---|
| SCN-UI-001–005 | Prior UI scenarios — re-verified structurally valid. | Prior pass | P1-P2 |
| SCN-UI-006 | Report-review status badge/UI correctly reflects the current state to a coach; a player/parent sees no trace of an unreviewed report | PLAYER-061/062 | P0 |
| SCN-UI-007 | The new global Footer renders consistently across every authenticated page without layout breakage | PORTAL (Footer) | P2 |

## 16. Accessibility

Not audited by any pass to date — same gap as before, now also applying to the 4 new public pages, the Footer, and the referral/email-templates admin UIs, none of which have been reviewed for WCAG/ARIA compliance.

## 17. Browser Compatibility

Same zero-coverage gap as before (§9 of `test-strategy.md`), now also applying to the new public pages (About/Contact/Privacy/Terms) which are the first pages in the app a prospective customer might see pre-signup — arguably higher-stakes for cross-browser correctness than authenticated-only pages.

## 18. Responsive Behaviour

Same zero-coverage gap as before, now also applying to the new public pages and the global Footer.

## 19. Performance-Sensitive Areas

| ID | Scenario | Refs | Priority |
|---|---|---|---|
| SCN-PERF-001–004 | Prior performance scenarios — re-verified structurally valid. | Prior pass | P1-P2 |
| SCN-PERF-005 | `pack-auto-consume`'s daily batch run time as the player base grows — currently a single cron invocation processing all agreed recurring-session days; no test exercises this at scale | PAY (pack-auto-consume) | P2 |

## 20. Regression

Same principle as before: the regression set is the P0/P1/Security/defect-tracking subset of the above, re-run on every change. See [`execution-plan.md`](./execution-plan.md). **Note:** the existing automated regression suite is not currently green (118 Vitest failures from the stale test-mock issue) — fixing that fixture is a prerequisite for this regression strategy meaning anything in practice, per `test-strategy.md §17`.
