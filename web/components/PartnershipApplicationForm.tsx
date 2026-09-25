"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PartnershipOrgType } from "@/lib/types";

const STEP_LABELS = ["Organisation", "Scale", "Interests", "Requirements", "Contact"] as const;

const ORG_TYPES: PartnershipOrgType[] = [
  "National Cricket Board", "State Cricket Association", "Regional Cricket Association",
  "District Cricket Association", "Academy Network", "Professional Cricket Organisation", "Other",
];

const PLAYER_SCALE = ["1–100", "101–500", "501–1,000", "1,001–5,000", "5,001–10,000", "10,000+"];
const COACH_SCALE = ["1–10", "11–50", "51–100", "101–500", "500+"];
const ACADEMY_SCALE = ["1–5", "6–20", "21–50", "51–100", "100+"];
const REGION_SCALE = ["1", "2–5", "6–10", "10+"];

const INTERESTS = [
  { id: "player_development", title: "Player Development", body: "Track player pathways" },
  { id: "coach_management", title: "Coach Management", body: "Manage coaching staff and programs" },
  { id: "academy_management", title: "Academy Management", body: "Connect affiliated academies and clubs" },
  { id: "performance_analytics", title: "Performance Analytics", body: "Board-wide performance insight" },
  { id: "ai_video_analysis", title: "AI Video Analysis", body: "Automated biomechanics reports" },
  { id: "talent_identification", title: "Talent Identification", body: "Spot and track emerging talent" },
  { id: "board_reporting", title: "Board Reporting", body: "Ecosystem-wide reporting" },
  { id: "centralised_data", title: "Centralised Data", body: "One source of truth across regions" },
  { id: "custom_integrations", title: "Custom Integrations", body: "Connect existing systems" },
];

const CURRENT_SYSTEMS = ["Spreadsheets", "Multiple Software Systems", "Custom Internal Platform", "Manual Processes", "Existing Cricket Platform", "Other"];
const TIMELINES = ["Immediately", "Within 3 Months", "3–6 Months", "6–12 Months", "Exploring Options"];
const JOB_TITLES = ["CEO", "Board Member", "Director", "Head of Cricket", "Operations Manager", "Technology Manager", "Development Manager", "Other"];
const BUDGETS = ["Prefer not to say", "Under $50,000", "$50,000–$100,000", "$100,000–$250,000", "$250,000+", "Custom Enterprise"];

type Draft = {
  organisationName: string; organisationType: PartnershipOrgType | ""; country: string; region: string; website: string;
  scalePlayers: string; scaleCoaches: string; scaleAcademies: string; scaleRegions: string;
  interests: string[];
  challenges: string; currentSystems: string[]; timeline: string;
  contactFirstName: string; contactLastName: string; jobTitle: string; email: string; phone: string;
  budgetRange: string; additionalNotes: string;
};

const EMPTY_DRAFT: Draft = {
  organisationName: "", organisationType: "", country: "", region: "", website: "",
  scalePlayers: "", scaleCoaches: "", scaleAcademies: "", scaleRegions: "",
  interests: [],
  challenges: "", currentSystems: [], timeline: "",
  contactFirstName: "", contactLastName: "", jobTitle: "", email: "", phone: "",
  budgetRange: "", additionalNotes: "",
};

const inputCls = "w-full bg-hp-ink px-4 py-3 text-hp-paper placeholder-hp-paper/30 border border-white/12 focus:border-hp-cg focus:outline-none transition-colors text-sm";
const selectCls = "w-full bg-hp-ink px-4 py-3 text-hp-paper border border-white/12 focus:border-hp-cg focus:outline-none transition-colors text-sm cursor-pointer";
const labelCls = "block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5";

function ScalePicker({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(value === o ? "" : o)}
          className={`px-4 py-3 text-sm font-display font-bold uppercase border transition-colors cursor-pointer ${
            value === o ? "bg-hp-cg text-hp-paper border-hp-cg" : "bg-hp-ink text-hp-paper/70 border-white/12 hover:border-white/25"
          }`}>
          {o}
        </button>
      ))}
    </div>
  );
}

/** The 5-step public application at /partnerships/cricket-board/apply — a dedicated lead-capture
 * flow for boards/associations, deliberately separate from the existing per-academy Memberships
 * admin area (see api/partnerships/apply). Local step state only; nothing is saved until the
 * final submit. */
export function PartnershipApplicationForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function toggleListValue(key: "interests" | "currentSystems", value: string) {
    setDraft((prev) => ({
      ...prev,
      [key]: prev[key].includes(value) ? prev[key].filter((v) => v !== value) : [...prev[key], value],
    }));
  }

  function validateStep(): string {
    if (step === 1) {
      if (!draft.organisationName.trim()) return "Organisation name is required.";
      if (!draft.organisationType) return "Please select your organisation type.";
      if (!draft.country.trim()) return "Country is required.";
    }
    if (step === 5) {
      if (!draft.contactFirstName.trim() || !draft.contactLastName.trim()) return "Your name is required.";
      if (!draft.jobTitle) return "Please select your job title.";
      if (!draft.email.trim()) return "Email is required.";
    }
    return "";
  }

  function handleContinue() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError("");
    setStep((s) => Math.min(5, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBack() {
    setError("");
    setStep((s) => Math.max(1, s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/partnerships/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Could not submit your application.");
      router.push(`/partnerships/cricket-board/success?ref=${encodeURIComponent(data.reference)}`);
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="bg-hp-surface border border-white/10 border-t-2 border-t-hp-cg p-6 sm:p-8 shadow-[0_12px_48px_-12px_rgba(0,0,0,0.5)]">
        <h1 className="font-display font-black uppercase text-xl text-hp-paper mb-1">Cricket Board Partnership</h1>
        <p className="text-hp-paper/52 text-sm mb-6">Tell us about your organisation</p>

        {/* Progress */}
        <div className="mb-8">
          <p className="font-mono text-xs text-hp-paper/45 uppercase tracking-wider mb-2">Step {step} of 5 — {STEP_LABELS[step - 1]}</p>
          <div className="flex gap-1.5">
            {STEP_LABELS.map((label, i) => (
              <div key={label} className={`h-1.5 flex-1 ${i + 1 <= step ? "bg-hp-cg" : "bg-white/10"}`} />
            ))}
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-display font-black uppercase text-hp-paper text-sm mb-2">About Your Organisation</h2>
            <div>
              <label htmlFor="pa-org-name" className={labelCls}>Organisation Name *</label>
              <input id="pa-org-name" type="text" value={draft.organisationName} onChange={(e) => update("organisationName", e.target.value)} className={inputCls} />
              <p className="text-xs text-hp-paper/40 mt-1.5">Legal or trading name — whatever&apos;s on your paperwork.</p>
            </div>
            <div>
              <label htmlFor="pa-org-type" className={labelCls}>Organisation Type *</label>
              <select id="pa-org-type" value={draft.organisationType} onChange={(e) => update("organisationType", e.target.value as PartnershipOrgType)} className={selectCls}>
                <option value="">— Select organisation type —</option>
                {ORG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="pa-country" className={labelCls}>Country *</label>
                <input id="pa-country" type="text" value={draft.country} onChange={(e) => update("country", e.target.value)} className={inputCls} placeholder="Australia" />
              </div>
              <div>
                <label htmlFor="pa-region" className={labelCls}>State / Region</label>
                <input id="pa-region" type="text" value={draft.region} onChange={(e) => update("region", e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label htmlFor="pa-website" className={labelCls}>Website</label>
              <input id="pa-website" type="url" value={draft.website} onChange={(e) => update("website", e.target.value)} className={inputCls} placeholder="https://" />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h2 className="font-display font-black uppercase text-hp-paper text-sm mb-2">Your Cricket Ecosystem</h2>
            <div>
              <label className={labelCls}>Approximately how many players?</label>
              <ScalePicker options={PLAYER_SCALE} value={draft.scalePlayers} onChange={(v) => update("scalePlayers", v)} />
            </div>
            <div>
              <label className={labelCls}>Coaches</label>
              <ScalePicker options={COACH_SCALE} value={draft.scaleCoaches} onChange={(v) => update("scaleCoaches", v)} />
            </div>
            <div>
              <label className={labelCls}>Academies / Clubs</label>
              <ScalePicker options={ACADEMY_SCALE} value={draft.scaleAcademies} onChange={(v) => update("scaleAcademies", v)} />
            </div>
            <div>
              <label className={labelCls}>Regions</label>
              <ScalePicker options={REGION_SCALE} value={draft.scaleRegions} onChange={(v) => update("scaleRegions", v)} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display font-black uppercase text-hp-paper text-sm">What Are You Interested In?</h2>
              <span className="text-xs text-hp-cg font-mono font-semibold">Selected: {draft.interests.length}</span>
            </div>
            <p className="text-hp-paper/45 text-xs mb-4">Select all that apply</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {INTERESTS.map((f) => {
                const checked = draft.interests.includes(f.id);
                return (
                  <button key={f.id} type="button" onClick={() => toggleListValue("interests", f.id)}
                    className={`text-left border px-4 py-3 transition-colors cursor-pointer ${
                      checked ? "border-hp-cg bg-hp-cg/5" : "border-white/12 hover:border-white/25"
                    }`}>
                    <p className={`text-sm font-display font-bold uppercase mb-0.5 ${checked ? "text-hp-cg" : "text-hp-paper"}`}>{f.title}</p>
                    <p className="text-xs text-hp-paper/45">{f.body}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <h2 className="font-display font-black uppercase text-hp-paper text-sm mb-2">Help Us Understand Your Needs</h2>
            <div>
              <label htmlFor="pa-challenges" className={labelCls}>What challenges are you trying to solve?</label>
              <textarea id="pa-challenges" rows={4} value={draft.challenges} onChange={(e) => update("challenges", e.target.value)}
                className={`${inputCls} resize-none`} placeholder="Tell us about your current challenges or goals…" />
            </div>
            <div>
              <label className={labelCls}>Current Systems</label>
              <div className="space-y-2">
                {CURRENT_SYSTEMS.map((s) => (
                  <label key={s} className="flex items-center gap-2.5 text-sm text-hp-paper/75 cursor-pointer">
                    <input type="checkbox" checked={draft.currentSystems.includes(s)} onChange={() => toggleListValue("currentSystems", s)} className="accent-hp-cg w-4 h-4" />
                    {s}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Implementation Timeline</label>
              <div className="flex flex-wrap gap-2">
                {TIMELINES.map((t) => (
                  <button key={t} type="button" onClick={() => update("timeline", draft.timeline === t ? "" : t)}
                    className={`px-4 py-2 text-xs font-display font-bold uppercase border transition-colors cursor-pointer ${
                      draft.timeline === t ? "bg-hp-cg text-hp-paper border-hp-cg" : "bg-hp-ink text-hp-paper/70 border-white/12 hover:border-white/25"
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h2 className="font-display font-black uppercase text-hp-paper text-sm mb-2">Your Contact Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="pa-first-name" className={labelCls}>First Name *</label>
                <input id="pa-first-name" type="text" value={draft.contactFirstName} onChange={(e) => update("contactFirstName", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="pa-last-name" className={labelCls}>Last Name *</label>
                <input id="pa-last-name" type="text" value={draft.contactLastName} onChange={(e) => update("contactLastName", e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label htmlFor="pa-job-title" className={labelCls}>Job Title *</label>
              <select id="pa-job-title" value={draft.jobTitle} onChange={(e) => update("jobTitle", e.target.value)} className={selectCls}>
                <option value="">— Select job title —</option>
                {JOB_TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="pa-email" className={labelCls}>Email *</label>
                <input id="pa-email" type="email" value={draft.email} onChange={(e) => update("email", e.target.value)} className={inputCls} />
                <p className="text-xs text-hp-paper/40 mt-1.5">We&apos;ll send confirmation and next steps here.</p>
              </div>
              <div>
                <label htmlFor="pa-phone" className={labelCls}>Phone</label>
                <input id="pa-phone" type="tel" value={draft.phone} onChange={(e) => update("phone", e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label htmlFor="pa-budget" className={labelCls}>Do you have an estimated budget?</label>
              <select id="pa-budget" value={draft.budgetRange} onChange={(e) => update("budgetRange", e.target.value)} className={selectCls}>
                <option value="">— Prefer not to say —</option>
                {BUDGETS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pa-notes" className={labelCls}>Additional Notes</label>
              <textarea id="pa-notes" rows={3} value={draft.additionalNotes} onChange={(e) => update("additionalNotes", e.target.value)}
                className={`${inputCls} resize-none`} />
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

        <div className="flex items-center gap-3 mt-6">
          {step > 1 && (
            <button type="button" onClick={handleBack}
              className="px-5 py-2.5 text-sm font-mono font-medium text-hp-paper/60 border border-white/12 hover:text-hp-paper hover:border-white/25 transition-colors cursor-pointer">
              ← Back
            </button>
          )}
          <div className="flex-1" />
          {step < 5 ? (
            <button type="button" onClick={handleContinue}
              className="px-6 py-2.5 bg-hp-cg text-hp-paper text-sm font-display font-black uppercase tracking-wider hover:bg-hp-cg/90 transition-colors cursor-pointer">
              Continue →
            </button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={submitting}
              className="px-6 py-2.5 bg-hp-cg text-hp-paper text-sm font-display font-black uppercase tracking-wider hover:bg-hp-cg/90 transition-colors cursor-pointer disabled:opacity-60">
              {submitting ? "Submitting…" : "Submit Partnership Application"}
            </button>
          )}
        </div>
      </div>

      <p className="text-center mt-6">
        <Link href="/partnerships/cricket-board" className="font-mono text-xs text-hp-paper/50 hover:text-hp-paper/80 transition-colors uppercase tracking-wider">
          ← Back to overview
        </Link>
      </p>
    </div>
  );
}
