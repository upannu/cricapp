"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";

type UserRole = "academy_admin" | "coach";

interface PendingRequest {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  requested_at: string;
}

const ROLE_LABELS: Record<UserRole, string> = {
  academy_admin: "Academy Admin",
  coach: "Coach",
};

const ROLE_STYLES: Record<UserRole, string> = {
  academy_admin: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  coach: "bg-pace-green/20 text-pace-green border-pace-green/30",
};

export default function ApprovalsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [approved, setApproved] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/pending-approvals");
    const data = await res.json();
    setRequests(data.requests ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user?.role !== "platform_admin") {
      router.replace("/players");
      return;
    }
    load();
  }, [user, router, load]);

  async function handleApprove(userId: string) {
    setApproving(userId);
    const res = await fetch("/api/approve-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    setApproving(null);
    if (!data.error) {
      setApproved((prev) => new Set([...prev, userId]));
      setRequests((prev) => prev.filter((r) => r.id !== userId));
    }
  }

  const pending = requests.filter((r) => !approved.has(r.id));

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Pending Approvals</h1>
        <p className="text-zinc-400 text-sm">Review and approve new coach and academy admin accounts</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
        </div>
      ) : pending.length === 0 ? (
        <div className="bg-surface rounded-2xl p-16 text-center">
          <div className="text-pace-green text-3xl mb-3">✓</div>
          <p className="text-white font-semibold mb-1">All caught up</p>
          <p className="text-zinc-400 text-sm">No pending account requests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((req) => {
            const initials = req.name.split(" ").map((n) => n[0]).join("");
            const date = new Date(req.requested_at).toLocaleDateString("en-GB", {
              day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
            });
            return (
              <div key={req.id} className="bg-surface rounded-2xl p-5 flex items-center gap-4">
                <div className="w-11 h-11 rounded-full bg-zinc-700 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-white font-semibold text-sm">{req.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${ROLE_STYLES[req.role]}`}>
                      {ROLE_LABELS[req.role]}
                    </span>
                  </div>
                  <div className="text-zinc-400 text-xs">{req.email}</div>
                  <div className="text-zinc-600 text-xs mt-0.5">Requested {date}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleApprove(req.id)}
                  disabled={approving === req.id}
                  className="flex-shrink-0 px-5 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60"
                >
                  {approving === req.id ? "Approving…" : "Approve"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
