"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useEffect, useRef, useState } from "react";
import type { UserRole } from "@/lib/types";

const ADMIN_TOOLS = [
  { label: "Manage Content", href: "/admin/academy" },
  { label: "Subscription Pricing", href: "/admin/pricing" },
  { label: "Plan Catalog", href: "/admin/plans" },
  { label: "Approvals", href: "/admin/approvals" },
  { label: "Platform KPIs", href: "/admin/kpis" },
  { label: "Platform Admins", href: "/admin/admins" },
];

const NAV_ALL = [
  { label: "Players",  href: "/players" },
  { label: "Sessions", href: "/sessions" },
  { label: "Attendance", href: "/attendance" },
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
  const { user, logout, refreshUser } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const adminMenuRef = useRef<HTMLDivElement>(null);
  const roleMenuRef = useRef<HTMLDivElement>(null);

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
    setAdminMenuOpen(false);
    setRoleMenuOpen(false);
  }, [pathname]);

  // Close the admin tools dropdown on outside click.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target as Node)) {
        setAdminMenuOpen(false);
      }
    }
    if (adminMenuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [adminMenuOpen]);

  // Close the role switcher dropdown on outside click.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (roleMenuRef.current && !roleMenuRef.current.contains(e.target as Node)) {
        setRoleMenuOpen(false);
      }
    }
    if (roleMenuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [roleMenuOpen]);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  async function handleSwitchRole(identity: { role: UserRole; academyId?: string; coachId?: string; playerId?: string }) {
    setSwitching(true);
    try {
      const res = await fetch("/api/switch-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: identity.role, academyId: identity.academyId, coachId: identity.coachId, playerId: identity.playerId,
        }),
      });
      if (res.ok) {
        await refreshUser();
        setRoleMenuOpen(false);
        router.push(identity.role === "player" || identity.role === "parent" ? "/portal" : "/players");
      }
    } finally {
      setSwitching(false);
    }
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
        ...(user?.role === "platform_admin" ? ADMIN_TOOLS : []),
      ];

  // Admin tools are docked as a single dropdown on desktop (see below) rather than living in the
  // scrolling nav row — with a long name + role badge there often isn't room for a 9th+ nav item,
  // and a squeezed flex item with whitespace-nowrap text just overflows invisibly instead of
  // wrapping. This also means adding another admin tool later never re-squeezes this row again.
  const desktopNavLinks = isPlayerOrParent ? navLinks : NAV_ALL;

  function linkClasses(href: string, amber = false) {
    const isActive = pathname.startsWith(href);
    if (isActive) return amber ? "text-amber border-amber" : "text-pace-green border-pace-green";
    return "text-zinc-400 border-transparent hover:text-white";
  }

  return (
    <header className="bg-surface border-b border-zinc-700/60 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center h-16 gap-4 xl:gap-5">
        {/* Logo */}
        <Link href={isPlayerOrParent ? "/portal" : "/players"} className="flex items-center gap-2 flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static badge, next/image is overkill */}
          <img src="/crichq_logo.jpeg" alt="CRIC HQ" width={32} height={32}
            className="w-8 h-8 rounded-full bg-white p-0.5 object-contain flex-shrink-0" />
          <span className="text-lg font-bold tracking-widest text-white font-mono hidden sm:inline">
            CRIC HQ
          </span>
        </Link>

        {/* Desktop nav — the header's max-w-7xl container caps content width at 1280px
            regardless of viewport, so this padding is tuned to fit all items with real margin
            to spare at that width rather than relying on overflow scroll to bail it out. Kept
            overflow-x-auto + thin-scrollbar as a fallback (not overflow-hidden or no-scrollbar)
            so a future added item degrades to a visible scroll rather than silently clipping. */}
        <nav className="hidden xl:flex items-stretch flex-1 min-w-0 overflow-x-auto thin-scrollbar">
          {desktopNavLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-2 flex items-center flex-shrink-0 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${linkClasses(item.href)}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex-1 xl:hidden" />

        {/* User + role (desktop) */}
        {user && (
          <div className="hidden xl:flex items-center gap-3 flex-shrink-0">
            {user.role === "platform_admin" && (
              <div className="relative flex-shrink-0" ref={adminMenuRef}>
                <button
                  type="button"
                  onClick={() => setAdminMenuOpen((v) => !v)}
                  title="Admin tools"
                  className={`relative p-2 rounded-lg transition-colors flex-shrink-0 cursor-pointer ${
                    adminMenuOpen || ADMIN_TOOLS.some((t) => pathname.startsWith(t.href))
                      ? "text-pace-green bg-pace-green/10"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-700/50"
                  }`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  {pendingCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold px-1 py-0.5 rounded-full min-w-[16px] text-center leading-none">
                      {pendingCount}
                    </span>
                  )}
                </button>

                {adminMenuOpen && (
                  <div className="absolute right-0 top-10 z-30 w-52 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl py-1 overflow-hidden">
                    {ADMIN_TOOLS.map((tool) => (
                      <Link
                        key={tool.href}
                        href={tool.href}
                        className={`flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                          pathname.startsWith(tool.href) ? "text-pace-green bg-pace-green/10" : "text-zinc-200 hover:bg-zinc-700 hover:text-white"
                        }`}
                      >
                        {tool.label}
                        {tool.label === "Approvals" && pendingCount > 0 && (
                          <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                            {pendingCount}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
            {user.linkedIdentities && user.linkedIdentities.length > 1 ? (
              <div className="relative flex-shrink-0" ref={roleMenuRef}>
                <button
                  type="button"
                  onClick={() => setRoleMenuOpen((v) => !v)}
                  className="flex items-center gap-2.5 cursor-pointer rounded-lg px-1.5 py-1 hover:bg-zinc-700/40 transition-colors"
                  title="Switch role"
                >
                  <div className="text-right min-w-0">
                    <p className="text-sm font-medium text-white leading-tight truncate max-w-[160px]">{user.name}</p>
                    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${ROLE_STYLES[user.role]}`}>
                      {ROLE_LABELS[user.role]}
                    </span>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-pace-green flex items-center justify-center text-black font-bold text-sm flex-shrink-0">
                    {initials}
                  </div>
                </button>
                {roleMenuOpen && (
                  <div className="absolute right-0 top-12 z-30 w-56 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl py-1 overflow-hidden">
                    <p className="px-4 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Switch role</p>
                    {user.linkedIdentities.map((identity, i) => {
                      const isActive = identity.role === user.role
                        && (identity.academyId ?? undefined) === user.academyId
                        && (identity.coachId ?? undefined) === user.coachId
                        && (identity.playerId ?? undefined) === user.playerId;
                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={isActive || switching}
                          onClick={() => handleSwitchRole(identity)}
                          className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors cursor-pointer disabled:cursor-default ${
                            isActive ? "text-pace-green bg-pace-green/10" : "text-zinc-200 hover:bg-zinc-700 hover:text-white"
                          }`}
                        >
                          {ROLE_LABELS[identity.role]}
                          {isActive && <span className="text-xs">✓ Active</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="text-right min-w-0">
                  <p className="text-sm font-medium text-white leading-tight truncate max-w-[160px]">{user.name}</p>
                  <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${ROLE_STYLES[user.role]}`}>
                    {ROLE_LABELS[user.role]}
                  </span>
                </div>
                <div className="w-9 h-9 rounded-full bg-pace-green flex items-center justify-center text-black font-bold text-sm flex-shrink-0">
                  {initials}
                </div>
              </>
            )}
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
          <div className="flex xl:hidden items-center gap-2 flex-shrink-0">
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
        <div className="xl:hidden border-t border-zinc-700/60 bg-surface max-h-[calc(100vh-4rem)] overflow-y-auto">
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
          {user.linkedIdentities && user.linkedIdentities.length > 1 && (
            <div className="border-t border-zinc-700/60 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Switch role</p>
              <div className="flex flex-wrap gap-2">
                {user.linkedIdentities.map((identity, i) => {
                  const isActive = identity.role === user.role
                    && (identity.academyId ?? undefined) === user.academyId
                    && (identity.coachId ?? undefined) === user.coachId
                    && (identity.playerId ?? undefined) === user.playerId;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={isActive || switching}
                      onClick={() => handleSwitchRole(identity)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer disabled:cursor-default ${
                        isActive ? "border-pace-green bg-pace-green/10 text-pace-green" : "border-zinc-700 text-zinc-300"
                      }`}
                    >
                      {ROLE_LABELS[identity.role]}{isActive ? " ✓" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
