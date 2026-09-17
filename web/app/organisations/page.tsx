import Link from "next/link";
import { PartnershipPageShell } from "@/components/PartnershipPageShell";

// Each card's `href` is a route that exists today; a future org type (Clubs, Schools,
// Universities, Professional Teams) can be appended here without touching the layout.
const ORG_TYPES = [
  { icon: "🏏", title: "Academies", body: "Manage players, coaches, sessions and development in one place.", cta: "Explore Academy", href: "/organisations/academies" },
  { icon: "👨‍🏫", title: "Coaches", body: "Manage players, memberships, sessions and development.", cta: "Explore Coaching", href: "/organisations/coaches" },
  { icon: "🏛", title: "Cricket Associations", body: "Connect clubs, academies, coaches and player pathways.", cta: "Explore Solutions", href: "/organisations/associations" },
  { icon: "🌏", title: "Cricket Boards", body: "A tailored enterprise partnership for governing bodies and large cricket organisations.", cta: "Explore Partnership", href: "/partnerships/cricket-board" },
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
        <div className="pt-10 pb-16 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4 text-balance">CRIC HQ for Organisations</h1>
          <p className="text-lg text-zinc-300 max-w-2xl mx-auto mb-8">
            One platform built to support cricket organisations of every size.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="#solutions"
              className="inline-block px-7 py-3 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity">
              Explore Solutions
            </Link>
            <Link href="/contact"
              className="inline-block px-7 py-3 text-zinc-300 text-sm font-bold rounded-xl border border-zinc-700 hover:bg-zinc-800 transition-colors">
              Contact Us
            </Link>
          </div>
        </div>

        {/* Organisation types */}
        <div id="solutions" className="mb-16 scroll-mt-20">
          <h2 className="text-xl font-bold text-white text-center mb-8">Connected Solutions for Every Level of Cricket</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ORG_TYPES.map((o) => (
              <div key={o.title} className="bg-surface rounded-2xl p-5 flex flex-col">
                <div className="text-3xl mb-3">{o.icon}</div>
                <p className="text-white font-semibold text-sm mb-1">{o.title}</p>
                <p className="text-zinc-500 text-xs mb-4 flex-1">{o.body}</p>
                <Link href={o.href} className="text-pace-green text-xs font-bold hover:underline">
                  {o.cta} →
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Connected ecosystem */}
        <div className="mb-16">
          <h2 className="text-xl font-bold text-white text-center mb-8">One Connected Cricket Ecosystem</h2>
          <div className="bg-surface rounded-2xl p-8 flex flex-col items-center gap-3">
            {["Cricket Board / Association", "Regions / Districts"].map((step) => (
              <div key={step} className="flex flex-col items-center gap-3">
                <div className="px-5 py-2.5 rounded-xl bg-pace-green/10 border border-pace-green/30 text-pace-green text-sm font-bold text-center">
                  {step}
                </div>
                <div className="w-px h-5 bg-zinc-700" />
              </div>
            ))}
            <div className="flex flex-wrap justify-center gap-3">
              {["Academies", "Clubs", "Programs"].map((step) => (
                <div key={step} className="px-5 py-2.5 rounded-xl bg-ink border border-zinc-700 text-zinc-300 text-sm font-semibold">
                  {step}
                </div>
              ))}
            </div>
            <div className="w-px h-5 bg-zinc-700" />
            <div className="px-5 py-2.5 rounded-xl bg-ink border border-zinc-700 text-zinc-300 text-sm font-semibold">
              Coaches
            </div>
            <div className="w-px h-5 bg-zinc-700" />
            <div className="px-5 py-2.5 rounded-xl bg-pace-green/10 border border-pace-green/30 text-pace-green text-sm font-bold">
              Players
            </div>
          </div>
        </div>

        {/* Why CRIC HQ */}
        <div className="mb-16">
          <h2 className="text-xl font-bold text-white text-center mb-8">Why CRIC HQ</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CAPABILITIES.map((c) => (
              <div key={c.title} className="bg-surface rounded-2xl p-5">
                <p className="text-white font-semibold text-sm mb-1">{c.title}</p>
                <p className="text-zinc-500 text-xs">{c.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Enterprise CTA */}
        <div className="text-center pb-16">
          <h2 className="text-xl font-bold text-white mb-2">Need a solution for your entire cricket organisation?</h2>
          <p className="text-sm text-zinc-500 mb-6">
            Explore a tailored CRIC HQ partnership built around your organisation.
          </p>
          <Link href="/partnerships/cricket-board"
            className="inline-block px-7 py-3 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity">
            Explore Cricket Board Partnership
          </Link>
        </div>
      </div>
    </PartnershipPageShell>
  );
}
