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

  useEffect(() => {
    if (user?.role !== "platform_admin") return;
    fetch("/api/pending-approvals")
      .then((r) => r.json())
      .then((d) => setPendingCount(d.requests?.length ?? 0))
      .catch(() => {});
  }, [user]);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const initials = user
    ? user.name.split(" ").map((n) => n[0]).join("")
    : "?";

  const isPlayerOrParent = user?.role === "player" || user?.role === "parent";

  return (
    <header className="bg-surface border-b border-zinc-700/60 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 flex items-stretch h-16 gap-8">
        {/* Logo */}
        <Link href={isPlayerOrParent ? "/portal" : "/players"} className="flex items-center gap-2.5 mr-4">
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
          {!isPlayerOrParent && NAV_ALL.map((item) => {
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
          {user?.role === "platform_admin" && (
            <Link
              href="/admin/approvals"
              className={`px-4 flex items-center gap-2 text-sm font-medium border-b-2 transition-colors ${
                pathname.startsWith("/admin/approvals")
                  ? "text-amber border-amber"
                  : "text-zinc-400 border-transparent hover:text-white"
              }`}
            >
              Approvals
              {pendingCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {pendingCount}
                </span>
              )}
            </Link>
          )}
        </nav>

        {/* User + role */}
        {user && (
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-white leading-tight">{user.name}</p>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${ROLE_STYLES[user.role]}`}>
                {ROLE_LABELS[user.role]}
              </span>
            </div>
            <div className="w-9 h-9 rounded-full bg-pace-green flex items-center justify-center text-black font-bold text-sm flex-shrink-0">
              {initials}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-zinc-500 hover:text-white transition-colors cursor-pointer px-2.5 py-1.5 rounded-lg hover:bg-zinc-700/50 text-sm font-medium"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
