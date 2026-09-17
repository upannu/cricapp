import Link from "next/link";
import { PartnershipPageShell } from "@/components/PartnershipPageShell";

// The three pillars are grouped intentionally: Coach Development and Athlete Development
// describe the program itself (coach-led, hedged where the coach-pathway/certification model
// isn't finalised yet), while Performance Intelligence is deliberately confident — it maps
// directly onto CRIC HQ's existing reports/review pipeline, not a future feature.
const PILLARS = [
  { icon: "🎓", title: "Coach Development", body: "A structured coach development pathway, from foundational fast bowling coaching through to advanced practical work." },
  { icon: "🏃", title: "Athlete Development", body: "Structured fast bowling development for athletes, connecting training, sessions and coach feedback in one place." },
  { icon: "📊", title: "Performance Intelligence", body: "AI-assisted, human-validated performance reporting, giving coaches and athletes a clear view of progress over time." },
];

// Guardian consent and video-based coaching are real, already-shipped CRIC HQ capabilities
// (guardian_consent tracking on player records, video annotations, biomechanics reports with a
// human review step). The pathway/certification and program-wide rollup items are genuinely new
// and are phrased as "designed to help"/"can be shaped to" rather than delivered features.
const CAPABILITIES = [
  { title: "Structured Coach Pathway", body: "Designed to help coaches progress through a staged development pathway, from foundational fast bowling coaching to advanced practical work." },
  { title: "Athlete Development Plans", body: "Set development plans and track progress as athletes work through the program." },
  { title: "Session & Attendance Tracking", body: "Plan sessions and track attendance across the program." },
  { title: "AI-Assisted, Human-Validated Reporting", body: "Performance reports covering technical and physical progress, reviewed by a coach before they reach the athlete." },
  { title: "Video-Based Coaching", body: "Capture and review footage as part of ongoing coach feedback." },
  { title: "Coach Notes & Assessments", body: "Coach assessments and notes captured alongside every session." },
  { title: "Guardian Consent & Athlete Welfare", body: "Built on CRIC HQ's existing guardian consent and athlete data protections for junior athletes." },
  { title: "Program-Wide Visibility", body: "Designed to give program leads visibility across athletes and coaches as the program grows." },
];

export const metadata = {
  title: "Fast Bowling Development Program | CRIC HQ",
  description: "A specialist fast bowling development ecosystem combining coach development, athlete development and AI-assisted, human-validated performance intelligence.",
};

export default function FastBowlingDevelopmentPage() {
  return (
    <PartnershipPageShell>
      <div className="max-w-5xl mx-auto px-6 sm:px-10">
        {/* Hero */}
        <div className="pt-10 pb-16 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-pace-green mb-4">🏏 Specialist Development Program</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4 text-balance">Build Better Fast Bowlers. Build Better Coaches.</h1>
          <p className="text-lg text-zinc-300 max-w-2xl mx-auto mb-3">
            A complete fast bowling development ecosystem combining specialist coaching, athlete development and CRIC HQ technology.
          </p>
          <p className="text-sm text-zinc-500 max-w-xl mx-auto mb-8">
            Delivered by a specialist fast bowling coaching lead, powered by the CRIC HQ platform.
          </p>
          <Link href="/programs/fast-bowling-development/apply"
            className="inline-block px-7 py-3 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity">
            Register Your Interest
          </Link>
        </div>

        {/* Three pillars */}
        <div className="mb-16">
          <h2 className="text-xl font-bold text-white text-center mb-8">Coach. Athlete. Intelligence.</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PILLARS.map((p) => (
              <div key={p.title} className="bg-surface rounded-2xl p-5 text-center">
                <div className="text-3xl mb-3">{p.icon}</div>
                <p className="text-white font-semibold text-sm mb-1">{p.title}</p>
                <p className="text-zinc-500 text-xs">{p.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Capabilities */}
        <div className="mb-16">
          <h2 className="text-xl font-bold text-white text-center mb-8">What the Program Includes</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CAPABILITIES.map((c) => (
              <div key={c.title} className="bg-surface rounded-2xl p-5">
                <p className="text-white font-semibold text-sm mb-1">{c.title}</p>
                <p className="text-zinc-500 text-xs">{c.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Final CTA */}
        <div className="text-center pb-16">
          <h2 className="text-xl font-bold text-white mb-2">Ready to Bring Fast Bowling Development to Your Organisation?</h2>
          <p className="text-sm text-zinc-500 mb-6">
            Available for academies, coaches and associations, and as part of a full Cricket Board partnership for federation-wide rollout.
          </p>
          <Link href="/programs/fast-bowling-development/apply"
            className="inline-block px-7 py-3 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity">
            Register Your Interest
          </Link>
        </div>
      </div>
    </PartnershipPageShell>
  );
}
