import { LogoMark } from "@/components/SiteNav";

/** Shared footer for the entire public site — same reasoning as SiteNav: HomePageV2,
 * PartnershipPageShell and LegalPageShell each used to hand-code their own footer with a
 * different set of links, so the bottom of the page also changed shape between pages, not just
 * the top. Every link here resolves to a real page — nothing here is a placeholder "#" link. */

const COLS: { heading: string; href: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "PLATFORM",
    href: "/platform",
    links: [
      { label: "Academies", href: "/organisations/academies" },
      { label: "Coaches", href: "/organisations/coaches" },
      { label: "Associations", href: "/organisations/associations" },
      { label: "Cricket Boards", href: "/partnerships/cricket-board" },
    ],
  },
  {
    heading: "PERFORMANCE",
    href: "/performance-intelligence",
    links: [{ label: "Fast Bowling Program", href: "/programs/fast-bowling-development" }],
  },
  {
    heading: "COMPANY",
    href: "/about",
    links: [
      { label: "About", href: "/about" },
      { label: "Organisations", href: "/organisations" },
      { label: "Contact", href: "/contact" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="bg-[#040507] border-t border-white/5">
      <div className="max-w-[1440px] mx-auto px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-16">
          <div className="col-span-2 md:col-span-1">
            <div className="mb-3">
              <LogoMark size="footer" />
            </div>
            <p className="font-mono text-[8px] tracking-wider text-hp-paper/72 leading-relaxed uppercase">
              The digital cricket ecosystem
            </p>
            <p className="font-mono text-[8px] tracking-wider text-hp-paper/82 leading-relaxed uppercase mt-1">
              crichq.com.au
            </p>
          </div>

          {COLS.map(({ heading, href, links }) => (
            <div key={heading}>
              <a href={href} className="block font-mono text-[8px] tracking-[0.28em] text-hp-paper/72 hover:text-hp-paper uppercase mb-4 transition-colors">{heading}</a>
              <ul className="space-y-2.5">
                {links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} className="text-[11px] text-hp-paper/65 hover:text-hp-paper transition-colors">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="font-mono text-[8px] tracking-widest text-hp-paper/85 uppercase">
            © {new Date().getFullYear()} CRIC HQ PTY LTD. All rights reserved. Design &amp; Developed by Kaus Milestone Pty Ltd
          </div>
          <div className="font-mono text-[8px] tracking-widest text-hp-paper/78 uppercase">
            EVERY BALL TELLS A STORY.
          </div>
        </div>
      </div>
    </footer>
  );
}
