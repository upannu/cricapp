"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Coach, CoachStatus, CertificationLevel, AgeGroup, Academy, Plan } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { fetchCoaches, fetchAcademies, fetchActivePlans, upsertCoach } from "@/lib/db";
import { canUseMarketplaceForCoach } from "@/lib/plan-features";
import { DateInput } from "@/components/DateInput";

const AGE_GROUPS: AgeGroup[] = ["U10", "U11", "U12", "U13", "U14", "U16", "U19", "Senior"];
const CERT_LEVELS: CertificationLevel[] = ["Level 1", "Level 2", "Level 3", "Elite"];

// Coaches' own dedicated edit page — mirrors EditPlayerForm's shape (a focused page, not an inline
// form on the list) now that Coaches has one too, matching Players' own View-vs-Edit split.
// Invite-email sending is deliberately absent here — that flow only ever applied to a brand-new
// coach on the list page's own Add form, never to editing one that already exists.
export function EditCoachForm({ coach }: { coach: Coach }) {
  const router = useRouter();
  const { user } = useAuth();
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [otherCoaches, setOtherCoaches] = useState<Coach[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState("");

  const [name, setName] = useState(coach.name);
  const [email, setEmail] = useState(coach.email);
  const [phone, setPhone] = useState(coach.phone);
  const [location, setLocation] = useState(coach.location);
  const [specialization, setSpecialization] = useState(coach.specialization);
  const [certificationLevel, setCertificationLevel] = useState(coach.certificationLevel);
  const [joinedDate, setJoinedDate] = useState(coach.joinedDate);
  const [status, setStatus] = useState<CoachStatus>(coach.status);
  const [academyId, setAcademyId] = useState(coach.academyId);
  const [bio, setBio] = useState(coach.bio);
  const [marketplaceVisible, setMarketplaceVisible] = useState(coach.marketplaceVisible);
  const [available, setAvailable] = useState(coach.available);
  const [ageGroupsFocus, setAgeGroupsFocus] = useState<AgeGroup[]>(coach.ageGroupsFocus);

  useEffect(() => {
    Promise.all([fetchAcademies(), fetchActivePlans(), fetchCoaches()]).then(([a, p, c]) => {
      setAcademies(a);
      setPlans(p);
      setOtherCoaches(c.filter((co) => co.id !== coach.id));
    });
  }, [coach.id]);

  function toggleAgeGroup(g: AgeGroup) {
    setAgeGroupsFocus((prev) => (prev.includes(g) ? prev.filter((a) => a !== g) : [...prev, g]));
  }

  // Same gate as the list page's own Add/Edit form — a coach editing their own independent
  // profile needs marketplace access unlocked on their tier; staff aren't gated, since they're
  // not the ones paying for it.
  const marketplaceLocked =
    user?.role === "coach" && user.coachId === coach.id && !academyId &&
    !canUseMarketplaceForCoach((coach.subPlan ?? "Free") as "Free" | "Coach Pro", plans) &&
    !marketplaceVisible;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setFormError("Coach name is required."); return; }
    if (!email.trim()) { setFormError("Email is required."); return; }
    const emailTaken = otherCoaches.some((c) => c.email.toLowerCase() === email.trim().toLowerCase());
    if (emailTaken) { setFormError(`Another coach already uses ${email.trim()} — each coach needs a unique email.`); return; }
    setFormError("");
    setSaving(true);

    let lat = coach.lat;
    let lng = coach.lng;
    if (location.trim() && location !== coach.location) {
      try {
        const geoRes = await fetch("/api/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: location }),
        });
        const geoData = await geoRes.json();
        if (geoRes.ok) { lat = geoData.lat; lng = geoData.lng; }
      } catch {
        // Best-effort for the marketplace radius search — never blocks the save.
      }
    }

    try {
      await upsertCoach({
        // Billing/removal fields are deliberately omitted, not just left at their current value —
        // .upsert()'s conflict resolution only touches columns actually present in the payload, so
        // leaving them out preserves whatever the subscription flow/webhook or Remove/Reinstate
        // last set, same as the list page's own Add/Edit form already relies on (see its
        // DraftCoach type, which excludes these fields from the draft entirely for the same reason).
        id: coach.id, name: name.trim(), email: email.trim(), phone,
        specialization, age_groups_focus: ageGroupsFocus, location, status,
        joined_date: joinedDate, certification_level: certificationLevel, bio,
        academy_id: academyId || null, marketplace_visible: marketplaceVisible, available,
        lat: lat ?? null, lng: lng ?? null,
      });
    } catch (err) {
      setFormError(`Save failed: ${(err as { message?: string })?.message ?? String(err)}`);
      setSaving(false);
      return;
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => router.push(`/coaches/${coach.id}`), 1200);
  }

  const initials = coach.name.split(" ").map((n) => n[0] ?? "").join("");

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link
          href={`/coaches/${coach.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-hp-paper/45 hover:text-hp-paper transition-colors"
        >
          ← Back to Profile
        </Link>
      </div>

      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-full bg-hp-cg flex items-center justify-center text-hp-paper font-bold text-xl flex-shrink-0">
          {initials}
        </div>
        <div>
          <h1 className="font-display font-black uppercase text-xl text-hp-paper tracking-wide">Edit Coach</h1>
          <p className="text-hp-paper/45 text-sm">{coach.name}</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <Section title="Profile">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full Name *">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Arjun Sharma" required />
            </Field>
            <Field label="Email *">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="coach@email.com" disabled={user?.role === "coach"} required />
              {user?.role === "coach" && <p className="text-xs text-hp-paper/45 mt-1">Contact your academy admin to change your email.</p>}
            </Field>
            <Field label="Phone">
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="+61 4XX XXX XXX" />
            </Field>
            <Field label="Location">
              <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} placeholder="e.g. Brisbane, QLD" />
            </Field>
            <Field label="Specialization">
              <input type="text" value={specialization} onChange={(e) => setSpecialization(e.target.value)} className={inputCls} placeholder="e.g. Fast Bowling Biomechanics" />
            </Field>
            <Field label="Certification Level">
              <select value={certificationLevel} onChange={(e) => setCertificationLevel(e.target.value as CertificationLevel)} className={selectCls}>
                {CERT_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <label className="block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5">Bio</label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} className={`${inputCls} resize-none h-20`} placeholder="Background, experience, coaching philosophy…" />
            </div>
          </div>

          <div className="mt-5">
            <label className="block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5">Age Groups Focus</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {AGE_GROUPS.map((g) => {
                const isSel = ageGroupsFocus.includes(g);
                return (
                  <button key={g} type="button" onClick={() => toggleAgeGroup(g)}
                    className={`px-3 py-1.5 text-xs font-semibold border transition-colors cursor-pointer ${
                      isSel ? "bg-hp-cg/20 border-hp-cg text-hp-cg" : "bg-hp-ink border-white/12 text-hp-paper/45 hover:border-white/25"
                    }`}>
                    {g}
                  </button>
                );
              })}
            </div>
          </div>
        </Section>

        <Section title="Status & Academy">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value as CoachStatus)} className={selectCls}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </Field>
            <Field label="Joined Date">
              <DateInput value={joinedDate} onChange={setJoinedDate} className={inputCls} />
            </Field>
            <div className="sm:col-span-2">
              <label className="block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5">Academy</label>
              <select
                value={academyId}
                onChange={(e) => setAcademyId(e.target.value)}
                className={selectCls}
                disabled={user?.role === "academy_admin" || user?.role === "coach"}
              >
                <option value="">— None (independent coach) —</option>
                {academies.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} · {a.location}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={`flex items-center gap-2.5 select-none ${marketplaceLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                <input
                  type="checkbox"
                  checked={marketplaceVisible}
                  disabled={marketplaceLocked}
                  onChange={(e) => setMarketplaceVisible(e.target.checked)}
                  className="w-4 h-4 rounded accent-hp-cg cursor-pointer disabled:cursor-not-allowed"
                />
                <span className="text-sm text-hp-paper font-medium">Visible in the coach marketplace</span>
              </label>
              {marketplaceLocked ? (
                <p className="text-xs text-amber mt-1 ml-6">
                  Requires Coach Pro. <Link href="/coach/subscription" className="underline hover:opacity-80">Upgrade</Link> to become discoverable and get booked by players.
                </p>
              ) : (
                <p className="text-xs text-hp-paper/45 mt-1 ml-6">Players in this academy can find and request a booking with this coach from the marketplace.</p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={available}
                  onChange={(e) => setAvailable(e.target.checked)}
                  className="w-4 h-4 rounded accent-hp-cg cursor-pointer"
                />
                <span className="text-sm text-hp-paper font-medium">Actively taking new players</span>
              </label>
              <p className="text-xs text-hp-paper/45 mt-1 ml-6">Turn off to stay listed in the marketplace but show as unavailable for new bookings.</p>
            </div>
          </div>
        </Section>

        {formError && <p className="text-red-400 text-sm">{formError}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || saved}
            className={`px-6 py-3 text-sm font-bold transition-all cursor-pointer disabled:opacity-60 ${
              saved ? "bg-hp-cg/60 text-hp-paper" : "bg-hp-cg text-hp-paper hover:bg-hp-cg/90"
            }`}
          >
            {saved ? "✓ Saved" : saving ? "Saving…" : "Save Changes"}
          </button>
          <Link
            href={`/coaches/${coach.id}`}
            className="px-6 py-3 text-sm font-medium text-hp-paper/45 border border-white/12 hover:text-hp-paper hover:border-white/25 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-hp-surface border border-white/8 p-6">
      <h2 className="text-xs font-mono font-semibold uppercase tracking-widest text-hp-paper/45 mb-5">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-hp-ink px-4 py-3 text-hp-paper placeholder-hp-paper/30 border border-white/12 focus:border-hp-cg focus:outline-none transition-colors text-sm";
const selectCls = "w-full bg-hp-ink px-4 py-3 text-hp-paper border border-white/12 focus:border-hp-cg focus:outline-none transition-colors text-sm cursor-pointer";
