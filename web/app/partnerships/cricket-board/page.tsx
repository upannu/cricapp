import Link from "next/link";
import { PartnershipPageShell } from "@/components/PartnershipPageShell";
import { Eyebrow, EditorialButton, EditorialHeading, CapabilityGrid, PageHero } from "@/components/editorial/EditorialUI";

// Mirrors PartnershipApplicationForm's ORG_TYPES (minus "Other") so this section and the
// application form's own dropdown describe the same taxonomy.
const ORG_TYPES = [
  { title: "National Cricket Boards", body: "Manage cricket at national scale." },
  { title: "State Associations", body: "Connect regions and development pathways." },
  { title: "Regional Associations", body: "Manage local cricket ecosystems." },
  { title: "District Associations", body: "Support clubs, coaches and players." },
  { title: "Academy Networks", body: "Connect affiliated academies and programs." },
  { title: "Professional Organisations", body: "Support elite pathways and performance." },
];

// Deliberately hedged ("can become", "often") rather than stated as universal fact — this
// describes a pattern many growing cricket organisations recognise, not a diagnosis of any one.
const PAIN_POINTS = [
  { title: "Fragmented Data", body: "Player and program information can become spread across multiple systems and spreadsheets." },
  { title: "Limited Visibility", body: "It can be difficult to understand what is happening across regions, academies, clubs and programs." },
  { title: "Disconnected Player Pathways", body: "Player development information can become difficult to follow as players move between programs, coaches and development levels." },
  { title: "Manual Reporting", body: "Teams can spend significant time collecting and consolidating information for reporting and decision-making." },
  { title: "Inconsistent Processes", body: "Different programs and organisations may use different approaches to managing development and performance." },
];

// Grounded in what the product actually does today (sessions, reports, biomechanics AI, coach
// management) — capabilities that would require a board/region data model the app doesn't have
// yet (see lib/types.ts's UserRole — no board-level role exists) are phrased as partnership-shaped
// ("can be shaped to...", "can be extended to...") rather than as delivered features.
const CAPABILITIES = [
  { title: "Player Pathways", body: "Track player development through sessions, reports and coaching plans as players progress." },
  { title: "Coaching Ecosystem", body: "Manage coaches and coaching programs, connected to player development." },
  { title: "Connected Organisations", body: "CRIC HQ partnerships can be shaped to connect your affiliated academies, clubs and programs as your organisation grows." },
  { title: "Performance Insights", body: "Understand player performance through AI-assisted biomechanics reports and insights that support coaching decisions." },
  { title: "Player Development Insights", body: "Use structured player development information to support better coaching and development decisions." },
  { title: "Organisation Reporting", body: "Reporting that can be extended to give decision-makers visibility across participation, development and performance." },
];

// Short phrases, not full sentences — these render as a compact wrapping strip (see the Outcomes
// section below), which only reads as "compact" if each item is actually short.
const OUTCOMES = [
  { title: "Better Visibility", body: "across your ecosystem" },
  { title: "Stronger Player Pathways", body: "across programs and levels" },
  { title: "Better Decisions", body: "from connected information" },
  { title: "Less Administration", body: "fewer manual processes" },
  { title: "Scalable Growth", body: "a structure that grows with you" },
];

// Starts from the "Register Your Interest" click itself, not just the later configuration work —
// answers "what happens after I submit" directly rather than assuming that hesitation away.
// "We review every application personally" is a real, current commitment, not a marketing SLA —
// no promised response time is stated since none is guaranteed today.
const PARTNERSHIP_JOURNEY = [
  { title: "Register Your Interest", body: "Tell us about your organisation." },
  { title: "We Review Your Application", body: "Every application is reviewed personally." },
  { title: "A Conversation", body: "We discuss your structure and requirements." },
  { title: "Platform Configuration", body: "Shaped around your organisation and programs." },
  { title: "Onboarding & Training", body: "Your team gets set up and trained." },
  { title: "Go Live", body: "Your organisation is connected." },
];

export const metadata = {
  title: "Cricket Board Partnership | CRIC HQ",
  description: "A connected cricket management and development platform for cricket boards, associations and governing bodies.",
};

export default function CricketBoardLandingPage() {
  return (
    <PartnershipPageShell>
      <PageHero image="/hp/final-cta.jpg">
        <div className="flex justify-center mb-6"><Eyebrow>Cricket Board Partnership</Eyebrow></div>
        <EditorialHeading size="lg" level="h1">Power Your Cricket Ecosystem</EditorialHeading>
        <p className="text-lg text-hp-paper/70 max-w-2xl mx-auto mt-6 mb-3">
          One connected platform for cricket boards, associations and governing bodies.
        </p>
        <p className="text-sm text-hp-paper/50 max-w-xl mx-auto mb-8">
          Connect players, coaches, academies, clubs and programs while giving your organisation greater visibility across development and performance.
        </p>
        <EditorialButton href="/partnerships/cricket-board/apply" size="lg">Register Your Interest</EditorialButton>
      </PageHero>

      <div className="max-w-5xl mx-auto px-6 sm:px-10">
        {/* Built for cricket organisations */}
        <div className="mb-16">
          <div className="text-center mb-10"><EditorialHeading size="sm">Built for Cricket Organisations</EditorialHeading></div>
          <CapabilityGrid items={ORG_TYPES} cols={3} />
        </div>

        {/* Problem / pain points — a divided list rather than another card grid, so it doesn't
            repeat the "Built for Cricket Organisations" grid immediately above it. */}
        <div className="mb-16">
          <div className="text-center mb-2"><EditorialHeading size="sm">Is Your Cricket Ecosystem Running on Disconnected Systems?</EditorialHeading></div>
          <p className="text-sm text-hp-paper/50 text-center max-w-2xl mx-auto mb-8">
            As cricket organisations grow, player, coaching, program and performance information can become spread across different systems, teams and processes.
          </p>
          <div className="border border-white/8 divide-y divide-white/8">
            {PAIN_POINTS.map((p) => (
              <div key={p.title} className="p-5 sm:flex sm:items-baseline sm:gap-6">
                <p className="font-display font-black text-hp-paper text-sm uppercase sm:w-60 sm:flex-shrink-0">{p.title}</p>
                <p className="text-hp-paper/55 text-xs mt-1 sm:mt-0">{p.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* One connected ecosystem */}
        <div className="mb-16">
          <div className="text-center mb-2"><EditorialHeading size="sm">One Connected Cricket Ecosystem</EditorialHeading></div>
          <p className="text-sm text-hp-paper/50 text-center max-w-2xl mx-auto mb-8">
            Connect the organisations, people and programs that support player development — from the board level through to the player.
          </p>
          <div className="border border-white/8 p-10 flex flex-col items-center gap-3">
            {["Cricket Board", "Regions / Associations"].map((step) => (
              <div key={step} className="flex flex-col items-center gap-3">
                <div className="px-5 py-2.5 border border-hp-cg/30 bg-hp-cg/5 text-hp-cg text-sm font-display font-bold uppercase text-center">
                  {step}
                </div>
                <div className="w-px h-5 bg-white/10" />
              </div>
            ))}
            <div className="flex flex-wrap justify-center gap-3">
              {["Academy", "Club", "Program"].map((step) => (
                <div key={step} className="px-5 py-2.5 border border-white/10 text-hp-paper/75 text-sm font-display font-semibold uppercase">
                  {step}
                </div>
              ))}
            </div>
            <div className="w-px h-5 bg-white/10" />
            <div className="px-5 py-2.5 border border-white/10 text-hp-paper/75 text-sm font-display font-semibold uppercase">
              Coaches
            </div>
            <div className="w-px h-5 bg-white/10" />
            <div className="px-5 py-2.5 border border-hp-cg/30 bg-hp-cg/5 text-hp-cg text-sm font-display font-bold uppercase">
              Players
            </div>
          </div>
        </div>

        {/* Capabilities — 3 paired rows instead of a 6-cell grid, so consecutive sections don't
            all read as the same uniform card shape. */}
        <div className="mb-12">
          <div className="text-center mb-10"><EditorialHeading size="sm">A Connected Platform for Cricket Organisations</EditorialHeading></div>
          <div className="space-y-px">
            {[0, 2, 4].map((i) => (
              <div key={i} className="border border-white/8 grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/8">
                {CAPABILITIES.slice(i, i + 2).map((c) => (
                  <div key={c.title} className="p-6">
                    <p className="font-display font-black text-hp-paper text-sm uppercase mb-1.5">{c.title}</p>
                    <p className="text-hp-paper/55 text-xs leading-relaxed">{c.body}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Outcomes — a slim wrapping strip rather than another full card grid, so this reads as
            a quick-scan summary of the capabilities above it, not a repeat of them. */}
        <div className="mb-16">
          <div className="text-center mb-4"><EditorialHeading size="sm">What CRIC HQ Helps You Achieve</EditorialHeading></div>
          <div className="border border-white/8 px-6 py-5 flex flex-wrap justify-center gap-x-8 gap-y-3">
            {OUTCOMES.map((o) => (
              <p key={o.title} className="text-sm text-hp-paper/60 whitespace-nowrap">
                <span className="text-hp-cg font-semibold">{o.title}</span> — {o.body}
              </p>
            ))}
          </div>
        </div>

        {/* Specialist program cross-sell — a differentiator of the board partnership, not a
            replacement for it; the program itself stays independently reachable from
            Academies/Coaches too, so it isn't gated behind an enterprise conversation. */}
        <div className="mb-16">
          <div className="border border-white/8 p-6 sm:p-8 sm:flex sm:items-center sm:justify-between gap-6">
            <div className="mb-4 sm:mb-0">
              <p className="font-display font-black text-hp-paper text-sm uppercase mb-1">Specialist Fast Bowling Development Program</p>
              <p className="text-hp-paper/50 text-xs max-w-md">
                A dedicated fast bowling coaching and athlete development program, available as part of a Cricket Board partnership for federation-wide rollout.
              </p>
            </div>
            <Link href="/programs/fast-bowling-development"
              className="inline-block px-6 py-2.5 text-hp-paper/75 text-sm font-display font-bold uppercase tracking-wider border border-white/20 hover:bg-white/4 transition-colors whitespace-nowrap">
              Learn More →
            </Link>
          </div>
        </div>

        {/* What happens next — a horizontal timeline rather than a card grid, and deliberately
            starts from the "Register Your Interest" click itself (not just the later
            configuration work), since that's the exact moment a visitor is hesitating. */}
        <div className="mb-16">
          <div className="text-center mb-2"><EditorialHeading size="sm">What Happens After You Apply</EditorialHeading></div>
          <p className="text-sm text-hp-paper/50 text-center max-w-2xl mx-auto mb-8">
            Every cricket organisation has a different structure, pathway and set of requirements. Here&apos;s what to expect from application through to going live.
          </p>
          <div className="border border-white/8 p-8">
            <div className="flex flex-col gap-5 sm:hidden">
              {PARTNERSHIP_JOURNEY.map((step, i) => (
                <div key={step.title} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full border-2 border-hp-cg text-hp-cg flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-display font-bold text-hp-paper text-sm">{step.title}</p>
                    <p className="text-hp-paper/50 text-xs">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden sm:flex items-start">
              {PARTNERSHIP_JOURNEY.map((step, i) => (
                <div key={step.title} className="contents">
                  <div className="flex flex-col items-center text-center w-32 flex-shrink-0">
                    <div className="w-8 h-8 rounded-full border-2 border-hp-cg text-hp-cg flex items-center justify-center text-xs font-bold mb-2">
                      {i + 1}
                    </div>
                    <p className="font-display font-bold text-hp-paper text-xs mb-1">{step.title}</p>
                    <p className="text-hp-paper/50 text-[11px]">{step.body}</p>
                  </div>
                  {i < PARTNERSHIP_JOURNEY.length - 1 && <div className="flex-1 h-px bg-white/10 mt-4" />}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Final CTA */}
        <div className="text-center pb-20">
          <EditorialHeading size="sm">Ready to Build a More Connected Cricket Ecosystem?</EditorialHeading>
          <p className="text-sm text-hp-paper/50 mt-4 mb-8">
            Tell us about your organisation and explore how CRIC HQ could support your cricket ecosystem.
          </p>
          <EditorialButton href="/partnerships/cricket-board/apply" size="lg">Register Your Interest</EditorialButton>
        </div>
      </div>
    </PartnershipPageShell>
  );
}
