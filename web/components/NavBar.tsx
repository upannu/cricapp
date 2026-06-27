"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Players", href: "/players" },
  { label: "Sessions", href: "/sessions" },
  { label: "Academy", href: "/academy" },
  { label: "Bookings", href: "/bookings" },
  { label: "Reports", href: "/reports" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <header className="bg-surface border-b border-zinc-700/60 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 flex items-stretch h-16 gap-8">
        {/* Logo */}
        <Link href="/players" className="flex items-center gap-2.5 mr-4">
          <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
            <path
              d="M3 26 L9 17 L15 19.5 L21 9 L27 13"
              stroke="#00D4AA"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="27" cy="13" r="2.5" fill="#FF6B2B" />
          </svg>
          <span className="text-lg font-bold tracking-widest text-white font-mono">
            PACE HQ
          </span>
        </Link>

        {/* Nav items */}
        <nav className="flex items-stretch gap-1 flex-1">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 flex items-center text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "text-pace-green border-pace-green"
                    : "text-zinc-400 border-transparent hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-white">Coach Sukhi</p>
            <p className="text-xs text-zinc-500">Coach Pro</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-pace-green flex items-center justify-center text-black font-bold text-sm">
            CS
          </div>
        </div>
      </div>
    </header>
  );
}
