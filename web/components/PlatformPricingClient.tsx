"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { fetchPlatformSettings } from "@/lib/db";
import type { PlatformSettings } from "@/lib/types";

export function PlatformPricingClient() {
  const { user } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [playerPro, setPlayerPro] = useState("");
  const [coachPro, setCoachPro] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user && user.role !== "platform_admin") { router.replace("/players"); return; }
  }, [user, router]);

  useEffect(() => {
    fetchPlatformSettings().then((s) => {
      setSettings(s);
      setPlayerPro(String(s.playerProPriceAud));
      setCoachPro(String(s.coachProPriceAud));
      setLoading(false);
    });
  }, []);

  if (!user || user.role !== "platform_admin") return null;

  async function handleSave() {
    setError("");
    const playerProPriceAud = parseFloat(playerPro);
    const coachProPriceAud = parseFloat(coachPro);
    if (!(playerProPriceAud > 0) || !(coachProPriceAud > 0)) {
      setError("Both prices must be positive numbers.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/platform-settings/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerProPriceAud, coachProPriceAud }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Could not save pricing.");
      setSettings({ playerProPriceAud, coachProPriceAud });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  const dirty = settings && (playerPro !== String(settings.playerProPriceAud) || coachPro !== String(settings.coachProPriceAud));

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link href="/players" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors">
          ← Back
        </Link>
      </div>

      <h1 className="text-xl font-bold text-white mb-1">Subscription Pricing</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Sets the price shown on the upgrade page and charged at checkout for new subscriptions.
        Changing this doesn&apos;t affect players already subscribed — they keep their current rate
        until they cancel and resubscribe.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="bg-surface rounded-2xl p-6 space-y-5">
          <div>
            <label className={lbl}>Player Pro ($ AUD / month)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={playerPro}
                onChange={(e) => setPlayerPro(e.target.value)}
                className={`${inputCls} pl-7`}
              />
            </div>
          </div>

          <div>
            <label className={lbl}>Coach Pro ($ AUD / month)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={coachPro}
                onChange={(e) => setCoachPro(e.target.value)}
                className={`${inputCls} pl-7`}
              />
            </div>
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
      )}
    </div>
  );
}

const inputCls =
  "w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm";

const lbl = "block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";
