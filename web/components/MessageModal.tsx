"use client";

import { useState } from "react";
import type { MessageChannel } from "@/lib/types";
import { insertMessage } from "@/lib/db";
import { useAuth } from "@/lib/auth";

interface Props {
  playerId: string;
  playerName: string;
  playerEmail: string;
  playerPhone: string;
  onClose: () => void;
}

const SMS_LIMIT = 160;

export function MessageModal({ playerId, playerName, playerEmail, playerPhone, onClose }: Props) {
  const { user } = useAuth();
  const [channel, setChannel] = useState<MessageChannel>("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function handleSend() {
    if (!body.trim()) { setError("Message body is required."); return; }
    if (channel === "email" && !subject.trim()) { setError("Subject is required for email."); return; }
    setError("");
    setSending(true);

    if (channel === "email") {
      const res = await fetch("/api/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: playerEmail,
          subject: subject.trim(),
          body: body.trim(),
          fromName: user?.name ?? "CRIC HQ",
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(`Failed to send: ${data.error}`);
        setSending(false);
        return;
      }
    } else if (channel === "sms") {
      const res = await fetch("/api/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: playerPhone,
          body: body.trim(),
          fromName: user?.name ?? "CRIC HQ",
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(`Failed to send: ${data.error}`);
        setSending(false);
        return;
      }
    }

    await insertMessage({
      player_id: playerId,
      from_name: user?.name ?? "Coach",
      date: new Date().toISOString(),
      channel,
      subject: channel === "email" ? subject.trim() : "",
      body: body.trim(),
    });

    setSending(false);
    setSent(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-hp-surface w-full max-w-lg shadow-2xl border border-white/15"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/12">
          <div>
            <h2 className="text-hp-paper font-bold text-base">Message {playerName}</h2>
            <p className="text-hp-paper/45 text-xs mt-0.5">
              {channel === "email" ? playerEmail : (playerPhone || "No mobile number")}
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="text-hp-paper/60 hover:text-hp-paper transition-colors cursor-pointer text-xl leading-none p-1">
            ✕
          </button>
        </div>

        {sent ? (
          <div className="px-6 py-12 text-center">
            <div className="text-3xl mb-3">{channel === "email" ? "✉️" : "📱"}</div>
            <p className="text-hp-paper font-bold text-base mb-1">
              {channel === "email" ? "Email sent" : "SMS sent"}
            </p>
            <p className="text-hp-paper/60 text-sm mb-1">
              {channel === "email"
                ? `Delivered to ${playerEmail}`
                : `Delivered to ${playerPhone}`}
            </p>
            <p className="text-hp-paper/35 text-xs mb-6">Message saved to player profile</p>
            <div className="flex gap-3 justify-center">
              <button type="button" onClick={() => { setSent(false); setSubject(""); setBody(""); }}
                className="px-4 py-2 text-sm font-semibold text-hp-paper/70 border border-white/15 hover:border-white/35 cursor-pointer transition-colors">
                Send another
              </button>
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm font-semibold bg-hp-cg text-hp-paper hover:bg-hp-cg/90 cursor-pointer transition-colors">
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            {/* Channel toggle */}
            <div>
              <label className={lbl}>Send via</label>
              <div className="flex gap-2">
                {(["email", "sms"] as MessageChannel[]).map((c) => {
                  const disabled = c === "sms" && !playerPhone;
                  return (
                    <button key={c} type="button"
                      onClick={() => { if (!disabled) { setChannel(c); setError(""); } }}
                      disabled={disabled}
                      className={`flex-1 py-2.5 text-sm font-bold border transition-colors flex items-center justify-center gap-2 ${
                        disabled
                          ? "opacity-40 cursor-not-allowed bg-hp-ink text-hp-paper/30 border-white/8"
                          : channel === c
                            ? c === "email" ? "bg-blue-500/20 text-blue-400 border-blue-500/40 cursor-pointer"
                                            : "bg-hp-cg/20 text-hp-cg border-hp-cg/40 cursor-pointer"
                            : "bg-hp-ink text-hp-paper/45 border-white/12 hover:border-white/30 cursor-pointer"
                      }`}>
                      <span>{c === "email" ? "✉" : "💬"}</span>
                      <span>{c === "email" ? "Email" : "SMS"}</span>
                    </button>
                  );
                })}
              </div>
              {!playerPhone && (
                <p className="text-xs text-amber mt-2">
                  No mobile number on file — add one in the player's profile to enable SMS.
                </p>
              )}
            </div>

            {/* Subject — email only */}
            {channel === "email" && (
              <div>
                <label className={lbl}>Subject *</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className={inp}
                  placeholder="e.g. Session feedback – 28 Jun"
                />
              </div>
            )}

            {/* Body */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={lbl}>Message *</label>
                {channel === "sms" && (
                  <span className={`text-xs font-semibold ${body.length > SMS_LIMIT ? "text-red-400" : "text-hp-paper/45"}`}>
                    {body.length}/{SMS_LIMIT}
                  </span>
                )}
              </div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={channel === "sms" ? SMS_LIMIT : undefined}
                rows={channel === "sms" ? 4 : 6}
                className={`${inp} resize-none`}
                placeholder={
                  channel === "email"
                    ? "Write your feedback or message…"
                    : "Short message (max 160 chars)…"
                }
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex items-center gap-3 pt-1">
              <button type="button" onClick={handleSend} disabled={sending}
                className={`px-6 py-2.5 text-sm font-bold hover:opacity-90 cursor-pointer transition-opacity disabled:opacity-60 ${
                  channel === "email" ? "bg-blue-500 text-white" : "bg-hp-cg text-hp-paper"
                }`}>
                {sending ? "Sending…" : channel === "email" ? "Send Email" : "Send SMS"}
              </button>
              <button type="button" onClick={onClose}
                className="px-4 py-2.5 text-sm font-medium text-hp-paper/60 border border-white/15 hover:text-hp-paper hover:border-white/30 transition-colors cursor-pointer">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inp = "w-full bg-hp-ink px-4 py-3 text-hp-paper placeholder-hp-paper/30 border border-white/12 focus:border-hp-cg focus:outline-none transition-colors text-sm";
const lbl = "block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5";
