# PACE HQ — B2B Platform Specification
### Academies · Clubs · Cricket Boards

> Draft spec for the quote-based institutional pricing model. Companion to `PACE_HQ_Complete_Project_Documentation.md`.

---

## 1. What changes from the current B2B model

The platform already has a working B2B billing path (built and verified this session): a fixed catalog of self-serve org licenses — 12-bowler and 20-bowler club tiers, a Cricket Board tier — each with a published price, purchased instantly through real Stripe Checkout from `/academies/[id]/billing`.

This spec replaces that self-serve, fixed-price model with a **quote-based, sales-led model** for B2B:

- **No published pricing.** An academy, club, or board never sees a price on the website. There is no "Subscribe" button that charges a card on the spot.
- **Price is quoted per institution**, driven primarily by player/bowler count, and set by a platform admin (or eventually a sales team) after a conversation with the prospect.
- **B2C stays exactly as it is** — Player Pro, Coach Pro, Library, and Individual Assessment remain published, self-serve, card-charged products. This spec only changes how *organizations* buy.

---

## 2. Target customers

| Segment | Typical size | Who initiates contact |
|---|---|---|
| District/premier club | 10–50 bowlers | Inbound (club approaches PACE HQ) |
| Regional academy | 50–150 bowlers | Inbound or PACE HQ outbound |
| State pathway academy | 150–400 bowlers | Usually PACE HQ outbound, anchor-client sales motion |
| Cricket board (state/national) | 400+ bowlers, multiple affiliated clubs | Direct relationship, multi-stakeholder sales process |

---

## 3. Pricing approach

### 3.1 No upfront price, but a real internal reference model

Sales-led doesn't mean ad-hoc. Quote consistently off an internal, unpublished reference table so pricing stays fair and defensible across deals. Suggested starting point (carried over from the existing catalog, now used as an *internal floor/reference*, not a public price):

| Player/bowler count | Reference monthly rate | Notes |
|---|---|---|
| Up to 15 | ~$1,500/mo | Roughly the existing 12-bowler tier's rate, rounded |
| 16–25 | ~$2,000–2,500/mo | Existing 20-bowler tier's rate as the floor |
| 26–50 | ~$3,500–5,000/mo | Extrapolated per-player rate, volume discount applied |
| 51–150 | Custom — per-player rate declines with volume | Requires a real conversation; roster composition (how many are actively bowling vs squad depth) matters |
| 150+ (board-scale) | Custom, annual contract, typically $50K–150K+/yr | Matches the existing Cricket Board tier's scale; may bundle in-person visits, monitoring windows, or coach certification as negotiated line items |

This table is a **starting point for the person preparing the quote**, not a rate card shown to the customer. Actual quotes can and should deviate based on relationship, contract length, bundled services (e.g. an in-person visit, as already modeled for the board tier), and competitive context.

### 3.2 What a quote can vary

- Monthly or annual billing
- Player/bowler seat cap (and what happens if they exceed it mid-contract — renegotiate, not auto-block)
- Included professional services (onboarding, an in-person visit, custom AI model tuning — all listed as options in the wider strategy doc's Tier 2–4 breakdown)
- Contract length and renewal terms
- Multi-year discounts

---

## 4. The quote-to-contract workflow

```
1. Lead comes in (inbound form, outbound sales conversation, or referral)
   → captured somewhere trackable (CRM, or at minimum a lead-intake table)

2. Conversation / discovery
   → player count, coach count, current tools, what they actually need
   → NOT a self-serve flow — a human always talks to the prospect first

3. Platform admin prepares a quote
   → price, seat cap, contract length, included services
   → this is where the internal reference table (3.1) gets applied and adjusted

4. Quote sent externally (PDF/email — outside the app, at least initially)
   → negotiation happens here, same as any enterprise sale

5. Contract agreed
   → platform admin creates/updates the academy's org-level billing record
     with the NEGOTIATED terms (not a catalog plan pick)
   → seat cap, price, and billing interval are whatever was agreed,
     not constrained to the old fixed tiers

6. Billing goes live
   → invoiced (bank transfer / Stripe Invoice) rather than card-charged
     self-serve checkout, matching how institutions actually prefer to pay
   → academy_admin account created/approved, players and coaches onboarded
```

This is a genuine change from "instant self-serve checkout" to "assisted onboarding after a signed agreement" — slower per deal, but appropriate for five- and six-figure annual contracts where the buyer expects a relationship, not a card form.

---

## 5. What needs to be built (gap against the current system)

The existing Plan Catalog (`plans` table + `/admin/plans`) only supports **fixed, published** tiers — every academy on "Academy License - 12 Bowlers" pays exactly the same $1,500/mo. It does not currently support a negotiated, per-institution price. To support this spec:

1. **A "custom" billing path per academy**, separate from picking a catalog plan — a platform admin enters the specific price, seat cap, and interval agreed for *that* academy, stored directly on the academy's billing record rather than referencing a shared `plans` row.
2. **Stripe Invoicing instead of (or alongside) Checkout** — for contracts paid by bank transfer/PO rather than card, using Stripe's Invoice API rather than the Checkout Sessions the self-serve flow uses today.
3. **A lead-intake surface** — even a simple form or admin-entered record — so inbound interest doesn't just arrive by email with nothing tracked in the system.
4. **Removing/hiding the self-serve "Subscribe" flow for organizations** — the `/academies/[id]/billing` page's card-based Checkout button either goes away for org accounts or becomes secondary to "Request a Quote."

None of this is built yet — this document is the spec to build against, not a description of current behavior. The B2C side (Player Pro, Coach Pro, Library, Individual Assessment) is unaffected and stays self-serve.

---

## 6. Feature set (unchanged from current product)

B2B customers get the same product B2C players and their coaches use — there is no separate feature set today, only a different pricing/billing wrapper around it:

- AI biomechanics analysis (single side-angle, MediaPipe-based) + PDF reports
- Coach dashboard: video annotation, voice notes, assessments, action plans
- Player profiles, longitudinal progress tracking, XP/badges
- S&C log, RPE tracking
- Academy content library (4-stage curriculum)
- Guardian/parent portal, multi-role access (admin/coach/player/parent)

Institution-specific extras (white-label reports, feature tiers tied to contract level, coach certification, cross-academy benchmarking) are tracked separately as roadmap gaps — see the earlier gap analysis against `PACE_HQ_Bowling_Platform_Master.md`.

---

## 7. Open questions before building

- Who prepares quotes day-to-day — just the platform admin (you), or will this need a lightweight CRM/lead-tracking surface sooner than expected?
- Is Stripe Invoicing (bank transfer, net-30 terms) the right mechanism, or do some institutions specifically want to pay by card despite being a custom quote?
- Should the existing fixed-tier catalog (12/20-bowler, Board) stay as a *reference/fallback* for small clubs who don't need a full sales conversation, or does everything B2B move to quote-only?
