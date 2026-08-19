"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  platform_admin: "Platform Admin",
  academy_admin: "Academy Admin",
  coach: "Coach",
  player: "Player",
  parent: "Parent",
};

export function PlatformAdminsClient() {
  const { user } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (user && user.role !== "platform_admin") { router.replace("/players"); return; }
  }, [user, router]);

  useEffect(() => {
    fetch("/api/platform-admins/list")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setUsers(data.users ?? []);
      })
      .catch((err) => setLoadError((err as { message?: string })?.message ?? String(err)))
      .finally(() => setLoading(false));
  }, []);

  if (!user || user.role !== "platform_admin") return null;

  function handleChanged(userId: string, newRole: string) {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
  }

  const admins = users.filter((u) => u.role === "platform_admin");
  const others = users.filter((u) => u.role !== "platform_admin");

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <Link href="/players" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors mb-6">
        ← Back
      </Link>

      <h1 className="text-xl font-bold text-white mb-1">Platform Admins</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Promote or remove platform_admin access for already-approved accounts. Platform admins can
        manage the Plan Catalog, approvals, KPIs, and every academy on the platform.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
        </div>
      ) : loadError ? (
        <p className="text-red-400 text-sm">{loadError}</p>
      ) : (
        <div className="space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-pace-green mb-3">
              Platform Admins ({admins.length})
            </p>
            <div className="space-y-2">
              {admins.map((u) => (
                <UserRow key={u.id} u={u} isSelf={u.id === user?.id} onChanged={handleChanged} />
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
              Everyone Else ({others.length})
            </p>
            <div className="space-y-2">
              {others.map((u) => (
                <UserRow key={u.id} u={u} isSelf={u.id === user?.id} onChanged={handleChanged} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UserRow({ u, isSelf, onChanged }: { u: AdminUser; isSelf: boolean; onChanged: (userId: string, newRole: string) => void }) {
  return (
    <div className="bg-surface rounded-2xl p-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-sm truncate">{u.name}</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-zinc-700 text-zinc-300 flex-shrink-0">
            {ROLE_LABELS[u.role] ?? u.role}
          </span>
          {isSelf && <span className="text-[10px] text-zinc-500 flex-shrink-0">(you)</span>}
        </div>
        <div className="text-xs text-zinc-500 truncate">{u.email}</div>
      </div>
      {!isSelf && (
        u.role === "platform_admin"
          ? <DemoteButton userId={u.id} onDone={(role) => onChanged(u.id, role)} />
          : <PromoteButton userId={u.id} onDone={() => onChanged(u.id, "platform_admin")} />
      )}
    </div>
  );
}

function PromoteButton({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleClick() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/platform-admins/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, makeAdmin: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not promote this account.");
      setDone(true);
      onDone();
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  if (done) return <span className="text-xs font-semibold text-pace-green flex-shrink-0">✓ Promoted</span>;

  return (
    <div className="text-right flex-shrink-0">
      <button type="button" onClick={handleClick} disabled={loading}
        className="px-4 py-2 text-xs font-bold text-pace-green border border-pace-green/40 rounded-xl hover:bg-pace-green/10 cursor-pointer transition-colors disabled:opacity-60">
        {loading ? "Loading…" : "Make Platform Admin"}
      </button>
      {error && <p className="text-[10px] text-red-400 mt-1 max-w-40">{error}</p>}
    </div>
  );
}

const FALLBACK_ROLES = [
  { value: "academy_admin", label: "Academy Admin" },
  { value: "coach", label: "Coach" },
] as const;

function DemoteButton({ userId, onDone }: { userId: string; onDone: (newRole: string) => void }) {
  const [showPicker, setShowPicker] = useState(false);
  const [fallbackRole, setFallbackRole] = useState<"academy_admin" | "coach">("academy_admin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/platform-admins/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, makeAdmin: false, fallbackRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not remove platform_admin.");
      setDone(true);
      onDone(fallbackRole);
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  if (done) return <span className="text-xs font-semibold text-amber flex-shrink-0">✓ Removed</span>;

  if (showPicker) {
    return (
      <div className="flex items-center gap-2 flex-shrink-0">
        <select
          value={fallbackRole}
          onChange={(e) => setFallbackRole(e.target.value as "academy_admin" | "coach")}
          className="bg-ink rounded-lg px-2 py-1.5 text-xs text-white border border-zinc-700 focus:border-pace-green focus:outline-none cursor-pointer"
        >
          {FALLBACK_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <button type="button" onClick={handleConfirm} disabled={loading}
          className="px-3 py-1.5 text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 cursor-pointer transition-colors disabled:opacity-60">
          {loading ? "…" : "Confirm"}
        </button>
        <button type="button" onClick={() => setShowPicker(false)} className="text-xs text-zinc-500 hover:text-white cursor-pointer">
          Cancel
        </button>
        {error && <p className="text-[10px] text-red-400 max-w-40">{error}</p>}
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setShowPicker(true)}
      className="px-4 py-2 text-xs font-semibold text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/10 transition-colors cursor-pointer flex-shrink-0">
      Remove Platform Admin
    </button>
  );
}
