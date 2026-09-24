"use client";

import { useState } from "react";
import { LegalPageShell } from "@/components/LegalPageShell";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Could not send your message.");
      setSent(true);
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <LegalPageShell title="Contact Us">
      <p>
        Questions about your account, an academy, or anything else — reach out any time at{" "}
        <a href="mailto:support@crichq.com.au" className="text-hp-cg hover:underline">support@crichq.com.au</a>{" "}
        or use the form below.
      </p>

      {sent ? (
        <div className="mt-6 px-5 py-4 bg-hp-cg/10 border border-hp-cg/30 text-hp-cg text-sm font-semibold">
          ✓ Thanks — your message has been sent. We&apos;ll get back to you soon.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4 max-w-md">
          <div>
            <label className="block text-xs font-mono uppercase tracking-widest text-hp-paper/52 mb-2">Name</label>
            <input
              type="text" required value={name} onChange={(e) => setName(e.target.value)}
              className="w-full bg-hp-surface px-4 py-2.5 text-sm text-hp-paper placeholder-hp-paper/30 border border-white/10 focus:border-hp-cg focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-widest text-hp-paper/52 mb-2">Email</label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-hp-surface px-4 py-2.5 text-sm text-hp-paper placeholder-hp-paper/30 border border-white/10 focus:border-hp-cg focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-widest text-hp-paper/52 mb-2">Message</label>
            <textarea
              required rows={5} value={message} onChange={(e) => setMessage(e.target.value)}
              className="w-full bg-hp-surface px-4 py-2.5 text-sm text-hp-paper placeholder-hp-paper/30 border border-white/10 focus:border-hp-cg focus:outline-none resize-none"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit" disabled={sending}
            className="px-7 py-3 bg-hp-cg text-hp-paper text-sm font-display font-black uppercase tracking-[0.12em] hover:bg-hp-cg/90 transition-colors cursor-pointer disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send Message"}
          </button>
        </form>
      )}
    </LegalPageShell>
  );
}
