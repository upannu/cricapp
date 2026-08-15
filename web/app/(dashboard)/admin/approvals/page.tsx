"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { fetchAcademies, upsertAcademy } from "@/lib/db";
import type { Academy } from "@/lib/types";

type UserRole = "academy_admin" | "coach" | "player" | "parent";

interface PendingRequest {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  requested_at: string;
  player_lookup_email: string | null;
  request_type: "new" | "link";
}

const ROLE_LABELS: Record<UserRole, string> = {
  academy_admin: "Academy Admin",
  coach: "Coach",
  player: "Player",
  parent: "Parent / Guardian",
};

const ROLE_STYLES: Record<UserRole, string> = {
  academy_admin: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  coach: "bg-pace-green/20 text-pace-green border-pace-green/30",
  player: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  parent: "bg-fire/20 text-fire border-fire/30",
};

const NEEDS_PLAYER_LINK: UserRole[] = ["player", "parent"];

export default function ApprovalsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [requests,       setRequests]       = useState<PendingRequest[]>([]);
  const [academies,      setAcademies]      = useState<Academy[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [approving,      setApproving]      = useState<string | null>(null);
  const [rejecting,      setRejecting]      = useState<string | null>(null);
  const [confirmReject,  setConfirmReject]  = useState<PendingRequest | null>(null);
  const [assignDialog,   setAssignDialog]   = useState<PendingRequest | null>(null);
  const [selectedAcademy, setSelectedAcademy] = useState("");
  const [errorMsg,       setErrorMsg]       = useState<string | null>(null);
  const [creatingAcademy, setCreatingAcademy] = useState(false);
  const [newAcademyName, setNewAcademyName] = useState("");
  const [newAcademyLocation, setNewAcademyLocation] = useState("");
  const [savingAcademy, setSavingAcademy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, acads] = await Promise.all([
        fetch("/api/pending-approvals"),
        fetchAcademies(),
      ]);
      const data = await res.json();
      if (data.error) {
        setErrorMsg(`Failed to load requests: ${data.error}`);
      } else {
        setRequests(data.requests ?? []);
      }
      setAcademies(acads);
    } catch (e) {
      setErrorMsg(`Network error: ${String(e)}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user?.role !== "platform_admin") { router.replace("/players"); return; }
    load();
  }, [user, router, load]);

  async function doApprove(req: PendingRequest, academyId?: string) {
    setErrorMsg(null);
    setApproving(req.id);
    setAssignDialog(null);
    try {
      const res  = await fetch("/api/approve-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: req.id, academyId: academyId || undefined }),
      });
      const data = await res.json();
      if (data.error) {
        setErrorMsg(`Approval failed: ${data.error}`);
      } else {
        setRequests((prev) => prev.filter((r) => r.id !== req.id));
      }
    } catch (e) {
      setErrorMsg(`Network error: ${String(e)}`);
    }
    setApproving(null);
  }

  function handleApproveClick(req: PendingRequest) {
    if (req.role === "academy_admin") {
      // Show academy picker first — defaults to "New Academy" since that's the far more common
      // case (a fresh academy_admin signup almost always needs a fresh academy, not to be added
      // to one that already has an admin) and was twice mistaken for the only option missing.
      setSelectedAcademy("");
      setCreatingAcademy(true);
      setNewAcademyName("");
      setNewAcademyLocation("");
      setAssignDialog(req);
    } else {
      // Coaches don't need academy assignment here
      doApprove(req);
    }
  }

  async function handleCreateAcademy() {
    if (!newAcademyName.trim()) return;
    setSavingAcademy(true);
    setErrorMsg(null);
    try {
      const id = `ac${Date.now()}`;
      const today = new Date().toISOString().split("T")[0];
      await upsertAcademy({
        id,
        name: newAcademyName.trim(),
        description: "",
        location: newAcademyLocation.trim(),
        player_ids: [],
        player_counts: {},
        coach_ids: [],
        head_coach_id: "",
        stage: "Foundation",
        coach_name: "",
        start_date: today,
        status: "Active",
        session_fee_aud: 0,
        session_type_fees: {},
        age_fees: {},
      });
      setAcademies((prev) => [...prev, {
        id, name: newAcademyName.trim(), description: "", location: newAcademyLocation.trim(),
        playerIds: [], playerCounts: {}, coachIds: [], headCoachId: "", stage: "Foundation",
        coachName: "", startDate: today, status: "Active", sessionFeeAud: 0, sessionTypeFees: {}, ageFees: {},
      }]);
      setSelectedAcademy(id);
      setCreatingAcademy(false);
    } catch (e) {
      setErrorMsg(`Could not create academy: ${String(e)}`);
    }
    setSavingAcademy(false);
  }

  async function handleReject(userId: string) {
    setErrorMsg(null);
    setRejecting(userId);
    try {
      const res  = await fetch("/api/reject-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      setConfirmReject(null);
      if (data.error) {
        setErrorMsg(`Rejection failed: ${data.error}`);
      } else {
        setRequests((prev) => prev.filter((r) => r.id !== userId));
      }
    } catch (e) {
      setErrorMsg(`Network error: ${String(e)}`);
    }
    setRejecting(null);
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Pending Approvals</h1>
        <p className="text-zinc-400 text-sm">Review and approve new coach and academy admin accounts</p>
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-start gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" className="flex-shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="text-red-400 text-sm flex-1">{errorMsg}</p>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-red-400/60 hover:text-red-400 text-lg leading-none cursor-pointer">×</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-surface rounded-2xl p-16 text-center">
          <div className="text-pace-green text-3xl mb-3">✓</div>
          <p className="text-white font-semibold mb-1">All caught up</p>
          <p className="text-zinc-400 text-sm">No pending account requests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const initials = req.name.split(" ").map((n) => n[0]).join("");
            const date = new Date(req.requested_at).toLocaleDateString("en-GB", {
              day: "2-digit", month: "short", year: "numeric",
              hour: "2-digit", minute: "2-digit",
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
                    {req.request_type === "link" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber/10 text-amber border-amber/30">
                        + Additional role
                      </span>
                    )}
                  </div>
                  <div className="text-zinc-400 text-xs">{req.email}</div>
                  {req.request_type === "link" && (
                    <div className="text-xs mt-0.5 text-amber">
                      This account already exists — approving links a {ROLE_LABELS[req.role]} identity to it.
                    </div>
                  )}
                  {NEEDS_PLAYER_LINK.includes(req.role) && (
                    <div className="text-xs mt-0.5">
                      {req.player_lookup_email ? (
                        <span className="text-purple-400">
                          🔗 Links to player: <span className="font-semibold">{req.player_lookup_email}</span>
                        </span>
                      ) : (
                        <span className="text-red-400">⚠ No linked player email on this request</span>
                      )}
                    </div>
                  )}
                  <div className="text-zinc-600 text-xs mt-0.5">Requested {date}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button type="button"
                    onClick={() => setConfirmReject(req)}
                    disabled={approving === req.id || rejecting === req.id}
                    className="px-4 py-2.5 text-sm font-semibold text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-40">
                    Reject
                  </button>
                  <button type="button"
                    onClick={() => handleApproveClick(req)}
                    disabled={approving === req.id || rejecting === req.id}
                    className="px-5 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60">
                    {approving === req.id ? "Approving…" : "Approve"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assign academy dialog (for academy_admin approvals) */}
      {assignDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setAssignDialog(null)} />
          <div className="relative bg-surface rounded-2xl w-full max-w-sm shadow-2xl border border-zinc-700/50 p-6">
            <h3 className="text-white font-bold mb-1">Assign Academy</h3>
            <p className="text-zinc-400 text-sm mb-4">
              Which academy will <span className="text-white font-semibold">{assignDialog.name}</span> manage?
            </p>

            {/* Explicit choice, not a dropdown-plus-hidden-link — this exact ambiguity has
                caused two real approvals to go out with no academy attached. */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                type="button"
                onClick={() => setCreatingAcademy(true)}
                className={`px-3 py-2.5 rounded-xl text-sm font-semibold border transition-colors cursor-pointer ${
                  creatingAcademy ? "border-pace-green bg-pace-green/10 text-pace-green" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                New Academy
              </button>
              <button
                type="button"
                onClick={() => setCreatingAcademy(false)}
                className={`px-3 py-2.5 rounded-xl text-sm font-semibold border transition-colors cursor-pointer ${
                  !creatingAcademy ? "border-pace-green bg-pace-green/10 text-pace-green" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                Existing Academy
              </button>
            </div>

            <div className="mb-5">
              {creatingAcademy ? (
                <div className="space-y-2">
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Academy Name *</label>
                    <input
                      type="text"
                      value={newAcademyName}
                      onChange={(e) => setNewAcademyName(e.target.value)}
                      placeholder="e.g. Bella Vista Fast Bowling"
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-pace-green"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Location (optional)</label>
                    <input
                      type="text"
                      value={newAcademyLocation}
                      onChange={(e) => setNewAcademyLocation(e.target.value)}
                      placeholder="e.g. Sydney, NSW"
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-pace-green"
                    />
                  </div>
                  {selectedAcademy ? (
                    <p className="text-pace-green text-xs">✓ Created — ready to approve.</p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleCreateAcademy}
                      disabled={!newAcademyName.trim() || savingAcademy}
                      className="w-full px-3 py-2.5 text-sm font-bold bg-pace-green text-black rounded-lg hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
                    >
                      {savingAcademy ? "Creating…" : "Create Academy"}
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <label className="block text-zinc-400 text-xs font-medium mb-1.5">Academy</label>
                  <select
                    value={selectedAcademy}
                    onChange={(e) => setSelectedAcademy(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-pace-green"
                  >
                    <option value="">— Select academy —</option>
                    {academies.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  {!selectedAcademy && (
                    <p className="text-amber text-xs mt-1.5">⚠ Approving with no academy selected leaves this admin unable to manage anything until one is assigned later.</p>
                  )}
                </>
              )}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setAssignDialog(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-zinc-400 border border-zinc-700 rounded-xl hover:text-white hover:border-zinc-500 transition-colors cursor-pointer">
                Cancel
              </button>
              <button type="button"
                onClick={() => doApprove(assignDialog, selectedAcademy || undefined)}
                disabled={creatingAcademy && !selectedAcademy}
                className="flex-1 px-4 py-2.5 text-sm font-bold bg-pace-green text-black rounded-xl hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40">
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject confirmation dialog */}
      {confirmReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setConfirmReject(null)} />
          <div className="relative bg-surface rounded-2xl w-full max-w-sm shadow-2xl border border-red-500/20 p-6">
            <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </div>
            <h3 className="text-white font-bold text-center mb-1">Reject Account?</h3>
            <p className="text-zinc-400 text-sm text-center mb-1">
              <span className="text-white font-semibold">{confirmReject.name}</span> ({confirmReject.email})
            </p>
            <p className="text-zinc-500 text-xs text-center mb-6">
              {confirmReject.request_type === "link"
                ? "Only this request is removed — their existing account is untouched."
                : "Their account will be permanently deleted. They can re-apply using the signup page."}
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setConfirmReject(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-zinc-400 border border-zinc-700 rounded-xl hover:text-white hover:border-zinc-500 transition-colors cursor-pointer">
                Cancel
              </button>
              <button type="button"
                onClick={() => handleReject(confirmReject.id)}
                disabled={rejecting === confirmReject.id}
                className="flex-1 px-4 py-2.5 text-sm font-bold text-red-400 border border-red-500/40 rounded-xl hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-60">
                {rejecting === confirmReject.id ? "Rejecting…" : "Yes, Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
