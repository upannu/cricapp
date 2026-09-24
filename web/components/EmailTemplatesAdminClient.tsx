"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { fetchEmailTemplates } from "@/lib/db";
import { renderTemplate } from "@/lib/email-templates";
import type { EmailTemplate, SystemEmailId } from "@/lib/types";

const ROLES: { id: SystemEmailId; label: string }[] = [
  { id: "player", label: "Player" },
  { id: "coach", label: "Coach" },
  { id: "academy_admin", label: "Academy" },
  { id: "parent", label: "Parent" },
  { id: "coach_invite", label: "Coach Invite" },
];

type Draft = { subject: string; heading: string; body: string };
const EMPTY_DRAFT: Draft = { subject: "", heading: "", body: "" };

const PREVIEW_VARS = { name: "Alex Smith" };

export function EmailTemplatesAdminClient() {
  const { user } = useAuth();
  const router = useRouter();
  const [templates, setTemplates] = useState<Record<string, EmailTemplate>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [activeRole, setActiveRole] = useState<SystemEmailId>("player");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user && user.role !== "platform_admin") { router.replace("/players"); return; }
  }, [user, router]);

  useEffect(() => {
    fetchEmailTemplates().then((rows) => {
      const byId: Record<string, EmailTemplate> = {};
      const draftById: Record<string, Draft> = {};
      for (const row of rows) {
        byId[row.id] = row;
        draftById[row.id] = { subject: row.subject, heading: row.heading, body: row.body };
      }
      // A template id can be defined in code (ROLES above) before its row exists in the DB —
      // /api/email-templates/update upserts, so saving here creates it on first use. Without this,
      // a brand-new id like coach_invite would render a blank panel with nothing to type into.
      for (const role of ROLES) {
        if (!draftById[role.id]) draftById[role.id] = { ...EMPTY_DRAFT };
      }
      setTemplates(byId);
      setDrafts(draftById);
      setLoading(false);
    });
  }, []);

  if (!user || user.role !== "platform_admin") return null;

  const draft = drafts[activeRole];
  const saved_ = templates[activeRole];
  // No saved_ means this template has never been saved yet (e.g. a brand-new id like
  // coach_invite whose DB row doesn't exist until the first save) — treat that as an implicit
  // empty template rather than requiring one to already exist before Save can ever be enabled.
  const dirty = !!draft && (
    draft.subject !== (saved_?.subject ?? "") ||
    draft.heading !== (saved_?.heading ?? "") ||
    draft.body !== (saved_?.body ?? "")
  );

  function setDraft(patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [activeRole]: { ...prev[activeRole], ...patch } }));
  }

  async function handleSave() {
    if (!draft) return;
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/email-templates/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeRole, ...draft }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Could not save this template.");
      setTemplates((prev) => ({ ...prev, [activeRole]: { id: activeRole, ...draft } }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link href="/players" className="inline-flex items-center gap-1.5 text-sm text-hp-paper/45 hover:text-hp-paper transition-colors">
          ← Back
        </Link>
      </div>

      <h1 className="font-display font-black uppercase text-2xl text-hp-paper tracking-wide mb-1">Welcome Email Templates</h1>
      <p className="text-hp-paper/45 text-sm mb-6">
        Sent automatically when a signup is approved (see Approvals). Use <code className="text-pace-green">{"{{name}}"}</code> anywhere
        to insert the person&apos;s name. Blank lines in the body start a new paragraph.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 border-hp-cg border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          <div className="flex gap-1 mb-6">
            {ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { setActiveRole(r.id); setError(""); }}
                className={`px-4 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  activeRole === r.id ? "bg-hp-cg text-hp-paper" : "bg-hp-ink text-hp-paper/45 hover:text-hp-paper"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {draft && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-hp-surface p-6 space-y-5">
                <div>
                  <label className={lbl}>Email subject</label>
                  <input type="text" value={draft.subject} onChange={(e) => setDraft({ subject: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={lbl}>Heading</label>
                  <input type="text" value={draft.heading} onChange={(e) => setDraft({ heading: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={lbl}>Body</label>
                  <textarea
                    rows={8}
                    value={draft.body}
                    onChange={(e) => setDraft({ body: e.target.value })}
                    className={`${inputCls} resize-none text-base leading-relaxed`}
                  />
                </div>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className={`px-6 py-3 text-sm font-bold transition-all cursor-pointer ${
                    saved ? "bg-hp-cg/60 text-hp-paper" : "bg-hp-cg text-hp-paper hover:bg-hp-cg/90 disabled:opacity-40"
                  }`}
                >
                  {saved ? "✓ Saved" : saving ? "Saving…" : "Save Changes"}
                </button>
              </div>

              <div className="bg-hp-ink p-6 border border-white/12">
                <p className={lbl}>Preview (sample name: {PREVIEW_VARS.name})</p>
                <div className="bg-hp-surface p-5">
                  <p className="text-xs text-hp-paper/45 mb-3">Subject: {renderTemplate(draft.subject, PREVIEW_VARS)}</p>
                  <h2 className="text-lg font-bold text-hp-paper mb-3">{renderTemplate(draft.heading, PREVIEW_VARS)}</h2>
                  {renderTemplate(draft.body, PREVIEW_VARS).split(/\n{2,}/).filter((p) => p.trim()).map((p, i) => (
                    <p key={i} className="text-sm text-hp-paper/70 leading-relaxed mb-3 whitespace-pre-line">{p}</p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const inputCls =
  "w-full bg-hp-ink px-4 py-3 text-hp-paper placeholder-hp-paper/30 border border-white/12 focus:border-hp-cg focus:outline-none transition-colors text-sm";

const lbl = "block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5";
