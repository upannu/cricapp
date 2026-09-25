"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useEffect, useRef, useState } from "react";
import type { PartnershipApplication, UserRole } from "@/lib/types";

/**
 * Grouped primary navigation — Training/Academy/Insights are dropdowns; everything else is a
 * direct link. Config-driven so adding/removing a destination never touches the render logic,
 * only this list. The "Academy" child under the Academy group intentionally shares its parent's
 * label: there is no separate "Academies" listing route in this app (only a single /academy
 * management page — see AcademyClient), so the group and its one real destination are the same
 * page, just as they were before this was a dropdown at all.
 */
type NavLeaf = { label: string; href: string };
type NavGroup = { label: string; children: NavLeaf[] };
type NavEntry = NavLeaf | NavGroup;
function isNavGroup(entry: NavEntry): entry is NavGroup { return "children" in entry; }

const NAV_STRUCTURE: NavEntry[] = [
  { label: "Players", href: "/players" },
  { label: "Training", children: [
    { label: "Coaching Sessions", href: "/sessions" },
    { label: "Squad Training", href: "/attendance" },
  ] },
  { label: "Academy", children: [
    { label: "Academy", href: "/academy" },
    { label: "Coaches", href: "/coaches" },
  ] },
  { label: "Bookings", href: "/bookings" },
  { label: "Memberships", href: "/session-packs" },
  { label: "Insights", children: [
    { label: "Reports", href: "/reports" },
    { label: "Performance", href: "/performance" },
  ] },
];

/**
 * Admin Center — same destinations as the old flat ADMIN_TOOLS list, grouped and relabeled for
 * display only. Routes and permission (platform_admin) are unchanged; "Manage Content" stays at
 * its existing /admin/academy route (an unrelated-looking URL for a real reason — see NAV_STRUCTURE's
 * own comment on why that route doesn't feed the Academy nav group) even though its label is now
 * "Content".
 */
type AdminItem = { label: string; href: string };
type AdminSection = { section: string; items: AdminItem[] };

const ADMIN_STRUCTURE: AdminSection[] = [
  { section: "Platform", items: [
    { label: "Approvals", href: "/admin/approvals" },
    { label: "Platform KPIs", href: "/admin/kpis" },
  ] },
  { section: "Content & Communications", items: [
    { label: "Content", href: "/admin/academy" },
    { label: "Email Templates", href: "/admin/email-templates" },
  ] },
  { section: "Commercial", items: [
    { label: "Plans & Pricing", href: "/admin/plans" },
    { label: "Partnerships", href: "/admin/partnerships" },
  ] },
  { section: "Growth", items: [
    { label: "Referrals", href: "/admin/referrals" },
  ] },
  { section: "Access & Security", items: [
    { label: "Admin Users", href: "/admin/admins" },
  ] },
];
const ADMIN_ITEMS_FLAT: AdminItem[] = ADMIN_STRUCTURE.flatMap((s) => s.items);

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
  const [partnershipPendingCount, setPartnershipPendingCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Which single desktop dropdown is open, if any — Training/Academy/Insights and Admin Center
  // are mutually exclusive by construction (opening one closes any other via the same state).
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [playerNames, setPlayerNames] = useState<Record<string, { name: string; academyName: string | null }>>({});
  // Which sections are expanded in the mobile panel — Training/Academy/Insights/Admin Center all
  // start collapsed there; Players/Bookings/Memberships are plain links with nothing to expand.
  const [mobileExpanded, setMobileExpanded] = useState<Record<string, boolean>>({});
  const navRef = useRef<HTMLDivElement>(null);
  const adminRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user?.role !== "platform_admin") return;
    fetch("/api/pending-approvals")
      .then((r) => r.json())
      .then((d) => setPendingCount(d.requests?.length ?? 0))
      .catch(() => {});
  }, [user]);

  // Newly submitted (not yet reviewed) Cricket Board Partnership applications — same "silent
  // otherwise" gap the Approvals badge already covers for role requests: the /apply form sends a
  // best-effort admin email, but if that fails there was previously nothing in-app to notice a
  // new lead came in.
  useEffect(() => {
    if (user?.role !== "platform_admin") return;
    fetch("/api/partnerships/list")
      .then((r) => r.json())
      .then((d) => setPartnershipPendingCount(
        (d.applications as PartnershipApplication[] ?? []).filter((a) => a.status === "submitted").length,
      ))
      .catch(() => {});
  }, [user]);

  const totalPendingCount = pendingCount + partnershipPendingCount;

  // Two linked children of the same role both show as "Player"/"Parent / Guardian" unless we
  // fetch their actual names — RLS only lets the caller read their currently-active player row,
  // so this goes through a dedicated route (see api/players/linked-names) rather than a direct
  // client-side query.
  useEffect(() => {
    const playerIds = (user?.linkedIdentities ?? [])
      .map((li) => li.playerId)
      .filter((id): id is string => !!id);
    if (playerIds.length < 2) { setPlayerNames({}); return; }
    fetch("/api/players/linked-names", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerIds }),
    })
      .then((r) => r.json())
      .then((d) => {
        const map: Record<string, { name: string; academyName: string | null }> = {};
        for (const p of d.players ?? []) map[p.id] = { name: p.name, academyName: p.academyName };
        setPlayerNames(map);
      })
      .catch(() => {});
  }, [user?.linkedIdentities]);

  // A kid with no email of their own often ends up sharing a parent's — which can genuinely
  // produce two identities for the *same* playerId (one role: "parent", one role: "player": the
  // parent acting as the child, and the parent acting as themself). Naming both entries after
  // just the player would make two legitimately different views look like an exact duplicate, so
  // the role always comes first here — same convention as ROLE_LABELS everywhere else in this bar.
  function identityLabel(identity: { role: UserRole; playerId?: string }): string {
    if (identity.playerId && playerNames[identity.playerId]) {
      const p = playerNames[identity.playerId];
      const name = p.academyName ? `${p.name} · ${p.academyName}` : p.name;
      return `${ROLE_LABELS[identity.role]} · ${name}`;
    }
    return ROLE_LABELS[identity.role];
  }

  // Close every menu automatically whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
    setOpenGroup(null);
    setUserMenuOpen(false);
    setMobileExpanded({});
  }, [pathname]);

  // Close the open dropdown (nav group or Admin Center) on an outside click. Admin Center lives
  // in its own trigger+panel outside the <nav> element (it's docked in the user area, not the
  // scrolling link row), so a click has to fall outside *both* containers before it counts as
  // "outside" — checking navRef alone would close the Admin Center panel on its own first click.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const insideNav = navRef.current?.contains(target);
      const insideAdmin = adminRef.current?.contains(target);
      if (!insideNav && !insideAdmin) setOpenGroup(null);
    }
    if (openGroup) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openGroup]);

  // Escape closes whichever desktop dropdown is currently open — neither the nav groups nor
  // Admin Center previously supported this at all (only outside-click did).
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenGroup(null);
    }
    if (openGroup) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [openGroup]);

  // Close the role switcher dropdown on outside click.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [userMenuOpen]);

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
        setUserMenuOpen(false);
        router.push(identity.role === "player" || identity.role === "parent" ? "/portal" : "/players");
      }
    } finally {
      setSwitching(false);
    }
  }

  // Capped at 2 letters and stripped of anything but letters first — an unadorned "Dev Admin"
  // was always fine, but a display name carrying a parenthetical aside (e.g. a dev/staging
  // account's "Dev Admin (real email)") used to leak that punctuation straight into the avatar
  // ("DA(e") since the old version took the first character of every space-separated word with
  // no cap and no filtering.
  const initials = user
    ? user.name.replace(/[^\p{L}\s]/gu, "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join("") || "?"
    : "?";

  const isPlayerOrParent = user?.role === "player" || user?.role === "parent";
  const isPlatformAdmin = user?.role === "platform_admin";

  const playerPortalLinks: NavLeaf[] = [
    { label: "Academy", href: "/portal/learn" },
    { label: "Find a Coach", href: "/portal/find-coach" },
  ];

  function groupIsActive(group: NavGroup): boolean {
    return group.children.some((c) => pathname.startsWith(c.href));
  }

  function toggleGroup(label: string) {
    setOpenGroup((v) => (v === label ? null : label));
  }

  function toggleMobileSection(label: string) {
    setMobileExpanded((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  const adminIsActive = ADMIN_ITEMS_FLAT.some((t) => pathname.startsWith(t.href));

  return (
    <header className="bg-hp-surface border-b border-white/12 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center h-16 gap-4 xl:gap-5">
        {/* Logo — same vectorized mark as the public site (public/hp-logo.svg), swapped in for
            brand continuity between the marketing site and the dashboard. Screen blend mode
            reads the same way against this header's dark bg-hp-surface as it does against the
            public site's hp-ink; the wordmark stays a plain text span rather than switching to
            Barlow Condensed, since the dashboard keeps its own (Geist) type system. */}
        <Link href={isPlayerOrParent ? "/portal" : "/players"} className="flex items-center gap-2 flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static badge, next/image is overkill */}
          <img src="/hp-logo.svg" alt="CRIC HQ" width={36} height={27}
            style={{ height: 36, width: "auto", objectFit: "contain", mixBlendMode: "screen" }}
            className="flex-shrink-0" />
          <span className="text-lg font-bold tracking-widest text-hp-paper font-mono hidden sm:inline">
            CRIC HQ
          </span>
        </Link>

        {/* Desktop nav — the header's max-w-7xl container caps content width at 1280px
            regardless of viewport, so every item fits with real margin to spare at that width.
            Deliberately no overflow-x-auto here: the Training/Academy/Insights dropdown panels
            are absolutely positioned inside this row, and any overflow-x on an ancestor forces
            overflow-y to auto too (CSS spec), which clips the open dropdown instead of letting
            it hang below the bar. */}
        <nav ref={navRef} className="hidden xl:flex items-stretch flex-1 min-w-0">
          {(isPlayerOrParent ? playerPortalLinks : NAV_STRUCTURE).map((entry) => {
            if (!isNavGroup(entry)) {
              const isActive = pathname.startsWith(entry.href);
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className={`px-2 flex items-center flex-shrink-0 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive ? "text-hp-cg border-hp-cg" : "text-hp-paper/45 border-transparent hover:text-hp-paper"
                  }`}
                >
                  {entry.label}
                </Link>
              );
            }
            const active = groupIsActive(entry);
            const open = openGroup === entry.label;
            return (
              <div key={entry.label} className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => toggleGroup(entry.label)}
                  aria-haspopup="true"
                  aria-expanded={open}
                  className={`px-2 h-full flex items-center gap-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                    // Active (a child route is the current page) gets the same strong underline
                    // every other nav item uses for "you are here" — that must stay unique to it.
                    // Open-but-not-active (the dropdown is merely expanded) gets a distinct, subtle
                    // treatment instead: brighter text and a faint background, no underline — so an
                    // open Training menu never reads as "you're on the Training page" the way an
                    // active Memberships link does. The arrow's own rotation already signals open
                    // state independent of color.
                    active
                      ? "text-hp-cg border-hp-cg"
                      : open
                      ? "text-hp-paper border-transparent bg-white/5"
                      : "text-hp-paper/45 border-transparent hover:text-hp-paper"
                  }`}
                >
                  {entry.label}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    className={`transition-transform ${open ? "rotate-180" : ""}`}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {open && (
                  <div className="absolute left-0 top-full z-30 w-52 bg-white/8 border border-white/12 shadow-xl py-1 overflow-hidden">
                    {entry.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`block px-4 py-2.5 text-sm transition-colors ${
                          pathname.startsWith(child.href) ? "text-hp-cg bg-hp-cg/10" : "text-hp-paper/80 hover:bg-white/8 hover:text-hp-paper"
                        }`}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="flex-1 xl:hidden" />

        {/* User + role (desktop) */}
        {user && (
          <div className="hidden xl:flex items-center gap-3 flex-shrink-0">
            {isPlatformAdmin && (
              <div className="relative flex-shrink-0" ref={adminRef}>
                <button
                  type="button"
                  onClick={() => toggleGroup("admin")}
                  title="Admin Center"
                  aria-label="Admin Center"
                  aria-haspopup="true"
                  aria-expanded={openGroup === "admin"}
                  className={`relative p-2 transition-colors flex-shrink-0 cursor-pointer ${
                    openGroup === "admin" || adminIsActive
                      ? "text-hp-cg bg-hp-cg/10"
                      : "text-hp-paper/45 hover:text-hp-paper hover:bg-white/8"
                  }`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  {totalPendingCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-hp-paper text-[9px] font-bold px-1 py-0.5 rounded-full min-w-[16px] text-center leading-none">
                      {totalPendingCount}
                    </span>
                  )}
                </button>

                {openGroup === "admin" && (
                  <div role="menu" aria-label="Admin Center" className="absolute right-0 top-10 z-30 w-80 bg-white/8 border border-white/12 shadow-xl py-2 overflow-hidden">
                    <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-hp-paper/45 border-b border-white/12">Admin Center</p>
                    {ADMIN_STRUCTURE.map((group, i) => (
                      <div key={group.section} className={i > 0 ? "mt-2" : "mt-1"}>
                        <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-hp-paper/45">{group.section}</p>
                        {group.items.map((tool) => (
                          <Link
                            key={tool.href}
                            href={tool.href}
                            role="menuitem"
                            className={`flex items-center justify-between px-4 py-2 text-sm transition-colors ${
                              pathname.startsWith(tool.href) ? "text-hp-cg bg-hp-cg/10" : "text-hp-paper/80 hover:bg-white/8 hover:text-hp-paper"
                            }`}
                          >
                            {tool.label}
                            {tool.href === "/admin/approvals" && pendingCount > 0 && (
                              <span className="bg-red-500 text-hp-paper text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                {pendingCount}
                              </span>
                            )}
                            {tool.href === "/admin/partnerships" && partnershipPendingCount > 0 && (
                              <span className="bg-red-500 text-hp-paper text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                {partnershipPendingCount}
                              </span>
                            )}
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* One trigger + dropdown for every user, whether or not they have other identities
                to switch between. The header row shows only the avatar — name, real email, and
                role badge live inside the dropdown's own header instead of sitting inline next to
                it at all times, so the always-visible row stays a single compact control rather
                than three separate pieces of identity text competing for space next to the nav. */}
            <div className="relative flex-shrink-0" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center cursor-pointer rounded-full hover:opacity-90 transition-opacity"
                title="Account menu"
              >
                <div className="w-9 h-9 rounded-full bg-hp-cg flex items-center justify-center text-hp-paper font-bold text-sm flex-shrink-0">
                  {initials}
                </div>
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-12 z-30 w-64 bg-white/8 border border-white/12 shadow-xl py-1 overflow-hidden">
                  <div className="px-4 pt-3 pb-2.5 border-b border-white/12">
                    <p className="text-sm font-medium text-hp-paper leading-tight truncate">{user.name}</p>
                    <p className="text-xs text-hp-paper/45 leading-tight truncate mt-0.5">{user.email}</p>
                    <span className={`inline-block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${ROLE_STYLES[user.role]}`}>
                      {ROLE_LABELS[user.role]}
                    </span>
                  </div>
                  {user.linkedIdentities && user.linkedIdentities.length > 1 && (
                    <>
                      <p className="px-4 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-hp-paper/45">Switch role</p>
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
                              isActive ? "text-hp-cg bg-hp-cg/10" : "text-hp-paper/80 hover:bg-white/8 hover:text-hp-paper"
                            }`}
                          >
                            {identityLabel(identity)}
                            {isActive && <span className="text-xs">✓ Active</span>}
                          </button>
                        );
                      })}
                      <div className="h-px bg-white/12 mx-3 my-1" />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left text-hp-paper/70 hover:bg-white/8 hover:text-hp-paper transition-colors cursor-pointer"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mobile: avatar + hamburger */}
        {user && (
          <div className="flex xl:hidden items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-hp-cg flex items-center justify-center text-hp-paper font-bold text-xs flex-shrink-0">
              {initials}
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              className="p-2 -mr-2 text-hp-paper/70 hover:text-hp-paper transition-colors cursor-pointer"
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
        <div className="xl:hidden border-t border-white/12 bg-hp-surface max-h-[calc(100vh-4rem)] overflow-y-auto">
          <nav className="flex flex-col px-2 py-2">
            {(isPlayerOrParent ? playerPortalLinks : NAV_STRUCTURE).map((entry) => {
              if (!isNavGroup(entry)) {
                return (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    className={`px-3 py-2.5 text-sm font-medium flex items-center justify-between ${
                      pathname.startsWith(entry.href) ? "text-hp-cg bg-hp-ink" : "text-hp-paper/70 hover:bg-white/8"
                    }`}
                  >
                    {entry.label}
                  </Link>
                );
              }
              const active = groupIsActive(entry);
              const expanded = !!mobileExpanded[entry.label];
              return (
                <div key={entry.label}>
                  <button
                    type="button"
                    onClick={() => toggleMobileSection(entry.label)}
                    aria-expanded={expanded}
                    className={`w-full px-3 py-2.5 text-sm font-medium flex items-center justify-between cursor-pointer ${
                      active ? "text-hp-cg bg-hp-ink" : "text-hp-paper/70 hover:bg-white/8"
                    }`}
                  >
                    {entry.label}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      className={`transition-transform ${expanded ? "rotate-180" : ""}`}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {expanded && (
                    <div className="pl-4">
                      {entry.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`px-3 py-2.5 text-sm font-medium flex items-center justify-between ${
                            pathname.startsWith(child.href) ? "text-hp-cg bg-hp-ink" : "text-hp-paper/45 hover:bg-white/8"
                          }`}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {isPlatformAdmin && (
              <div>
                <button
                  type="button"
                  onClick={() => toggleMobileSection("Admin Center")}
                  aria-expanded={!!mobileExpanded["Admin Center"]}
                  aria-label="Admin Center"
                  className={`w-full px-3 py-2.5 text-sm font-medium flex items-center justify-between cursor-pointer ${
                    adminIsActive ? "text-hp-cg bg-hp-ink" : "text-hp-paper/70 hover:bg-white/8"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    Admin Center
                    {totalPendingCount > 0 && (
                      <span className="bg-red-500 text-hp-paper text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                        {totalPendingCount}
                      </span>
                    )}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    className={`transition-transform ${mobileExpanded["Admin Center"] ? "rotate-180" : ""}`}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {mobileExpanded["Admin Center"] && (
                  <div className="pl-4">
                    {ADMIN_STRUCTURE.map((group) => (
                      <div key={group.section} className="mt-1.5 first:mt-0">
                        <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-hp-paper/45">{group.section}</p>
                        {group.items.map((tool) => (
                          <Link
                            key={tool.href}
                            href={tool.href}
                            className={`px-3 py-2.5 text-sm font-medium flex items-center justify-between ${
                              pathname.startsWith(tool.href) ? "text-hp-cg bg-hp-ink" : "text-hp-paper/45 hover:bg-white/8"
                            }`}
                          >
                            {tool.label}
                            {tool.href === "/admin/approvals" && pendingCount > 0 && (
                              <span className="bg-red-500 text-hp-paper text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                {pendingCount}
                              </span>
                            )}
                            {tool.href === "/admin/partnerships" && partnershipPendingCount > 0 && (
                              <span className="bg-red-500 text-hp-paper text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                {partnershipPendingCount}
                              </span>
                            )}
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </nav>
          <div className="border-t border-white/12 px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-hp-paper leading-tight truncate">{user.name}</p>
              <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${ROLE_STYLES[user.role]}`}>
                {ROLE_LABELS[user.role]}
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-hp-paper/45 hover:text-hp-paper transition-colors cursor-pointer px-3 py-2 hover:bg-white/8 text-sm font-medium flex-shrink-0"
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
            <div className="border-t border-white/12 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-hp-paper/45 mb-2">Switch role</p>
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
                      className={`px-3 py-1.5 text-xs font-semibold border transition-colors cursor-pointer disabled:cursor-default ${
                        isActive ? "border-hp-cg bg-hp-cg/10 text-hp-cg" : "border-white/12 text-hp-paper/70"
                      }`}
                    >
                      {identityLabel(identity)}{isActive ? " ✓" : ""}
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
