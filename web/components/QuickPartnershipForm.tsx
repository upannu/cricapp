"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PartnershipOrgType } from "@/lib/types";

const inputCls = "w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm";
const labelCls = "block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";

type Draft = {
  organisationName: string; country: string;
  contactFirstName: string; contactLastName: string; jobTitle: string; email: string; phone: string;
  scaleValue: string;
};

const EMPTY_DRAFT: Draft = {
  organisationName: "", country: "",
  contactFirstName: "", contactLastName: "", jobTitle: "", email: "", phone: "",
  scaleValue: "",
};

interface ScaleQuestion {
  label: string;
  options: string[];
  /** Which partnership_applications scale column this maps to. */
  field: "scalePlayers" | "scaleAcademies";
}

/** A short, single-screen sibling to PartnershipApplicationForm's 5-step wizard — same
 * /api/partnerships/apply endpoint and partnership_applications/partnership_activity tables
 * (organisationType distinguishes the audience; the admin list/detail views already treat it
 * as an opaque display string, so no admin-side changes were needed), but far fewer questions
 * for the Academies/Coaches/Cricket Associations audiences, who don't need the full
 * board-scale intake (interests grid, current systems, budget range, etc). */
export function QuickPartnershipForm({
  orgType, heading, subheading, nameLabel, namePlaceholder, roleLabel, scaleQuestion, backHref,
}: {
  orgType: PartnershipOrgType;
  heading: string;
  subheading: string;
  nameLabel: string;
  namePlaceholder?: string;
  roleLabel: string;
  scaleQuestion?: ScaleQuestion;
  backHref: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string {
    if (!draft.organisationName.trim()) return `${nameLabel} is required.`;
    if (!draft.country.trim()) return "Country is required.";
    if (!draft.contactFirstName.trim() || !draft.contactLastName.trim()) return "Your name is required.";
    if (!draft.jobTitle.trim()) return `${roleLabel} is required.`;
    if (!draft.email.trim()) return "Email is required.";
    return "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/partnerships/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationName: draft.organisationName,
          organisationType: orgType,
          country: draft.country,
          contactFirstName: draft.contactFirstName,
          contactLastName: draft.contactLastName,
          jobTitle: draft.jobTitle,
          email: draft.email,
          phone: draft.phone,
          ...(scaleQuestion?.field === "scalePlayers" ? { scalePlayers: draft.scaleValue } : {}),
          ...(scaleQuestion?.field === "scaleAcademies" ? { scaleAcademies: draft.scaleValue } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Could not submit your details.");
      router.push(`/partnerships/cricket-board/success?ref=${encodeURIComponent(data.reference)}`);
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-10">
      <h1 className="text-xl font-bold text-white mb-1">{heading}</h1>
      <p className="text-zinc-400 text-sm mb-6">{subheading}</p>

      <form onSubmit={handleSubmit} className="bg-surface rounded-2xl p-6 space-y-4">
        <div>
          <label htmlFor="qp-org-name" className={labelCls}>{nameLabel} *</label>
          <input id="qp-org-name" type="text" value={draft.organisationName}
            onChange={(e) => update("organisationName", e.target.value)} className={inputCls} placeholder={namePlaceholder} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="qp-first-name" className={labelCls}>First Name *</label>
            <input id="qp-first-name" type="text" value={draft.contactFirstName}
              onChange={(e) => update("contactFirstName", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="qp-last-name" className={labelCls}>Last Name *</label>
            <input id="qp-last-name" type="text" value={draft.contactLastName}
              onChange={(e) => update("contactLastName", e.target.value)} className={inputCls} />
          </div>
        </div>

        <div>
          <label htmlFor="qp-role" className={labelCls}>{roleLabel} *</label>
          <input id="qp-role" type="text" value={draft.jobTitle}
            onChange={(e) => update("jobTitle", e.target.value)} className={inputCls} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="qp-email" className={labelCls}>Email *</label>
            <input id="qp-email" type="email" value={draft.email}
              onChange={(e) => update("email", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="qp-phone" className={labelCls}>Phone</label>
            <input id="qp-phone" type="tel" value={draft.phone}
              onChange={(e) => update("phone", e.target.value)} className={inputCls} />
          </div>
        </div>

        <div>
          <label htmlFor="qp-country" className={labelCls}>Country *</label>
          <input id="qp-country" type="text" value={draft.country}
            onChange={(e) => update("country", e.target.value)} className={inputCls} placeholder="Australia" />
        </div>

        {scaleQuestion && (
          <div>
            <label className={labelCls}>{scaleQuestion.label}</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {scaleQuestion.options.map((o) => (
                <button key={o} type="button" onClick={() => update("scaleValue", draft.scaleValue === o ? "" : o)}
                  className={`px-4 py-3 rounded-xl text-sm font-semibold border transition-colors cursor-pointer ${
                    draft.scaleValue === o ? "bg-pace-green text-black border-pace-green" : "bg-ink text-zinc-300 border-zinc-700 hover:border-zinc-500"
                  }`}>
                  {o}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button type="submit" disabled={submitting}
          className="w-full px-6 py-3 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60">
          {submitting ? "Submitting…" : "Register Your Interest"}
        </button>
      </form>

      <p className="text-center mt-6">
        <Link href={backHref} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          ← Back to overview
        </Link>
      </p>
    </div>
  );
}
