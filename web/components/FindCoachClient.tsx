"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { fetchPlayer, fetchCoaches, fetchAcademies, upsertBooking } from "@/lib/db";
import { getSessionFee, getInitials } from "@/lib/utils";
import { canUseMarketplace } from "@/lib/plan-features";
import type { Player, Coach, Academy, AgeGroup, BookingType } from "@/lib/types";

const BOOKING_TYPES: BookingType[] = [
  "Net Session", "Individual Coaching", "Video Review",
  "Fitness Assessment", "Match Practice", "Warm-up / Conditioning",
];

const AGE_GROUPS: AgeGroup[] = ["U10", "U11", "U12", "U13", "U14", "U16", "U19", "Senior"];

export function FindCoachClient() {
  const { user } = useAuth();
  const [player, setPlayer] = useState<Player | null>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [loading, setLoading] = useState(true);
  const [specFilter, setSpecFilter] = useState("");
  const [ageFilter, setAgeFilter] = useState<AgeGroup | "all">("all");
  const [requestCoach, setRequestCoach] = useState<Coach | null>(null);

  useEffect(() => {
    if (!user?.playerId) return;
    Promise.all([
      fetchPlayer(user.playerId),
      fetchCoaches(),
      fetchAcademies(),
    ]).then(([p, c, ac]) => {
      setPlayer(p);
      setCoaches(c);
      setAcademies(ac);
      setLoading(false);
    });
  }, [user]);

  if (loading && user?.playerId) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user?.playerId || !player) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-white font-semibold mb-2">No player linked to this account</p>
        <p className="text-zinc-400 text-sm">Contact your coach or academy admin to get this fixed.</p>
      </div>
    );
  }

  if (!canUseMarketplace(player.subscription.plan)) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-pace-green/10 border border-pace-green/30 flex items-center justify-center mx-auto mb-5 text-2xl">🔒</div>
        <p className="text-white font-semibold mb-2">Find a Coach is a Player Pro feature</p>
        <p className="text-zinc-400 text-sm mb-6">Upgrade to browse and request bookings with coaches beyond your own academy assignment.</p>
        <Link href={`/players/${player.id}/subscription`} className="inline-block px-5 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity">
          View Upgrade Options
        </Link>
      </div>
    );
  }

  const myAcademy = academies.find((a) => a.playerIds.includes(player.id));
  const marketplaceCoaches = coaches.filter((c) => c.marketplaceVisible && (!myAcademy || c.academyId === myAcademy.id));
  const filtered = marketplaceCoaches.filter((c) => {
    if (specFilter && !c.specialization.toLowerCase().includes(specFilter.toLowerCase()) && !c.bio.toLowerCase().includes(specFilter.toLowerCase())) return false;
    if (ageFilter !== "all" && !c.ageGroupsFocus.includes(ageFilter)) return false;
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Find a Coach</h1>
        <p className="text-zinc-400 text-sm">
          {myAcademy ? `Coaches available at ${myAcademy.name}` : "Browse available coaches"} — request a session and they&apos;ll confirm it.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          value={specFilter}
          onChange={(e) => setSpecFilter(e.target.value)}
          placeholder="Search specialization or bio…"
          className="flex-1 min-w-48 bg-surface rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 border border-zinc-700 focus:border-pace-green focus:outline-none text-sm"
        />
        <select
          value={ageFilter}
          onChange={(e) => setAgeFilter(e.target.value as AgeGroup | "all")}
          className="bg-surface rounded-xl px-4 py-2.5 text-white border border-zinc-700 focus:border-pace-green focus:outline-none text-sm cursor-pointer"
        >
          <option value="all">All Age Groups</option>
          {AGE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-surface rounded-2xl p-16 text-center">
          <p className="text-zinc-400 text-sm">
            {marketplaceCoaches.length === 0 ? "No coaches are available in the marketplace yet." : "No coaches match your filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((coach) => (
            <div key={coach.id} className="bg-surface rounded-2xl p-5 flex flex-col">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-full bg-pace-green/20 flex items-center justify-center text-pace-green font-bold text-sm flex-shrink-0">
                  {getInitials(coach.name)}
                </div>
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{coach.name}</p>
                  <p className="text-zinc-500 text-xs truncate">{coach.specialization}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {coach.ageGroupsFocus.map((g) => (
                  <span key={g} className="px-2 py-0.5 rounded-md text-xs bg-ink text-zinc-400 border border-zinc-700">{g}</span>
                ))}
              </div>
              <p className="text-zinc-400 text-xs leading-relaxed flex-1 mb-4 line-clamp-4">{coach.bio || "No bio yet."}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">{coach.certificationLevel} · {coach.location}</span>
                <button
                  type="button"
                  onClick={() => setRequestCoach(coach)}
                  className="px-3 py-1.5 text-xs font-semibold bg-pace-green text-black rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Request Booking
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {requestCoach && (
        <RequestBookingModal
          coach={requestCoach}
          player={player}
          academies={academies}
          onClose={() => setRequestCoach(null)}
        />
      )}
    </div>
  );
}

function RequestBookingModal({
  coach,
  player,
  academies,
  onClose,
}: {
  coach: Coach;
  player: Player;
  academies: Academy[];
  onClose: () => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [type, setType] = useState<BookingType>("Net Session");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const fee = getSessionFee(coach, academies, type);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const id = `b_${Date.now()}`;
      await upsertBooking({
        id, player_id: player.id, coach_id: coach.id,
        date, time, duration_mins: 60, type, status: "Pending",
        location: coach.location, notes, fee_aud: fee,
        source: "marketplace",
      });
      setDone(true);
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl p-6 max-w-md w-full">
        {done ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full bg-pace-green/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-pace-green text-xl font-bold">✓</span>
            </div>
            <h2 className="text-lg font-bold text-white mb-1">Request sent</h2>
            <p className="text-zinc-400 text-sm mb-5">{coach.name} or their academy admin will confirm this booking soon.</p>
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm font-bold bg-pace-green text-black rounded-xl hover:opacity-90 transition-opacity cursor-pointer">
              Done
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold text-white mb-1">Request a Booking</h2>
            <p className="text-zinc-400 text-sm mb-4">with {coach.name}</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Session Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as BookingType)}
                  className="w-full bg-ink rounded-xl px-4 py-2.5 text-white border border-zinc-700 focus:border-pace-green focus:outline-none text-sm cursor-pointer"
                >
                  {BOOKING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Preferred Date</label>
                  <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-ink rounded-xl px-4 py-2.5 text-white border border-zinc-700 focus:border-pace-green focus:outline-none text-sm" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Preferred Time</label>
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                    className="w-full bg-ink rounded-xl px-4 py-2.5 text-white border border-zinc-700 focus:border-pace-green focus:outline-none text-sm" required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Notes (optional)</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-ink rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none text-sm resize-none h-20"
                  placeholder="Anything the coach should know…" />
              </div>

              <div className="flex items-center justify-between bg-ink rounded-xl px-4 py-3">
                <span className="text-xs text-zinc-400">Estimated fee</span>
                <span className="text-pace-green font-mono font-bold text-sm">${fee}</span>
              </div>

              {error && <p className="text-red-400 text-xs">{error}</p>}

              <div className="flex items-center gap-3 pt-1">
                <button type="submit" disabled={submitting}
                  className="px-4 py-2.5 text-sm font-bold bg-pace-green text-black rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer">
                  {submitting ? "Sending…" : "Send Request"}
                </button>
                <button type="button" onClick={onClose}
                  className="px-4 py-2.5 text-sm font-medium text-zinc-400 border border-zinc-700 rounded-xl hover:text-white transition-colors cursor-pointer">
                  Cancel
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
