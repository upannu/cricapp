# PACE HQ — Complete Project Documentation

> Fast Bowling Performance Platform  
> Compiled: June 2026 | Version 1.0 | Confidential

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Competitor Analysis](#2-competitor-analysis)
3. [Feature Matrix — 110 Features](#3-feature-matrix)
4. [Tech Stack Decision](#4-tech-stack-decision)
5. [Product Scope — MVL, Sprint 1, Sprint 2](#5-product-scope)
6. [Commercial Models & SOW](#6-commercial-models--sow)
7. [Pricing Strategy](#7-pricing-strategy)
8. [Academy Content Architecture](#8-academy-content-architecture)
9. [AI Training Data Specification](#9-ai-training-data-specification)
10. [Academy Foundation Articles — Stage 1](#10-academy-foundation-articles)
11. [Branding Direction](#11-branding-direction)
12. [UI Screens Specified](#12-ui-screens-specified)
13. [Build Timeline & Team](#13-build-timeline--team)
14. [Next Steps & Blockers](#14-next-steps--blockers)

---

## 1. Project Overview

PACE HQ is an AI-powered fast bowling performance platform for coaches, academies, players, and parents. It combines biomechanics AI analysis, coach workflow tools, an academy marketplace, injury monitoring, and structured educational content — all in one platform.

### Core differentiators

| Differentiator | Detail |
|---|---|
| 3-angle AI fusion | Front + side + back camera analysis. No competitor does this — PitchWolf is single-angle only |
| Coach marketplace | Coach discovery, booking, Stripe Connect payouts. Unique — no competitor has this |
| Structured coach workflow | Assessment form + action plan + drill tracker + messaging loop |
| Cross-session injury risk | Threshold alerts across multiple sessions, not just a single-session scan |
| S&C log + RPE tracking | Physical load monitoring alongside biomechanics — unique to PACE HQ |
| Academy curriculum | 4-stage progressive unlock system (Foundation → Mechanics → Velocity → Elite) |

### Target personas

| Persona | Primary need |
|---|---|
| Club coach | Video analysis, session planning, player progress tracking |
| Academy director | Business tools + coaching analytics in one place |
| Elite performance coach | Deep biomechanics, workload tracking, injury prevention |
| Player (self-coach) | Drill library, video feedback, personal progress |
| Parent | Visibility into child's progress, session reports, communication |
| Talent scout | Player digital profiles, benchmarked metrics, watchlist |

---

## 2. Competitor Analysis

### App profiles

#### PitchWolf AI
- **Founded:** 2024 | **HQ:** San Francisco, USA
- **Focus:** AI-powered biomechanics for cricket fast bowlers
- **Key partnerships:** PaceLab (UK), Middlesex Cricket, KSCC, KIOC
- **Analysis types:** Performance Analysis + Injury Scan
- **Single-angle only** — side view. No multi-angle fusion
- **Academy:** 4 stages (Ignite/Build/Evolve/Master), 27 articles, 1,144 active learners, daily tips, sequential unlock system

**Pricing (live June 2026):**

| Tier | Price | Inclusions |
|---|---|---|
| Bowler Free | $0 | Pay-as-you-go analyses, 2 Academy articles, 30-day storage, CoPilot (limited) |
| Bowler Pro | US$39/month | 2 analyses/month (roll over), full Academy, unlimited storage, workout plan |
| Coach Free | $0 | Pay-as-you-go, unlimited bowler profiles, team workspace, 2 articles |
| Coach Enterprise | Custom | Custom volume, full Academy, enterprise analytics, custom branding |

> **Critical gap:** No mid-tier coach plan between $0 and Enterprise. PACE HQ targets this directly with Coach Starter ($49/mo) and Coach Pro ($79/mo).

#### FullTrack AI
- **Founded:** 2021 | **HQ:** USA (Maiden AI Inc)
- **Focus:** Automated ball tracking from a single stationary phone
- **Users:** 2M+ | **Clients:** England, NZ White Ferns, Cricket SA, Cricket Australia
- **iOS only** for recording — no Android recording support
- **No bowling biomechanics** — purely ball tracking and match analytics
- **Key features:** Ball speed, swing, spin, 3D trajectory, pitch maps, DRS, wagon wheel, auto-clipped ball-by-ball video

> **PACE HQ position:** Different product category. FullTrack tracks the ball; PACE HQ analyses the bowler. No direct head-to-head except on ball speed metric.

#### CricVision
- **Founded:** 2025
- **Focus:** AI-powered cricket coaching, primarily batting
- **Platforms:** iOS + Android
- **Key features:** Shot classification, batting skeleton analysis, bat path, backlift, stance, footwork, multi-angle (front + side for batting)
- **Academy platform:** White-label app + website, attendance, payments, in-app chat, social media reels
- **Pricing:** Basic $199/month (3 coaches, 30 players), Pro $399/month (5 coaches, 75 players)

> **PACE HQ position:** CricVision is batting-focused. No fast bowling biomechanics. PACE HQ competes on coach workflow tools and academy management features.

### Competitive summary

| Category | PitchWolf | FullTrack | CricVision | PACE HQ |
|---|---|---|---|---|
| Bowling biomechanics AI | Specialist (1 angle) | None | None | **Exceeds (3 angles)** |
| Ball tracking | None | Specialist | None | Partial (speed + pitch map) |
| Batting analysis | None | Partial | Specialist | None (post-MVP) |
| Coach marketplace | None | None | None | **Unique** |
| Coach workflow | Basic | None | Full | **Full + exceeds** |
| Injury monitoring | Session-only scan | None | None | **Cross-session + S&C log** |
| Academy management | None | None | Full | Partial (post-MVL gaps) |
| Mobile app | iOS only | iOS + Android | iOS + Android | Post-MVL Sprint 1 |
| AI chat assistant | Yes (CoPilot) | None | Yes (text + voice) | Included in MVL |

---

## 3. Feature Matrix

### Coverage summary (110 features)

| Status | Count | Meaning |
|---|---|---|
| COVERED | 67 | PACE HQ fully covers this feature |
| EXCEEDS | 15 | PACE HQ goes beyond what any competitor offers |
| PARTIAL | 4 | Partially covered — needs enhancement |
| GAP | 24 | Competitor has it, PACE HQ does not cover in MVP |

**Overall: PACE HQ covers or exceeds 82 of 110 features (75%)**

### Gap categories

**Add before launch (5 gaps — low effort, high impact):**
- In-app AI CoPilot chat — 3–4 days. Both PitchWolf and CricVision have this
- Parent/guardian portal — 2–3 days. Required for GDPR youth compliance
- Pitch map + ball speed from existing video — 2–3 days. Already achievable from front-view camera
- Voice notes in coach feedback — 2 days. CricVision has this
- XP gamification system — 3–4 days. PitchWolf prominently features XP

**Sprint 1 post-launch (5 gaps):**
- Mobile app (iOS + Android) — 10 weeks. All 3 competitors have mobile
- Attendance tracking — 3 days
- Group session scheduling — 4–5 days
- Social media reel creator — 3 days
- Coach-player QR code connect — 1–2 days

**Intentionally out of scope (9 gaps — correct decision):**
- Batting AI analysis — different product domain, CricVision owns this
- Ball swing/spin/3D trajectory — FullTrack's product category
- DRS/LBW decision review — match day feature, different use case
- White-label branding — Sprint 2, adds multi-tenancy complexity
- Full academy invoicing — Sprint 2, build when academies are paying customers

### PACE HQ unique features (no competitor has these)

1. 3-angle video fusion (front/side/back) — no competitor offers this
2. Coach discovery marketplace + Stripe Connect bookings
3. Structured assessment form (Technical/Tactical/Physical sections)
4. Cross-session injury risk trending across multiple sessions
5. S&C log + RPE fatigue self-report + weekly load summary
6. Joint angle threshold alerts
7. Bowling workload calculator
8. Secure multi-part video pipeline with in-browser quality validation

---

## 4. Tech Stack Decision

### Final recommended stack

| Layer | Technology | Rationale |
|---|---|---|
| Mobile app | **Flutter + Dart** | Since entire team ramps up regardless, invest in the better long-term framework. 25–30% higher productivity post-ramp. 46% cross-platform market share. AOT compiled — best performance for video-heavy UI |
| Web dashboard | **Next.js 19 + TypeScript** | Coach portal, admin, landing pages. Already in stack. App Router + Server Components for complex dashboards |
| Shared types | **OpenAPI schema** | FastAPI auto-generates OpenAPI spec → flutter-gen creates typed Dart models. No manual type duplication |
| Backend API | **Python 3.12 + FastAPI** | Unchanged from MD file. Correct choice. AI engineer and API developer in same language |
| AI/ML service | **MediaPipe Pose + OpenCV + Celery** | Self-hosted. Never pay per-inference for core AI loop. Unchanged from MD file |
| Database | **PostgreSQL + Redis** | Unchanged from MD file. Add pgvector when similarity search needed |
| Video storage | **AWS S3 → Cloudflare R2 at scale** | S3 for MVP. Migrate to R2 when egress costs bite ($0.09/GB S3 vs $0 R2) |
| State management | **Riverpod** (Flutter) | Modern, testable, scales to large teams |
| Monorepo | **Melos + Turborepo** | Melos for Flutter packages, Turborepo for Next.js. Shared code across all future apps |
| Payments | **Stripe + Stripe Connect** | Subscriptions + coach marketplace payouts |
| Background jobs | **Inngest** | Video processing jobs, report generation, notifications |
| Deployment | **Railway** (dev) → **GCP Cloud Run** (AI service) + **AWS ECS** (FastAPI) | Start cheap, scale without rewriting |
| Testing | **Flutter test + Playwright + Pytest** | Layer-specific ownership for principal testers |
| Analytics | **PostHog + Sentry** | Product analytics + error monitoring |

### Why Flutter over React Native for this team

The decision changed when Sukhi confirmed the full team composition (data analysts, principal testers, other technical staff). Since everyone ramps up regardless:

- Flutter's 25–30% productivity advantage is captured on PACE HQ itself, not just future products
- Dart takes 1–2 weeks to become productive for experienced devs (TypeScript/Java/Kotlin background)
- Flutter's deterministic widget testing framework is superior for principal testers
- Flutter DevTools — widget inspector, performance profiler, memory debugger — better tooling than React Native's equivalent
- Data analysts stay entirely in Python — no Flutter needed for their work
- Lower CPU (2% idle vs 4%) and memory footprint — important for video-processing app on field devices

### What changed from the MD file quote

| Layer | MD file proposal | PACE HQ recommendation |
|---|---|---|
| Frontend | React 18 (web only) | Next.js 19 + Flutter (web + mobile) |
| Mobile | Not included | Flutter — Sprint 1 |
| Everything else | FastAPI, PostgreSQL, Redis, MediaPipe, S3, Stripe | Unchanged — all correct |

> The MD file backend stack is sound. The only gap was web-only frontend and no mobile plan.

### Team ramp-up by role

| Role | Stack | Ramp-up |
|---|---|---|
| Data analysts | Python only — FastAPI, MediaPipe, pandas, Jupyter, BigQuery | Zero ramp-up on mobile layer |
| Principal testers | Flutter test + Playwright + Pytest | 1–2 weeks on Dart testing syntax — same as React Native Jest/Detox |
| Mobile developers | Flutter + Dart | 1–2 weeks to productivity. 25–30% higher output vs React Native post-ramp |
| Web / full-stack devs | Next.js + TypeScript + FastAPI | No new learning — existing skills apply |

---

## 5. Product Scope

### Release 1 — Minimum Viable Launch (MVL)

> Timeline: 14–16 calendar weeks | Revenue-generating from Week 1 post-launch

| Module | Duration | Cost (AUD) | Deliverable |
|---|---|---|---|
| Infrastructure & DevOps | 6 days | $4,080 | AWS, CI/CD, Sentry, Redis, PostgreSQL, staging + prod |
| Auth + Profiles + Parent Portal | 7 days | $4,760 | 4 roles: Player, Coach, Parent, Admin. GDPR youth consent flow |
| 3-Angle Video Pipeline | 6 days | $7,440 | Front/side/back upload, in-browser validation, S3, MediaConvert, Celery |
| AI Biomechanics Engine | 15 days | $8,400 | 20+ metrics, 3-angle fusion, skeleton overlay, injury scan, error detection |
| AI CoPilot Chat | 3 days | $2,040 | In-app coaching assistant (Claude API). 8 topic areas |
| Pitch Map + Ball Speed | 3 days | $2,040 | Derived from front-view video. Closes FullTrack gap at zero extra hardware |
| PDF Reports + Annotated Frames | 6 days | $7,440 | Auto-generated PDF with metrics, error flags, drill prescriptions |
| Coach Marketplace + Stripe Connect | 8 days | $5,440 | Coach discovery, booking, availability calendar, Stripe Connect payouts |
| Coach Workflow + Voice Notes | 7 days | $4,760 | Video annotation, voice-to-text, assessment form, action plan builder, messaging |
| Performance Dashboard + S&C Log | 4 days | $2,720 | Speed trend, biomechanical history, cross-session injury alerts, RPE |
| Subscription + XP Gamification | 5 days | $3,400 | Freemium through Academy $249. XP system with milestone badges |
| Academy Content Library | 3 days | $2,040 | 4-stage progressive unlock, daily tip system, coach article assignment |
| QA + Security Audit + Launch | 9 days | $6,120 | OWASP Top 10, GDPR review, load testing, production go-live |
| Stabilisation + Handover | 6 days | $7,440 | Bug triage, AI tuning, API docs, deployment runbook |
| **MVL TOTAL** | **~98 days** | **$67,720** | **Revenue-generating platform. Beats all 3 competitors on biomechanics** |

> Why $67,720 vs the $55,720 competitor quote: 5 features were missing from the original scope (AI chat, parent portal, pitch map, voice notes, XP gamification — ~14 extra dev days). These cost ~$12,000 but ensure the product launches competitive with PitchWolf on every visible feature.

### Release 2 — Sprint 1 (Post-Launch)

> Timeline: 8–10 weeks post-launch | Closes mobile gap

| Module | Duration | Cost (AUD) |
|---|---|---|
| Mobile App (Flutter — iOS + Android) | 10 weeks | $34,000 |
| Attendance Tracking | 3 days | $2,040 |
| Group Session Scheduling | 4 days | $2,720 |
| Social Media Reel Creator | 3 days | $2,040 |
| Benchmark Network Data | 4 days | $2,720 |
| **Sprint 1 TOTAL** | **~10 weeks** | **$43,520** |

### Release 3 — Sprint 2 (Months 4–6 post-launch)

> Academy revenue unlock. White-label partnerships.

| Module | Duration | Cost (AUD) |
|---|---|---|
| White-Label Academy Packaging | 4 weeks | $13,600 |
| Full Academy Invoicing | 5 days | $3,400 |
| Auto Personalised Workout Plan | 4 days | $2,720 |
| Wearable / Sensor Integration (Catapult, STATSports, Apple Watch) | 6 weeks | $20,400 |
| Batting Analysis Phase 1 | 8 weeks | $27,200 |
| **Sprint 2 TOTAL** | **~5 months** | **$67,320** |

### Full 18-month delivery timeline

| Period | Focus | Commercial milestone |
|---|---|---|
| Weeks 1–2 | Discovery, data audit, dev environment | AI training data confirmed, branding locked, contract signed |
| Weeks 3–8 | MVL core — infra, auth, video, AI | AI pipeline processing real videos with >80% accuracy |
| Weeks 9–12 | MVL product — reports, coach, billing | Full end-to-end flow. Beta group of 10 coaches |
| Weeks 13–16 | QA, security, launch | Production launch. First paying subscribers |
| Months 5–6 | Stabilisation + Sprint 1 start | 50+ paying accounts. Mobile app development begins |
| Months 7–10 | Sprint 1 delivery | Mobile app live. 200+ paying accounts |
| Months 11–18 | Sprint 2 delivery | White-label, batting, wearables. $1M ARR run rate |

---

## 6. Commercial Models & SOW

### Four engagement options

#### Option A — Fixed-Price Project

| Phase | Duration | Investment (AUD) |
|---|---|---|
| MVL Build (Release 1) | ~16 weeks | $67,720 |
| Sprint 1 (Release 2) | ~10 weeks | $43,520 |
| Sprint 2 (Release 3) | ~20 weeks | $67,320 |
| **Total** | **~46 weeks** | **$178,560** |

Payment: 30% on signature / 30% at halfway milestone / 30% at go-live / 10% at 30-day stabilisation.

#### Option B — Monthly Retainer (Recommended)

| Period | Days/month | Monthly cost |
|---|---|---|
| MVL (Months 1–5) | 20 dev days | $8,000/month |
| Sprint 1 (Months 6–10) | 18 dev days | $7,200/month |
| Sprint 2 (Months 11–18) | 15 dev days | $6,000/month |
| Go-live milestone bonus | One-off | $5,000 |
| **Total 18 months** | | **~$147,000** |

> ~$31k cheaper than Option A. Team stays engaged post-launch. Monthly spend $6–8k.

#### Option C — Equity Partnership

| Phase | Cash | Equity |
|---|---|---|
| MVL | $33,860 | 4% |
| Sprint 1 | $21,760 | 2% |
| Sprint 2 | Negotiated | — |
| **Total** | **~$55,620 cash** | **6% equity** |

Requires Shareholder Agreement (SHA). Equity vests over 24 months from go-live. Legal costs ~$2,000–3,500.

#### Option D — Revenue Share

| Phase | Cash | Revenue share |
|---|---|---|
| MVL | $15,000 | 18% MRR for 36 months, capped at $250,000 |
| Sprint 1 | $10,000 | Covered by existing share |
| Sprint 2 | $10,000 | Cash only |
| **Total** | **$35,000 cash** | **18% MRR × 36 months** |

Example: At $60K MRR → $10,800/month to dev team. Cap hit at ~Month 23.

### Rates

| Role | Day rate |
|---|---|
| Full-Stack / Flutter Engineer (Lead) | $680 AUD/day ($85/hr) |
| AI/ML Engineer | $560 AUD/day ($70/hr) |
| Change requests (out of scope) | $95 AUD/hour blended |

### Scope change process

1. Client submits change request in writing
2. Estimate returned within 48 hours
3. Client approves in writing before work begins
4. Billed at $95/hr, invoiced monthly
5. Critical path impacts require formal timeline amendment

---

## 7. Pricing Strategy

### Recommended subscription tiers

| Tier | Price (AUD) | Target | Key inclusions |
|---|---|---|---|
| Free | $0 | Acquisition funnel | 1 analysis/month, 2 Academy articles, 30-day storage, CoPilot (3 msg/day) |
| Player Pro | $49/month | Serious individual bowlers | 5 analyses/month (roll over), full Academy, unlimited storage, XP + badges |
| Coach Starter | $79/month | Grassroots clubs — PitchWolf's gap | 15 players, 10 analyses/month, team workspace, video annotation, drill assignment |
| Coach Pro | $129/month | Academy coaches | 50 players, 25 analyses/month, marketplace listing, booking, Stripe payouts, voice notes |
| Academy | $249/month | Formal academies 30–150 players | Unlimited players, 60 analyses/month, attendance, scheduling, parent portal, QR onboarding |
| Elite / Enterprise | Custom | State programs, franchise academies | Custom volume, white-label, API access, wearable integrations |

> PitchWolf's Bowler Pro is US$39/month (~AUD$60) with only 2 analyses. PACE HQ's Player Pro at $49 with 5 analyses is better value at lower cost. The Coach Starter at $79 fills the gap PitchWolf has completely ignored.

### Revenue projections

| Period | Conservative MRR | Drivers |
|---|---|---|
| Month 3 (launch) | $4,800 | 40 Player Pro + 10 Coach Starter + 5 Coach Pro |
| Month 6 | $18,500 | 100 Player Pro + 40 Coach Starter + 20 Coach Pro + 5 Academy |
| Month 12 | $52,000 | 300 Player Pro + 100 Coach Starter + 60 Coach Pro + 20 Academy |
| Month 18 | $112,000 | 600 Player Pro + 200 Coach Starter + 120 Coach Pro + 50 Academy + 5 Elite |
| Year 2 ARR target | $1.35M ARR | Australian market + 2 international markets |

---

## 8. Academy Content Architecture

### Strategic purpose

PitchWolf's Academy model: *"Analysis tells you WHAT to improve. Academy teaches you HOW."* The two halves are co-dependent. A bowler who gets a report flagging front arm collapse but hasn't read the article churns. One who has read it comes back to fix it.

PACE HQ Academy differentiator: content is tied directly to the AI output — every article references the specific PACE HQ metric it relates to and links back to the upload flow. PitchWolf's Academy is generic fast bowling education. Ours is a companion to the data.

### 4-stage curriculum

| Stage | Articles | Gate | Audience |
|---|---|---|---|
| Foundation | 7 articles | Free — all users | Understanding pace generation, reading reports, run-up, delivery stride, arm action, action types |
| Mechanics | 8 articles | Complete 5 Foundation articles + Player Pro | Front knee angle, hip-shoulder separation, trunk lean, front arm, body segment contribution, wrist |
| Velocity | 8 articles | Complete 6 Mechanics + Player Pro | 8-week speed block, S&C for fast bowlers, workload management, injury risk, pace plateau, progress tracking |
| Elite | 6 articles | Complete 6 Velocity + Player Pro | Research review, PaceLab benchmarking, coaching with data, case studies, advanced report analysis |

**Total: 29 articles + ongoing 4 per month**

### Daily tip system

- One tip published daily, 80–120 words
- Tagged by category: Biomechanical / Technical / Physical / Mental / Data Insight
- Links to relevant Academy article — conversion funnel from free to premium
- Push notification at 7am local time — highest-ROI notification in the platform
- Free users: last 7 days. Pro users: full archive

### Unlock + XP system

| Action | XP |
|---|---|
| Stage 1 article read | 50 XP |
| Stage 2 article read | 100 XP |
| Stage 3 article read | 150 XP |
| Stage 4 article read | 200 XP |
| Complete a full stage | 500 XP bonus |
| 7 consecutive daily tips | 200 XP + 'Consistent' badge |
| Complete all 29 articles | 1,000 XP + 'Master' badge + PDF certificate |
| Coach assigns article + player completes | 75 XP (player) + 25 XP (coach) |

### Coach integration

- Coaches assign articles as part of action plans
- Article assignment appears alongside drill assignments in player's workspace
- Coach sees completion status in their dashboard
- Completion triggers notification to coach
- Coach can add note when assigning: "Read this before our next session"

### Content production

- Foundation articles (7): ~28 hours of expert writing — complete and production-ready (see Section 10)
- Full 29 articles: ~116 hours total founder/coach writing time
- Articles should begin in Week 1 of development, not after launch
- Tone: written to a 17-year-old with genuine ambition. Plain English. Lead with outcomes ("This is worth 4–8 km/h") before explaining why

### PACE HQ vs PitchWolf Academy comparison

| Feature | PitchWolf | PACE HQ |
|---|---|---|
| Stage names | Ignite/Build/Evolve/Master | Foundation/Mechanics/Velocity/Elite |
| Total articles | 27 | 29 + 4/month ongoing |
| Free articles | ~7 | 7 (matched) |
| Daily tip | Basic single tip | Categorised, push notification, searchable archive |
| Coach integration | None | Article assignment in action plans + XP |
| Content depth | General fast bowling | Tied directly to PACE HQ metrics and report output |
| Completion certificate | Not visible | PDF cert + shareable badge for all-29 completion |
| XP gamification | Basic XP on profile | Full XP per article, stage completion, tip streak |

---

## 9. AI Training Data Specification

### Overview

The AI pipeline cannot be trained without real labelled bowling videos. This section defines exactly what is needed. The client must begin collecting and labelling data in Week 1 — before Phase 4 development starts.

### Canonical JSON schema

**Session-level:**
```json
{
  "session_id": "uuid-v4",
  "bowler_id": "uuid-v4",
  "recorded_at": "2026-06-01T09:30:00Z",
  "camera_setup": {
    "front_angle": { "device": "iPhone 14", "fps": 60, "resolution": "1080p", "distance_m": 8 },
    "side_angle":  { "device": "iPhone 14", "fps": 60, "resolution": "1080p", "distance_m": 6 },
    "back_angle":  { "device": "Samsung S24", "fps": 60, "resolution": "1080p", "distance_m": 5 }
  },
  "bowler_profile": {
    "bowling_arm": "right",
    "action_type": "side-on",
    "age_group": "U19",
    "experience_level": "club"
  },
  "deliveries": [],
  "session_ground_truth": {
    "labelled_by": "coach_name",
    "reviewed_by": "expert_name",
    "confidence": "high"
  }
}
```

**Key biomechanical metrics schema:**
```json
"biomechanical_metrics": {
  "approach_zone": {
    "run_up_peak_speed_kmh": 22.4,
    "approach_efficiency_score": 7.8,
    "stride_count": 14,
    "last_3_stride_acceleration": "positive"
  },
  "impact_zone": {
    "front_knee_angle_at_contact_deg": 168,
    "hip_shoulder_separation_deg": 38,
    "trunk_lean_lateral_deg": 14,
    "back_foot_drag_cm": 18
  },
  "delivery_zone": {
    "arm_speed_index": 8.2,
    "elbow_angle_at_release_deg": 162,
    "release_height_m": 2.31,
    "front_arm_peak_height_m": 2.48
  },
  "zone_scores": {
    "approach_score": 8.5,
    "impact_score": 7.2,
    "delivery_score": 8.8,
    "composite_score": 8.1
  }
}
```

### Ground truth thresholds

#### Impact zone (most critical)

| Metric | Normal (green) | Caution (amber) | Flag (red) |
|---|---|---|---|
| Front knee angle at FFC | 160–175° | 150–159° | <150° (collapse) or >185° |
| Hip-shoulder separation | 30–45° | 20–29° | <20° (no separation) |
| Trunk lean lateral | 10–20° | 5–9° or 21–28° | <5° or >28° |
| Back-foot drag | 10–25 cm | 25–35 cm | >35 cm or <5 cm |

#### Delivery zone

| Metric | Normal (green) | Caution (amber) | Flag (red) |
|---|---|---|---|
| Arm speed index | 7.5–10.0 | 5.5–7.4 | <5.5 |
| Elbow angle at release | 155–175° | 145–154° | <145° (legal risk) |
| Release height | >2.1m | 1.9–2.1m | <1.9m |
| Front arm peak height | >2.3m | 2.0–2.3m | <2.0m (front arm collapse) |

### Bowling action type definitions

| Classification | Hip-shoulder relationship | Injury risk |
|---|---|---|
| Side-on | Both hips and shoulders >70° relative to crease at BFC | Moderate — requires precise rotation timing |
| Front-on | Both hips and shoulders <50° relative to crease at BFC | Lower — 1.8x lower lumbar stress than mixed |
| Mixed | Disagreement >25° between hip and shoulder angles | HIGH — 3.2x higher L4/L5 stress fracture rate |

### Error flag trigger rules

| Error flag | Primary trigger | Secondary confirmation |
|---|---|---|
| Front arm collapse | Front arm peak height <2.0m | Front shoulder drops >15° between BFC and release |
| Over-stride | Stride length >95% of bowler height | Front foot lands >40cm past back crease marker |
| Low-back hyperextension | Trunk lean lateral >28° at release | Hip-shoulder separation >55° simultaneously |
| Front knee collapse | Front knee angle <150° at FFC | Knee angle decreases >15° between BFC and release |
| Mixed action flag | Hip-shoulder disagreement >25° | Both measurements independently confirmed |

### Video collection requirements

| Camera | Position | Distance | Height |
|---|---|---|---|
| Front | Behind umpire, facing down pitch | 8–10m behind crease | 1.0–1.2m (tripod) |
| Side | Square on to crease, off-stump side | 5–7m from stumps | 1.0–1.2m (tripod) |
| Back | Behind bowler, facing run-up | 3–4m behind delivery stride start | 1.0–1.2m (tripod) |

**Technical requirements:**
- Minimum 60fps — non-negotiable
- Minimum 1080p resolution
- MP4, H.264, minimum 8 Mbps
- All 3 cameras record simultaneously with sync cue
- 1.0m calibration marker at crease for every session

### Training data volume

| Category | Minimum | Recommended |
|---|---|---|
| Side-on — correct technique | 30 deliveries | 120 deliveries |
| Side-on — with errors | 20 deliveries | 80 deliveries |
| Front-on — correct technique | 20 deliveries | 80 deliveries |
| Front-on — with errors | 15 deliveries | 60 deliveries |
| Mixed action | 15 deliveries | 60 deliveries |
| Junior bowlers (U16) | 10 deliveries | 40 deliveries |
| Female bowlers | 10 deliveries | 40 deliveries |
| **Minimum total** | **120 deliveries** | **480 deliveries** |

> Applying all 8 augmentation techniques to 50 real labelled deliveries produces 450 training samples — sufficient to begin Phase 4 while more real data is collected in parallel.

### Model validation requirements

| Test | Minimum threshold | Owner |
|---|---|---|
| Action type classification | 95% correct on hold-out set | AI engineer |
| Front knee angle accuracy | ±5° on 90% of deliveries | AI engineer + client |
| Error flag true positive rate | 88–92% per flag | Principal tester |
| False positive rate overall | <5% on clean deliveries | Principal tester + client |
| Processing time | <90 seconds per 3-angle session | AI engineer |
| Client accuracy rating | >80% of reports rated 'accurate or better' | Client sign-off required |

**Three validation checkpoints in Phase 4:**
- Day 5: Pipeline validation — skeleton extraction working on all 3 angles
- Day 10: Metric accuracy — angles within threshold, action type >90%
- Day 15: Client sign-off — expert reviews 10 reports, formally closes Phase 4

---

## 10. Academy Foundation Articles

> All 7 Foundation Stage articles are written, production-ready, and available in the companion Word document: `PACE_HQ_Academy_Foundation_Articles.docx`

### Article index

| # | Title | Read time | Key concepts |
|---|---|---|---|
| 1.1 | What makes a fast bowler fast? | 7 min | 3-phase chain model: Approach Zone, Impact Zone, Delivery Zone |
| 1.2 | The 3 zones of your action | 6 min | What PACE HQ measures in each zone, how zone scores are calculated, what a good score looks like |
| 1.3 | How to read your PACE HQ report | 8 min | Section-by-section guide: action summary, zone scores, error flags, metric detail, segment contribution, drill recommendations |
| 1.4 | Run-up fundamentals | 7 min | Efficiency over length, optimal run-up finding, last-3-stride acceleration, body position at BFC |
| 1.5 | The delivery stride: front foot and back foot | 9 min | Front knee angle (most important metric), back-foot drag, over-stride, how they interact |
| 1.6 | Arm action and release point | 7 min | Arm speed index, elbow angle (legal dimension), release height, front arm role, follow-through |
| 1.7 | Bowling action types: side-on, front-on, mixed | 8 min | Classification criteria, injury risk data, how PACE HQ measures action type, how to safely modify a mixed action |

**Article structure (every article follows this template):**
1. Branded header (stage, article number, difficulty, read time)
2. Key takeaways box (3 outcome statements)
3. The concept — plain English, no assumed knowledge
4. The biomechanics — metric reference, PACE HQ data
5. What goes wrong — common errors, report flags
6. How to fix it — 2–3 drills
7. Related content links + action prompt linking back to video upload

**Voice guidelines:**
- Written to a 17-year-old with genuine ambition
- Lead with outcomes: "This is worth 4–8 km/h" before explaining why
- Cite real numbers: "front knee stiffness responsible for 12–18% of ball speed variance (Bartlett, 2003)"
- End every article: "Upload your next session and look for [specific metric] in your report"
- First person plural: "When we look at your front knee angle in the PACE HQ report…"

**Founder time to review:** ~4 hours per article × 7 articles = 28 hours review time. Articles are complete and accurate — founder reviews for personal voice and domain-specific nuance only.

---

## 11. Branding Direction

### Three options

#### Direction 1 — Dark Precision (Recommended)

| Element | Value |
|---|---|
| Primary background | #050F1F (Ink) |
| Surface | #1A2E45 |
| Accent | #00D4AA (Pace Green) |
| Alert / energy | #FF6B2B (Fire) |
| Text | #FFFFFF |
| Display font | DM Sans Bold |
| Body font | Inter Regular |
| Metric font | JetBrains Mono |
| Stage names | Foundation / Mechanics / Velocity / Elite |
| Logo mark | A-frame (bowler in delivery stride abstracted into speed graph peak). Dot at base = wicket |

> Best for: Elite academy clients, state programs, tech-forward coaches, dark-mode app UI

#### Direction 2 — Raw Earth

| Element | Value |
|---|---|
| Primary | #1A1208 (Pitch Dark) |
| Accent | #D4622A (Ball Red) |
| Gold | #F5C842 (Crease Gold) |
| Stage names | Roots / Load / Release / Control |

> Best for: Grassroots clubs, junior programs, South Asian markets

#### Direction 3 — Electric Edge

| Element | Value |
|---|---|
| Primary | #0A1628 (Deep Navy) |
| Purple | #7C3AED (Velocity) |
| Teal | #06B6D4 (Electro Teal) |
| Stage names | Spark / Build / Surge / Apex |

> Best for: Under-25 bowlers, consumer app, social media presence

### Universal brand rules

**Do:**
- Always write PACE HQ in full caps
- Lead with a metric whenever possible — "135.8 km/h" before "great session"
- Use monospace font for all speed, angle, and score readouts
- Show real bowler data in marketing, not stock photography

**Don't:**
- Use generic cricket ball imagery
- Use gradients on the logo mark
- Mix more than 3 colours in any single screen
- Use red for anything except injury risk alerts

---

## 12. UI Screens Specified

The following screens have been designed and are available as interactive mockups:

### Coach login page
- Role toggle: Coach / Player
- Email + password fields
- Google + Apple SSO
- "Forgot password" link
- Sign up link

### Coach dashboard — players & subscriptions
- Top navigation: Players / Sessions / Academy / Bookings / Reports
- Stat cards: Active players, Active subscriptions, Expiring in 7 days (alert), Sessions this month
- Players table with columns:
  - Player name + avatar + bowling style
  - Plan tier badge (Coach Pro / Player Pro / Free)
  - Status badge (Active / Expiring / Expired)
  - **Start date** (exact date)
  - **End / renewal date** (amber highlight if expiring within 7 days, red if expired)
  - Sessions count
  - Last active
  - Action buttons (View / Message)

### Player profile
- Large avatar + full name + bowling style + added date
- Plan badge + status badge + injury risk flag (if applicable)
- XP total
- Four sections in 2×2 grid:
  - **Subscription:** Plan, Status, Start date, Renewal date, Sessions used
  - **Latest biomechanics:** Ball speed, front knee angle, action type, injury risk, last session
  - **Academy progress:** Stage reached, completion %, progress bar, sessions/XP/articles metrics
  - **Contact & profile:** Email, age group, club, coach assigned, guardian consent status
- Footer actions: View all reports / Action plans / **Manage subscription** / New session

### Screens still to build
- Session upload flow (3-angle guided capture)
- Biomechanics report view
- Coach assessment form
- Action plan builder
- Drill library
- Academy article view
- Booking/calendar flow
- Admin panel

---

## 13. Build Timeline & Team

### Realistic timeline estimates

| Scenario | MVL launch | Mobile live | Full platform |
|---|---|---|---|
| 2 devs + 1 AI engineer, realistic pace | 22–24 weeks | Month 10 | Month 18 |
| 3 devs + 1 AI engineer, realistic pace | 18–20 weeks | Month 8 | Month 15 |
| 2 devs + 1 AI engineer, optimistic pace | 18–20 weeks | Month 8 | Month 15 |
| Minimum possible (full team, no blockers) | 14–16 weeks | Month 7 | Month 13 |

> The MD file quote said 3–4 months. That is working days only, no mobile, no Flutter ramp-up, optimistic assumptions. Realistic calendar time for MVL: 5–6 months.

### Recommended team structure

| Role | Responsibility | Stack |
|---|---|---|
| Lead full-stack developer | Next.js dashboard, FastAPI backend, Supabase, Stripe | TypeScript, Python |
| Flutter developer | Mobile app (Sprint 1), component library | Dart, Flutter |
| AI/ML engineer | MediaPipe pipeline, Celery workers, model training | Python, OpenCV, MediaPipe |
| Data analysts | Session data analysis, model validation, BigQuery | Python, pandas, SQL |
| Principal testers | Test suite across all layers, validation checkpoints | Flutter test, Playwright, Pytest |

### Top timeline risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| AI training data delayed | High | Critical | Hard deadline: data must arrive 2 weeks before Phase 4 start |
| Flutter ramp-up slower than expected | Medium | Medium | Ramp-up runs in Week 1–2 alongside infra — zero timeline cost |
| Stripe Connect complexity | Medium | Medium | Allow 2 extra days in Phase 6. Test with real accounts |
| AI accuracy below threshold | Medium | High | 3 validation checkpoints. Defined acceptance criteria before Phase 4 starts |
| Scope creep | High | Medium | All requests post-kickoff via formal change request. Written approval before work begins |
| App Store submission | Low | Medium | Submit 3 weeks before planned launch. Allow 2-week buffer for rejection |

---

## 14. Next Steps & Blockers

### This week — do first

- [ ] **AI training data audit call with client** — what videos exist, format, quantity. Bring the AI Training Data Package document
- [ ] **Client selects commercial model** — Option A, B, C, or D from SOW. No contract = no start date
- [ ] **Client confirms Stripe Connect platform fee %** — needed before Phase 6 can be configured
- [ ] **Client engages solicitor** — Terms of Service + youth data compliance (GDPR/Privacy Act). Takes 3–4 weeks. Start now

### Weeks 1–2 — pre-development

- [ ] Branding direction finalised — pick Direction 1, 2, or 3. Commission logo mark from designer
- [ ] Client reviews and approves Foundation Stage articles (7 articles in companion document)
- [ ] Client begins labelling first 50 bowling videos using annotation guide from AI Training Data Package
- [ ] Development environment: GitHub repo, Supabase project, Railway containers, CI/CD pipeline
- [ ] Flutter/Dart ramp-up begins for mobile developers — runs alongside infra setup
- [ ] Apple Developer account ($99/year) and Google Play account ($25 one-off) created

### Client obligations before kickoff

| Item | Needed by | Risk if late |
|---|---|---|
| AI training data (labelled videos, 200+ samples) | Before Week 3 | Phase 4 cannot start. 1 week delay = 1 week added to timeline |
| Branding assets (logo, colours, typography) | Before Week 2 | UI uses placeholders. Brand cannot be applied to PDF reports |
| Coaching qualification taxonomy | Before Week 4 | Coach profiles use generic labels |
| Terms of Service + Privacy Policy (youth-specific) | Before Week 12 | Cannot legally launch |
| Platform fee structure for Stripe Connect | Before Week 8 | Coach booking and payout flow blocked |
| Academy content (minimum 10 articles + 5 videos) | Before Week 12 | Academy launches empty |
| Expert coach for AI validation (3 sessions) | Weeks 5–8 | Phase 4 cannot be signed off |

### Documents produced (complete)

| Document | Purpose |
|---|---|
| This MD file | Complete project reference |
| PACE_HQ_Analysis_Enhanced_Proposal.docx | Competitor analysis + requirements review |
| PACE_HQ_Detailed_Feature_Analysis.docx | 110-feature matrix with coverage assessment |
| PACE_HQ_SOW_Commercial_Proposal.docx | Statement of Work with 4 commercial models |
| PACE_HQ_Academy_Architecture.docx | Curriculum design, article briefs, unlock system |
| PACE_HQ_AI_Training_Data_Package.docx | JSON schemas, thresholds, labelling guide, validation checklist |
| PACE_HQ_Academy_Foundation_Articles.docx | All 7 Foundation Stage articles, production-ready |

### Documents still to produce (on request)

| Document | Purpose |
|---|---|
| Sprint 1 Technical Specification | Flutter mobile app screen-by-screen spec, API contracts, component breakdown |
| Academy Stage 2 — Mechanics Articles | 8 premium-tier articles (Mechanics stage) |
| Academy Stage 3 — Velocity Articles | 8 premium-tier articles |
| Academy Stage 4 — Elite Articles | 6 premium-tier articles |
| Daily tip content calendar | 90-day launch bank of categorised tips |
| PostgreSQL database schema | Full schema with tables, relationships, RLS policies |
| Go-to-market plan | Cricket Australia partnership pitch, beta coach recruitment, App Store listing copy |
| Client pitch deck | 10-slide investor/partner deck |

---

*PACE HQ Complete Project Documentation — compiled June 2026*  
*Prepared by Claude (Anthropic) for Sukhi / Bloom Lane Development*  
*All figures are estimates. Biomechanical thresholds based on Bartlett (2003), Elliott et al. (2007), Portus et al. (2004)*
