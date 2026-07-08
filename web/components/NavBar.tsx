"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import type { UserRole } from "@/lib/types";

const NAV_ALL = [
  { label: "Players",  href: "/players" },
  { label: "Sessions", href: "/sessions" },
  { label: "Academy",  href: "/academy" },
  { label: "Bookings", href: "/bookings" },
  { label: "Packs",    href: "/session-packs" },
  { label: "Coaches",  href: "/coaches" },
  { label: "Reports",  href: "/reports" },
  { label: "Performance", href: "/performance" },
];

const ROLE_LABELS: Record<UserRole, string> = {
  platform_admin: "Platform Admin",
  academy_admin:  "Academy Admin",
  coach:          "Coach",
  player:         "Player",
  parent:         "Parent / Guardian",
};

const ROLE_STYLES: Record<UserRole, string> = {
  platform_admin: "bg-amber/20 text-amber border-amber/30",
  academy_admin:  "bg-blue-500/20 text-blue-400 border-blue-500/30",
  coach:          "bg-pace-green/20 text-pace-green border-pace-green/30",
  player:         "bg-purple-500/20 text-purple-400 border-purple-500/30",
  parent:         "bg-fire/20 text-fire border-fire/30",
};

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (user?.role !== "platform_admin") return;
    fetch("/api/pending-approvals")
      .then((r) => r.json())
      .then((d) => setPendingCount(d.requests?.length ?? 0))
      .catch(() => {});
  }, [user]);

  // Close the mobile menu automatically whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const initials = user
    ? user.name.split(" ").map((n) => n[0]).join("")
    : "?";

  const isPlayerOrParent = user?.role === "player" || user?.role === "parent";

  const navLinks = isPlayerOrParent
    ? [
        { label: "Academy", href: "/portal/learn" },
        { label: "Find a Coach", href: "/portal/find-coach" },
      ]
    : [
        ...NAV_ALL,
        ...(user?.role === "platform_admin" ? [{ label: "Approvals", href: "/admin/approvals" }] : []),
      ];

  // "Approvals" is docked as a fixed icon button on desktop (see below) rather than living in the
  // scrolling nav row — with a long name + role badge there often isn't room for a 9th nav item,
  // and a squeezed flex item with whitespace-nowrap text just overflows invisibly instead of wrapping.
  const desktopNavLinks = navLinks.filter((item) => item.label !== "Approvals");

  function linkClasses(href: string, amber = false) {
    const isActive = pathname.startsWith(href);
    if (isActive) return amber ? "text-amber border-amber" : "text-pace-green border-pace-green";
    return "text-zinc-400 border-transparent hover:text-white";
  }

  return (
    <header className="bg-surface border-b border-zinc-700/60 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center h-16 gap-4 lg:gap-8">
        {/* Logo */}
        <Link href={isPlayerOrParent ? "/portal" : "/players"} className="flex items-center gap-2 flex-shrink-0">
          <svg width="22" height="22" viewBox="0 0 32 32" fill="none" className="flex-shrink-0">
            <path
              d="M3 26 L9 17 L15 19.5 L21 9 L27 13"
              stroke="#00D4AA"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="27" cy="13" r="2.5" fill="#FF6B2B" />
          </svg>
          <span className="text-lg font-bold tracking-widest text-white font-mono hidden sm:inline">
            PACE HQ
          </span>
        </Link>

        {/* Desktop nav — scrolls horizontally rather than squeezing/overlapping when it doesn't fit */}
        <nav className="hidden lg:flex items-stretch gap-1 flex-1 min-w-0 overflow-x-auto">
          {desktopNavLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-4 flex items-center flex-shrink-0 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${linkClasses(item.href)}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex-1 lg:hidden" />

        {/* User + role (desktop) */}
        {user && (
          <div className="hidden lg:flex items-center gap-3 flex-shrink-0">
            {user.role === "platform_admin" && (
              <Link
                href="/admin/approvals"
                title="Approvals"
                className={`relative p-2 rounded-lg transition-colors flex-shrink-0 ${
                  pathname.startsWith("/admin/approvals") ? "text-amber bg-amber/10" : "text-zinc-400 hover:text-white hover:bg-zinc-700/50"
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {pendingCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold px-1 py-0.5 rounded-full min-w-[16px] text-center leading-none">
                    {pendingCount}
                  </span>
                )}
              </Link>
            )}
            <div className="text-right min-w-0">
              <p className="text-sm font-medium text-white leading-tight truncate max-w-[160px]">{user.name}</p>
              <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${ROLE_STYLES[user.role]}`}>
                {ROLE_LABELS[user.role]}
              </span>
            </div>
            <div className="w-9 h-9 rounded-full bg-pace-green flex items-center justify-center text-black font-bold text-sm flex-shrink-0">
              {initials}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-zinc-500 hover:text-white transition-colors cursor-pointer px-2.5 py-1.5 rounded-lg hover:bg-zinc-700/50 text-sm font-medium flex-shrink-0"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Sign out</span>
            </button>
          </div>
        )}

        {/* Mobile: avatar + hamburger */}
        {user && (
          <div className="flex lg:hidden items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-pace-green flex items-center justify-center text-black font-bold text-xs flex-shrink-0">
              {initials}
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              className="p-2 -mr-2 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            >
              {mobileOpen ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Mobile dropdown panel */}
      {user && mobileOpen && (
        <div className="lg:hidden border-t border-zinc-700/60 bg-surface max-h-[calc(100vh-4rem)] overflow-y-auto">
          <nav className="flex flex-col px-2 py-2">
            {navLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium flex items-center justify-between ${
                  pathname.startsWith(item.href) ? "text-pace-green bg-ink" : "text-zinc-300 hover:bg-zinc-800/60"
                }`}
              >
                {item.label}
                {item.label === "Approvals" && pendingCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                    {pendingCount}
                  </span>
                )}
              </Link>
            ))}
          </nav>
          <div className="border-t border-zinc-700/60 px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white leading-tight truncate">{user.name}</p>
              <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${ROLE_STYLES[user.role]}`}>
                {ROLE_LABELS[user.role]}
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer px-3 py-2 rounded-lg hover:bg-zinc-700/50 text-sm font-medium flex-shrink-0"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
