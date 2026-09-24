import { PartnershipPageShell } from "@/components/PartnershipPageShell";
import { Eyebrow, EditorialButton, EditorialHeading, CapabilityGrid } from "@/components/editorial/EditorialUI";
import Link from "next/link";

// Every item here is a real, shipped capability — the same underlying tools described on the
// Academies/Coaches/Associations pages, framed here as the platform as a whole rather than
// per-audience. Nothing here requires match scoring or live data that doesn't exist yet.
const CAPABILITIES = [
  { title: "Player Management", body: "Every player's profile, progress and history in one connected record." },
  { title: "Coach Management", body: "Onboard coaches, assign players and manage coaching activity." },
  { title: "Sessions & Programs", body: "Plan and run individual and group sessions, bookings and session packs." },
  { title: "Attendance", body: "Record attendance for every session and track participation over time." },
  { title: "Development Plans", body: "Set development plans and track each player's priorities as they progress." },
  { title: "Performance Reporting", body: "AI-assisted, human-validated biomechanics reports for every player." },
  { title: "Communication", body: "Message players, parents and coaches directly from the platform." },
  { title: "Organisation Reporting", body: "Reporting across players, coaches, programs and organisations." },
];

const AUDIENCES = [
  { title: "Academies", body: "Run and grow a cricket academy end to end.", href: "/organisations/academies" },
  { title: "Coaches", body: "Less administration, more coaching.", href: "/organisations/coaches" },
  { title: "Associations", body: "Connect clubs, academies and coaches.", href: "/organisations/associations" },
  { title: "Cricket Boards", body: "A tailored enterprise partnership.", href: "/partnerships/cricket-board" },
];

export const metadata = {
  title: "The CRIC HQ Platform",
  description: "Player management, coach management, sessions, attendance, development plans and AI-assisted performance reporting — the connected platform behind CRIC HQ.",
};

export default function PlatformPage() {
  return (
    <PartnershipPageShell>
      <div className="max-w-5xl mx-auto px-6 sm:px-10">
        {/* Hero */}
        <div className="pt-14 pb-16 text-center">
          <div className="flex justify-center mb-6"><Eyebrow>The Platform</Eyebrow></div>
          <EditorialHeading size="lg" level="h1">One Connected Platform for Cricket Organisations</EditorialHeading>
          <p className="text-lg text-hp-paper/70 max-w-2xl mx-auto mt-6 mb-3">
            Players, coaches, sessions, development and reporting — brought together instead of spread across spreadsheets and disconnected tools.
          </p>
          <EditorialButton href="/contact" size="lg">Talk to Us</EditorialButton>
        </div>

        {/* Capabilities */}
        <div className="mb-16">
          <div className="text-center mb-10"><EditorialHeading size="sm">What the Platform Does Today</EditorialHeading></div>
          <CapabilityGrid items={CAPABILITIES} cols={4} />
        </div>

        {/* Audiences */}
        <div className="mb-16">
          <div className="text-center mb-10"><EditorialHeading size="sm">Built Around How You Run Cricket</EditorialHeading></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-t border-white/8">
            {AUDIENCES.map((a, i) => (
              <div key={a.title} className={`p-6 flex flex-col border-b sm:border-b-0 border-white/8 ${i > 0 ? "sm:border-l" : ""}`}>
                <p className="font-display font-black text-hp-paper uppercase text-lg mb-2">{a.title}</p>
                <p className="text-hp-paper/60 text-sm mb-5 flex-1 leading-relaxed">{a.body}</p>
                <Link href={a.href} className="font-mono text-xs font-bold text-hp-cg hover:underline uppercase tracking-wider">
                  Explore →
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Final CTA */}
        <div className="text-center pb-20">
          <EditorialHeading size="sm">See the Platform in Action</EditorialHeading>
          <p className="text-sm text-hp-paper/50 mt-4 mb-8">
            Talk to us about what CRIC HQ can connect for your organisation.
          </p>
          <EditorialButton href="/contact" size="lg">Talk to Us</EditorialButton>
        </div>
      </div>
    </PartnershipPageShell>
  );
}
