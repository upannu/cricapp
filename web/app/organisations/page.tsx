import Link from "next/link";
import { PartnershipPageShell } from "@/components/PartnershipPageShell";
import { Eyebrow, EditorialButton, EditorialHeading, CapabilityGrid } from "@/components/editorial/EditorialUI";

// Each card's `href` is a route that exists today; a future org type (Clubs, Schools,
// Universities, Professional Teams) can be appended here without touching the layout.
const ORG_TYPES = [
  { title: "Academies", body: "Manage players, coaches, sessions and development in one place.", cta: "Explore Academy", href: "/organisations/academies" },
  { title: "Coaches", body: "Manage players, memberships, sessions and development.", cta: "Explore Coaching", href: "/organisations/coaches" },
  { title: "Cricket Associations", body: "Connect clubs, academies, coaches and player pathways.", cta: "Explore Solutions", href: "/organisations/associations" },
  { title: "Cricket Boards", body: "A tailored enterprise partnership for governing bodies and large cricket organisations.", cta: "Explore Partnership", href: "/partnerships/cricket-board" },
];

const CAPABILITIES = [
  { title: "Player Development", body: "Track player pathways and development." },
  { title: "Coach Management", body: "Manage coaches and development programs." },
  { title: "Organisation Management", body: "Connect academies, clubs and affiliated organisations." },
  { title: "Performance Insights", body: "Access meaningful performance information." },
  { title: "Centralised Data", body: "Reduce fragmented systems and disconnected information." },
  { title: "Enterprise Reporting", body: "Access organisation-wide insights and reporting." },
];

export const metadata = {
  title: "CRIC HQ for Organisations",
  description: "Connected cricket management solutions for academies, coaches, associations and cricket organisations.",
};

export default function OrganisationsPage() {
  return (
    <PartnershipPageShell>
      <div className="max-w-5xl mx-auto px-6 sm:px-10">
        {/* Hero */}
        <div className="pt-14 pb-16 text-center">
          <div className="flex justify-center mb-6"><Eyebrow>Built For Every Level Of Cricket</Eyebrow></div>
          <EditorialHeading size="lg" level="h1">CRIC HQ for Organisations</EditorialHeading>
          <p className="text-lg text-hp-paper/65 max-w-2xl mx-auto mt-6 mb-8">
            One platform built to support cricket organisations of every size.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <EditorialButton href="#solutions" size="lg">Explore Solutions</EditorialButton>
            <EditorialButton href="/contact" variant="secondary" size="lg">Contact Us</EditorialButton>
          </div>
        </div>

        {/* Organisation types */}
        <div id="solutions" className="mb-20 scroll-mt-20">
          <div className="text-center mb-10"><EditorialHeading size="sm">Connected Solutions for Every Level of Cricket</EditorialHeading></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-t border-white/8">
            {ORG_TYPES.map((o, i) => (
              <div key={o.title} className={`p-6 flex flex-col border-b sm:border-b-0 border-white/8 ${i > 0 ? "sm:border-l" : ""}`}>
                <p className="font-display font-black text-hp-paper uppercase text-lg mb-2">{o.title}</p>
                <p className="text-hp-paper/60 text-sm mb-5 flex-1 leading-relaxed">{o.body}</p>
                <Link href={o.href} className="font-mono text-xs font-bold text-hp-cg hover:underline uppercase tracking-wider">
                  {o.cta} →
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Connected ecosystem */}
        <div className="mb-20">
          <div className="text-center mb-10"><EditorialHeading size="sm">One Connected Cricket Ecosystem</EditorialHeading></div>
          <div className="border border-white/8 p-10 flex flex-col items-center gap-3">
            {["Cricket Board / Association", "Regions / Districts"].map((step) => (
              <div key={step} className="flex flex-col items-center gap-3">
                <div className="px-5 py-2.5 border border-hp-cg/30 bg-hp-cg/5 text-hp-cg text-sm font-display font-bold uppercase text-center">
                  {step}
                </div>
                <div className="w-px h-5 bg-white/10" />
              </div>
            ))}
            <div className="flex flex-wrap justify-center gap-3">
              {["Academies", "Clubs", "Programs"].map((step) => (
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

        {/* Why CRIC HQ */}
        <div className="mb-20">
          <div className="text-center mb-10"><EditorialHeading size="sm">Why CRIC HQ</EditorialHeading></div>
          <CapabilityGrid items={CAPABILITIES} cols={3} />
        </div>

        {/* Enterprise CTA */}
        <div className="text-center pb-20">
          <EditorialHeading size="sm">Need a solution for your entire cricket organisation?</EditorialHeading>
          <p className="text-sm text-hp-paper/52 mt-4 mb-8">
            Explore a tailored CRIC HQ partnership built around your organisation.
          </p>
          <EditorialButton href="/partnerships/cricket-board" size="lg">Explore Cricket Board Partnership</EditorialButton>
        </div>
      </div>
    </PartnershipPageShell>
  );
}
