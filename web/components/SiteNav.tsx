"use client";

import { useState, useEffect } from 'react'
import Link from 'next/link'

/** Shared top nav for the entire public site — homepage, Platform/Performance, Organisations hub,
 * Academies/Coaches/Associations, Cricket Board partnership pages, and the legal pages. Previously
 * each shell (HomePageV2, PartnershipPageShell, LegalPageShell) hand-coded its own header with a
 * different set of links, so the nav visibly changed shape the moment you clicked into any page
 * from the homepage. This is the single source of truth going forward. */

const LOGO_SVG = '/hp-logo.svg'

export function LogoMark({ size = 'nav' }: { size?: 'nav' | 'footer' }) {
  const h = size === 'nav' ? 72 : 88
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small static badge with mix-blend-mode, next/image is overkill
    <img
      src={LOGO_SVG}
      alt="CRIC HQ"
      style={{ height: h, width: 'auto', objectFit: 'contain', mixBlendMode: 'screen', display: 'block', overflow: 'visible' }}
    />
  )
}

// Cricket (Live Scoring / Matches / Competitions / Fixtures / Results / Statistics) was
// deliberately dropped — none of that exists in the real product yet, and a nav item that's
// entirely "coming soon" isn't worth keeping. Each of these links straight to a real page — no
// dropdowns of placeholder sub-links, matching the rest of the public site's plain-link nav.
// FOR ORGS is the one exception: it's the only category with more than one genuinely real
// destination (Academies, Coaches, Associations, Cricket Boards all exist), so it alone keeps a
// real dropdown instead of collapsing to a single link.
export const NAV_LINKS: { label: string; href: string }[] = [
  { label: 'PLATFORM', href: '/platform' },
  { label: 'PERFORMANCE', href: '/performance-intelligence' },
  { label: 'COACHING', href: '/organisations/coaches' },
  { label: 'ABOUT', href: '/about' },
]

export const FOR_ORGS_LINKS: { label: string; href: string }[] = [
  { label: 'Overview', href: '/organisations' },
  { label: 'Academies', href: '/organisations/academies' },
  { label: 'Coaches', href: '/organisations/coaches' },
  { label: 'Associations', href: '/organisations/associations' },
  { label: 'Cricket Boards', href: '/partnerships/cricket-board' },
]

// Fixed height of the nav bar (84px) — pages that render it need this much top padding so content
// doesn't start underneath the fixed-position bar. Hardcode this as a Tailwind class (e.g.
// `pt-[84px]`) at each call site rather than importing a constant here: this file is a "use
// client" module, so a plain value export resolves to undefined when imported by a Server
// Component (exports from a client module become opaque client references on the server).

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [orgsOpen, setOrgsOpen] = useState(false)
  const [mobileOrgsOpen, setMobileOrgsOpen] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 30)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <nav
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-hp-ink/95 backdrop-blur-sm border-b border-hp-cn/40' : ''
      }`}
    >
      <div className="max-w-[1440px] mx-auto px-8 h-[84px] flex items-center justify-between overflow-visible">
        <Link href="/" className="flex items-center">
          <LogoMark size="nav" />
        </Link>

        <div className="hidden lg:flex items-center">
          {NAV_LINKS.slice(0, 3).map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className="px-3.5 py-2 font-mono text-[9px] tracking-[0.22em] text-hp-paper/85 hover:text-hp-paper uppercase transition-colors"
            >
              {label}
            </a>
          ))}

          <div
            className="relative"
            onMouseEnter={() => setOrgsOpen(true)}
            onMouseLeave={() => setOrgsOpen(false)}
          >
            <a
              href="/organisations"
              className="px-3.5 py-2 font-mono text-[9px] tracking-[0.22em] text-hp-paper/85 hover:text-hp-paper uppercase transition-colors inline-flex items-center gap-1.5"
            >
              FOR ORGS
              <svg width="7" height="5" viewBox="0 0 7 5" fill="none" className={`transition-transform duration-150 ${orgsOpen ? 'rotate-180' : ''}`}>
                <path d="M0.5 1L3.5 4L6.5 1" stroke="currentColor" strokeWidth="1" />
              </svg>
            </a>
            {orgsOpen && (
              <div className="absolute top-full left-0 pt-2 w-56">
                <div className="bg-hp-surface border border-white/10 py-2 shadow-xl">
                  {FOR_ORGS_LINKS.map((l) => (
                    <a
                      key={l.label}
                      href={l.href}
                      className="block px-4 py-2.5 font-mono text-[10px] tracking-[0.15em] text-hp-paper/75 hover:text-hp-paper hover:bg-white/5 uppercase transition-colors"
                    >
                      {l.label}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {NAV_LINKS.slice(3).map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className="px-3.5 py-2 font-mono text-[9px] tracking-[0.22em] text-hp-paper/85 hover:text-hp-paper uppercase transition-colors"
            >
              {label}
            </a>
          ))}
        </div>

        <div className="hidden lg:flex items-center gap-5">
          <a href="/login" className="text-[13px] text-hp-paper/72 hover:text-hp-paper transition-colors">
            Login
          </a>
          <a
            href="/signup"
            className="bg-hp-cg text-hp-paper font-display font-black text-sm px-7 py-2.5 tracking-[0.12em] uppercase hover:bg-hp-cg/90 transition-colors"
          >
            GET STARTED
          </a>
        </div>

        <button
          className="lg:hidden p-2 flex flex-col gap-1.5"
          onClick={() => setMobile(!mobile)}
          aria-label="Toggle menu"
        >
          <span
            className={`block w-5 h-px bg-hp-paper/70 transition-transform origin-center duration-200 ${
              mobile ? 'rotate-45 translate-y-[7px]' : ''
            }`}
          />
          <span
            className={`block w-5 h-px bg-hp-paper/70 transition-opacity duration-200 ${
              mobile ? 'opacity-0' : ''
            }`}
          />
          <span
            className={`block w-5 h-px bg-hp-paper/70 transition-transform origin-center duration-200 ${
              mobile ? '-rotate-45 -translate-y-[7px]' : ''
            }`}
          />
        </button>
      </div>

      {mobile && (
        <div className="lg:hidden bg-hp-surface border-t border-white/5 px-8 py-6">
          {NAV_LINKS.slice(0, 3).map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className="block py-3 font-mono text-[9px] tracking-[0.22em] text-hp-paper/85 hover:text-hp-paper border-b border-white/4 uppercase transition-colors"
            >
              {label}
            </a>
          ))}

          <div className="border-b border-white/4">
            <button
              type="button"
              onClick={() => setMobileOrgsOpen(!mobileOrgsOpen)}
              className="w-full flex items-center justify-between py-3 font-mono text-[9px] tracking-[0.22em] text-hp-paper/85 hover:text-hp-paper uppercase transition-colors"
            >
              FOR ORGS
              <svg width="7" height="5" viewBox="0 0 7 5" fill="none" className={`transition-transform duration-150 ${mobileOrgsOpen ? 'rotate-180' : ''}`}>
                <path d="M0.5 1L3.5 4L6.5 1" stroke="currentColor" strokeWidth="1" />
              </svg>
            </button>
            {mobileOrgsOpen && (
              <div className="pb-3 pl-4">
                {FOR_ORGS_LINKS.map((l) => (
                  <a
                    key={l.label}
                    href={l.href}
                    className="block py-2.5 font-mono text-[9px] tracking-[0.15em] text-hp-paper/70 hover:text-hp-paper uppercase transition-colors"
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          {NAV_LINKS.slice(3).map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className="block py-3 font-mono text-[9px] tracking-[0.22em] text-hp-paper/85 hover:text-hp-paper border-b border-white/4 uppercase transition-colors"
            >
              {label}
            </a>
          ))}
          <div className="mt-5 flex gap-3">
            <a href="/login" className="flex-1 text-center py-3 border border-white/15 text-[12px] text-hp-paper hover:bg-white/4 transition-colors">
              Login
            </a>
            <a href="/signup" className="flex-1 text-center py-3 bg-hp-cg text-hp-paper font-display font-black text-sm uppercase tracking-wide">
              Get Started
            </a>
          </div>
        </div>
      )}
    </nav>
  )
}
