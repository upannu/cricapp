"use client";

import { useState, useRef, useEffect } from "react";
import type { Coach, CoachStatus, CertificationLevel, AgeGroup, Academy, Player } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { fetchCoaches, fetchAcademies, fetchPlayers, upsertCoach, deleteCoach } from "@/lib/db";

const AGE_GROUPS: AgeGroup[] = ["U10", "U11", "U12", "U13", "U14", "U16", "U19", "Senior"];
const CERT_LEVELS: CertificationLevel[] = ["Level 1", "Level 2", "Level 3", "Elite"];

const CERT_STYLES: Record<CertificationLevel, string> = {
  "Level 1": "bg-zinc-700 text-zinc-300",
  "Level 2": "bg-blue-500/20 text-blue-400",
  "Level 3": "bg-amber/20 text-amber",
  "Elite":   "bg-pace-green/20 text-pace-green",
};

type DraftCoach = Omit<Coach, "id">;

const EMPTY_DRAFT: DraftCoach = {
  name: "",
  email: "",
  phone: "",
  specialization: "",
  ageGroupsFocus: [],
  location: "",
  status: "Active",
  joinedDate: new Date().toISOString().split("T")[0],
  certificationLevel: "Level 1",
  bio: "",
  academyId: "",
};

let _coachAcademies: Academy[] = [];
let _coachPlayers: Player[] = [];

function playerCountForCoach(coachName: string): number {
  return _coachPlayers.filter((p) => p.coachAssigned === coachName).length;
}

function academyById(id: string) {
  return _coachAcademies.find((a) => a.id === id);
}

export function CoachesClient() {
  const { user } = useAuth();
  const formRef = useRef<HTMLDivElement>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftCoach>(EMPTY_DRAFT);
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [filter, setFilter] = useState<"All" | "Active" | "Inactive">("All");
  const [sendInvite, setSendInvite] = useState(true);
  const [inviteStatus, setInviteStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [inviteError, setInviteError] = useState("");

  const defaultAcademyId = user?.role === "academy_admin" ? (user.academyId ?? "") : "";

  useEffect(() => {
    Promise.all([
      fetchCoaches(),
      fetchAcademies(),
      fetchPlayers(),
    ]).then(([c, a, p]) => {
      setCoaches(c);
      _coachAcademies = a;
      _coachPlayers = p;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function scrollToForm() {
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function openAdd() {
    setEditingId(null);
    setDraft({ ...EMPTY_DRAFT, joinedDate: new Date().toISOString().split("T")[0], academyId: defaultAcademyId });
    setFormError("");
    setSendInvite(true);
    setInviteStatus("idle");
    setInviteError("");
    setShowForm(true);
    scrollToForm();
  }

  function openEdit(coach: Coach) {
    setEditingId(coach.id);
    setDraft({
      name: coach.name,
      email: coach.email,
      phone: coach.phone,
      specialization: coach.specialization,
      ageGroupsFocus: [...coach.ageGroupsFocus],
      location: coach.location,
      status: coach.status,
      joinedDate: coach.joinedDate,
      certificationLevel: coach.certificationLevel,
      bio: coach.bio,
      academyId: coach.academyId,
    });
    setFormError("");
    setShowForm(true);
    scrollToForm();
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormError("");
  }

  function handleSave() {
    if (!draft.name.trim()) { setFormError("Coach name is required."); return; }
    if (!draft.email.trim()) { setFormError("Email is required."); return; }
    if (!draft.academyId) { setFormError("Please assign this coach to an academy."); return; }
    setFormError("");

    const newId = editingId ?? `c_${Date.now()}`;
    const coach: Coach = { id: newId, ...draft, name: draft.name.trim(), email: draft.email.trim() };

    upsertCoach({
      id: newId, name: coach.name, email: coach.email, phone: coach.phone,
      specialization: coach.specialization, age_groups_focus: coach.ageGroupsFocus,
      location: coach.location, status: coach.status, joined_date: coach.joinedDate,
      certification_level: coach.certificationLevel, bio: coach.bio, academy_id: coach.academyId,
    });

    setCoaches((prev) =>
      editingId
        ? prev.map((c) => (c.id === editingId ? coach : c))
        : [coach, ...prev]
    );
    setSaved(newId);

    if (!editingId && sendInvite && coach.email) {
      setInviteStatus("sending");
      fetch("/api/invite-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: coach.email, name: coach.name }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) { setInviteStatus("error"); setInviteError(data.error); }
          else { setInviteStatus("sent"); }
        })
        .catch(() => { setInviteStatus("error"); setInviteError("Network error sending invite."); });
    } else {
      closeForm();
    }

    setTimeout(() => setSaved(null), 2500);
  }

  function handleDelete(id: string) {
    deleteCoach(id);
    setCoaches((prev) => prev.filter((c) => c.id !== id));
    closeForm();
  }

  function toggleAgeGroup(g: AgeGroup) {
    setDraft((prev) => ({
      ...prev,
      ageGroupsFocus: prev.ageGroupsFocus.includes(g)
        ? prev.ageGroupsFocus.filter((a) => a !== g)
        : [...prev.ageGroupsFocus, g],
    }));
  }

  const filtered = filter === "All" ? coaches : coaches.filter((c) => c.status === filter);
  const activeCount = coaches.filter((c) => c.status === "Active").length;
  const totalPlayers = coaches.reduce((s, c) => s + playerCountForCoach(c.name), 0);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Coaches</h1>
          <p className="text-zinc-400 text-sm">Manage your coaching team and their player assignments</p>
        </div>
        {user?.role !== "coach" && (
          <button type="button" onClick={openAdd}
            className="px-5 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer">
            + New Coach
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-surface rounded-2xl p-5 text-center">
          <div className="text-2xl font-bold text-white mb-1">{coaches.length}</div>
          <div className="text-xs text-zinc-400">Total coaches</div>
        </div>
        <div className="bg-surface rounded-2xl p-5 text-center">
          <div className="text-2xl font-bold text-pace-green mb-1">{activeCount}</div>
          <div className="text-xs text-zinc-400">Active</div>
        </div>
        <div className="bg-surface rounded-2xl p-5 text-center">
          <div className="text-2xl font-bold text-amber mb-1">{totalPlayers}</div>
          <div className="text-xs text-zinc-400">Players assigned</div>
        </div>
      </div>

      {/* Form anchor */}
      <div ref={formRef} />

      {/* Create / Edit form */}
      {showForm && (
        <div className="bg-surface rounded-2xl p-6 border border-pace-green/30 mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-pace-green mb-6">
            {editingId ? "Edit Coach" : "New Coach"}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div>
              <label className={lbl}>Full Name *</label>
              <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className={inp} placeholder="e.g. Arjun Sharma" />
            </div>
            <div>
              <label className={lbl}>Email *</label>
              <input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                className={inp} placeholder="coach@email.com" />
            </div>
            <div>
              <label className={lbl}>Phone</label>
              <input type="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                className={inp} placeholder="+61 4XX XXX XXX" />
            </div>
            <div>
              <label className={lbl}>Location</label>
              <input type="text" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                className={inp} placeholder="e.g. Brisbane, QLD" />
            </div>
            <div>
              <label className={lbl}>Specialization</label>
              <input type="text" value={draft.specialization} onChange={(e) => setDraft({ ...draft, specialization: e.target.value })}
                className={inp} placeholder="e.g. Fast Bowling Biomechanics" />
            </div>
            <div>
              <label className={lbl}>Certification Level</label>
              <select value={draft.certificationLevel} onChange={(e) => setDraft({ ...draft, certificationLevel: e.target.value as CertificationLevel })}
                className={sel}>
                {CERT_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Joined Date</label>
              <input type="date" value={draft.joinedDate} onChange={(e) => setDraft({ ...draft, joinedDate: e.target.value })}
                className={inp} />
            </div>
            <div>
              <label className={lbl}>Status</label>
              <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as CoachStatus })}
                className={sel}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={lbl}>Academy *</label>
              <select
                value={draft.academyId}
                onChange={(e) => setDraft({ ...draft, academyId: e.target.value })}
                className={sel}
                disabled={user?.role === "academy_admin"}
              >
                <option value="">— Select academy —</option>
                {_coachAcademies.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} · {a.location}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={lbl}>Bio</label>
              <textarea value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
                className={`${inp} resize-none h-20`}
                placeholder="Background, experience, coaching philosophy…" />
            </div>
          </div>

          {/* Age groups */}
          <div className="mb-6">
            <label className={lbl}>Age Groups Focus</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {AGE_GROUPS.map((g) => {
                const isSel = draft.ageGroupsFocus.includes(g);
                return (
                  <button key={g} type="button" onClick={() => toggleAgeGroup(g)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      isSel
                        ? "bg-pace-green/20 border-pace-green text-pace-green"
                        : "bg-ink border-zinc-700 text-zinc-400 hover:border-zinc-500"
                    }`}>
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          {!editingId && (
            <div className="mb-5 p-4 rounded-xl bg-ink border border-zinc-700">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendInvite}
                  onChange={(e) => setSendInvite(e.target.checked)}
                  className="w-4 h-4 accent-pace-green cursor-pointer"
                />
                <div>
                  <span className="text-sm font-semibold text-white">Send login invite email</span>
                  <p className="text-xs text-zinc-500 mt-0.5">Coach receives an email with a link to set their password and access PACE HQ</p>
                </div>
              </label>
              {inviteStatus === "sending" && (
                <p className="text-xs text-zinc-400 mt-3 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full border border-zinc-400 border-t-transparent animate-spin inline-block" />
                  Sending invite…
                </p>
              )}
              {inviteStatus === "sent" && (
                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs text-pace-green font-semibold">✓ Invite sent to {draft.email}</p>
                  <button type="button" onClick={closeForm} className="text-xs text-zinc-400 hover:text-white cursor-pointer">Close</button>
                </div>
              )}
              {inviteStatus === "error" && (
                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs text-red-400">{inviteError}</p>
                  <button type="button" onClick={closeForm} className="text-xs text-zinc-400 hover:text-white cursor-pointer">Close</button>
                </div>
              )}
            </div>
          )}

          {formError && <p className="text-red-400 text-sm mb-3">{formError}</p>}

          <div className="flex items-center gap-3">
            <button type="button" onClick={handleSave}
              disabled={inviteStatus === "sending"}
              className="px-6 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 cursor-pointer disabled:opacity-60">
              {editingId ? "Save Changes" : "Create Coach"}
            </button>
            <button type="button" onClick={closeForm}
              className="px-6 py-2.5 text-sm font-medium text-zinc-400 border border-zinc-700 rounded-xl hover:text-white hover:border-zinc-500 transition-colors cursor-pointer">
              Cancel
            </button>
            {editingId && (
              <button type="button" onClick={() => handleDelete(editingId)}
                className="ml-auto px-4 py-2.5 text-sm font-medium text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/10 transition-colors cursor-pointer">
                Delete Coach
              </button>
            )}
          </div>
        </div>
      )}

      {/* Success banner */}
      {saved && !showForm && (
        <div className="mb-5 px-5 py-3 rounded-xl bg-pace-green/10 border border-pace-green/30 text-pace-green text-sm font-semibold">
          ✓ Coach saved successfully
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {(["All", "Active", "Inactive"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              filter === f ? "bg-pace-green text-black" : "bg-surface text-zinc-400 hover:text-white"
            }`}>
            {f}
          </button>
        ))}
      </div>

      {/* Coach cards */}
      {filtered.length === 0 ? (
        <div className="bg-surface rounded-2xl p-16 text-center">
          <p className="text-zinc-400 text-sm mb-4">No coaches found.</p>
          <button type="button" onClick={openAdd}
            className="px-5 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 cursor-pointer">
            + Add First Coach
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((coach) => {
            const playerCount = playerCountForCoach(coach.name);
            const initials = coach.name.split(" ").map((n) => n[0]).join("");

            return (
              <div key={coach.id}
                className={`bg-surface rounded-2xl p-6 border transition-colors ${
                  saved === coach.id ? "border-pace-green/50" : "border-transparent"
                }`}>
                {/* Card header */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-full bg-pace-green flex items-center justify-center text-black font-bold text-base flex-shrink-0">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <h3 className="text-white font-bold text-sm">{coach.name}</h3>
                        {saved === coach.id && (
                          <span className="text-pace-green text-xs font-semibold">✓ Saved</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${CERT_STYLES[coach.certificationLevel]}`}>
                          {coach.certificationLevel}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          coach.status === "Active" ? "bg-pace-green/20 text-pace-green" : "bg-zinc-700 text-zinc-400"
                        }`}>
                          {coach.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button type="button" onClick={() => openEdit(coach)}
                    className="px-3 py-1.5 text-xs font-semibold text-zinc-300 border border-zinc-600 rounded-lg hover:border-pace-green hover:text-pace-green transition-colors cursor-pointer flex-shrink-0">
                    Edit
                  </button>
                </div>

                {/* Specialization + location */}
                <p className="text-zinc-300 text-sm font-medium mb-1">{coach.specialization || "—"}</p>
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  {coach.location && (
                    <span className="text-zinc-500 text-xs">📍 {coach.location}</span>
                  )}
                  {coach.academyId && (() => {
                    const ac = academyById(coach.academyId);
                    return ac ? (
                      <span className="px-2 py-0.5 rounded-md text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        🏫 {ac.name}
                      </span>
                    ) : null;
                  })()}
                </div>

                {/* Bio */}
                {coach.bio && (
                  <p className="text-zinc-400 text-xs leading-relaxed mb-4 line-clamp-2">{coach.bio}</p>
                )}

                {/* Meta grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <div className="text-xs text-zinc-500 mb-0.5">Email</div>
                    <div className="text-xs text-zinc-300 truncate">{coach.email}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-0.5">Phone</div>
                    <div className="text-xs text-zinc-300">{coach.phone || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-0.5">Joined</div>
                    <div className="text-xs text-zinc-300">
                      {new Date(coach.joinedDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-0.5">Players</div>
                    <div className="text-sm font-bold text-pace-green">{playerCount}</div>
                  </div>
                </div>

                {/* Age groups */}
                {coach.ageGroupsFocus.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {coach.ageGroupsFocus.map((g) => (
                      <span key={g} className="px-2 py-0.5 rounded-md text-xs bg-ink text-zinc-400 border border-zinc-700">
                        {g}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const inp = "w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm";
const sel = "w-full bg-ink rounded-xl px-4 py-3 text-white border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm cursor-pointer";
const lbl = "block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";
