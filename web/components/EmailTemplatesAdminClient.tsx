"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { fetchEmailTemplates } from "@/lib/db";
import { renderTemplate } from "@/lib/email-templates";
import type { EmailTemplate, WelcomeEmailRole } from "@/lib/types";

const ROLES: { id: WelcomeEmailRole; label: string }[] = [
  { id: "player", label: "Player" },
  { id: "coach", label: "Coach" },
  { id: "academy_admin", label: "Academy" },
  { id: "parent", label: "Parent" },
];

type Draft = { subject: string; heading: string; body: string };

const PREVIEW_VARS = { name: "Alex Smith" };

export function EmailTemplatesAdminClient() {
  const { user } = useAuth();
  const router = useRouter();
  const [templates, setTemplates] = useState<Record<string, EmailTemplate>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [activeRole, setActiveRole] = useState<WelcomeEmailRole>("player");
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
      setTemplates(byId);
      setDrafts(draftById);
      setLoading(false);
    });
  }, []);

  if (!user || user.role !== "platform_admin") return null;

  const draft = drafts[activeRole];
  const saved_ = templates[activeRole];
  const dirty = !!draft && !!saved_ && (
    draft.subject !== saved_.subject || draft.heading !== saved_.heading || draft.body !== saved_.body
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
        <Link href="/players" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors">
          ← Back
        </Link>
      </div>

      <h1 className="text-xl font-bold text-white mb-1">Welcome Email Templates</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Sent automatically when a signup is approved (see Approvals). Use <code className="text-pace-green">{"{{name}}"}</code> anywhere
        to insert the person&apos;s name. Blank lines in the body start a new paragraph.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          <div className="flex gap-1 mb-6">
            {ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { setActiveRole(r.id); setError(""); }}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeRole === r.id ? "bg-pace-green text-black" : "bg-ink text-zinc-400 hover:text-white"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {draft && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-surface rounded-2xl p-6 space-y-5">
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
                  className={`px-6 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                    saved ? "bg-pace-green/60 text-black" : "bg-pace-green text-black hover:opacity-90 disabled:opacity-40"
                  }`}
                >
                  {saved ? "✓ Saved" : saving ? "Saving…" : "Save Changes"}
                </button>
              </div>

              <div className="bg-ink rounded-2xl p-6 border border-zinc-700/60">
                <p className={lbl}>Preview (sample name: {PREVIEW_VARS.name})</p>
                <div className="bg-surface rounded-xl p-5">
                  <p className="text-xs text-zinc-500 mb-3">Subject: {renderTemplate(draft.subject, PREVIEW_VARS)}</p>
                  <h2 className="text-lg font-bold text-white mb-3">{renderTemplate(draft.heading, PREVIEW_VARS)}</h2>
                  {renderTemplate(draft.body, PREVIEW_VARS).split(/\n{2,}/).filter((p) => p.trim()).map((p, i) => (
                    <p key={i} className="text-sm text-zinc-300 leading-relaxed mb-3 whitespace-pre-line">{p}</p>
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
  "w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm";

const lbl = "block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";
