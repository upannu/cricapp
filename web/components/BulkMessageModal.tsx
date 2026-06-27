"use client";

import { useState } from "react";
import { insertMessage } from "@/lib/db";
import type { Player, MessageChannel } from "@/lib/types";

interface Props {
  players: Player[];
  onClose: () => void;
}

export function BulkMessageModal({ players, onClose }: Props) {
  const [channel, setChannel] = useState<MessageChannel>("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);

  const smsEligible = players.filter((p) => p.phone);
  const smsBlocked = players.filter((p) => !p.phone);
  const recipientCount = channel === "sms" ? smsEligible.length : players.length;

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const targets = channel === "sms" ? smsEligible : players;
    const now = new Date().toISOString();
    Promise.all(
      targets.map((p) =>
        insertMessage({
          player_id: p.id,
          from_name: "Coach",
          date: now,
          channel,
          subject: channel === "email" ? subject : "SMS",
          body,
        })
      )
    ).then(() => setSent(true));
  }

  const previewNames = players.slice(0, 3).map((p) => p.name.split(" ")[0]);
  const overflowCount = players.length - previewNames.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface rounded-2xl w-full max-w-lg shadow-2xl border border-zinc-700/60">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-zinc-700/60">
          <div>
            <h2 className="text-base font-bold text-white">Bulk Message</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              {previewNames.join(", ")}
              {overflowCount > 0 && (
                <span className="text-zinc-500"> +{overflowCount} more</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors text-xl leading-none cursor-pointer mt-0.5"
          >
            ×
          </button>
        </div>

        {sent ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-pace-green/20 text-pace-green flex items-center justify-center text-2xl mx-auto mb-3">
              ✓
            </div>
            <p className="text-white font-semibold text-sm mb-1">
              Sent to {recipientCount} player{recipientCount !== 1 ? "s" : ""}
            </p>
            <p className="text-zinc-400 text-xs">
              via {channel === "email" ? "Email" : "SMS"}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 px-5 py-2 rounded-xl text-sm font-semibold bg-pace-green text-black hover:opacity-90 transition-opacity cursor-pointer"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="p-6 space-y-4">
            {/* Channel toggle */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setChannel("email")}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer border ${
                  channel === "email"
                    ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
                    : "text-zinc-400 border-zinc-700 hover:border-zinc-500"
                }`}
              >
                ✉ Email
              </button>
              <button
                type="button"
                onClick={() => setChannel("sms")}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer border ${
                  channel === "sms"
                    ? "bg-pace-green/20 text-pace-green border-pace-green/40"
                    : "text-zinc-400 border-zinc-700 hover:border-zinc-500"
                }`}
              >
                💬 SMS
              </button>
            </div>

            {/* Recipients summary */}
            <div className="bg-ink rounded-xl px-4 py-3 text-xs">
              {channel === "email" ? (
                <span className="text-zinc-300">
                  Sending to{" "}
                  <span className="text-white font-semibold">
                    {players.length} player{players.length !== 1 ? "s" : ""}
                  </span>
                </span>
              ) : smsBlocked.length > 0 ? (
                <span className="text-amber">
                  ⚠ {smsEligible.length} of {players.length} players have a
                  mobile number.{" "}
                  <span className="text-zinc-400">
                    {smsBlocked.map((p) => p.name.split(" ")[0]).join(", ")}{" "}
                    will be skipped.
                  </span>
                </span>
              ) : (
                <span className="text-zinc-300">
                  Sending to{" "}
                  <span className="text-white font-semibold">
                    {players.length} player{players.length !== 1 ? "s" : ""}
                  </span>{" "}
                  via SMS
                </span>
              )}
            </div>

            {/* Subject (email only) */}
            {channel === "email" && (
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  placeholder="e.g. Training update this week"
                  className="w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-blue-500 focus:outline-none transition-colors text-sm"
                />
              </div>
            )}

            {/* Body */}
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                Message
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                rows={channel === "sms" ? 4 : 6}
                maxLength={channel === "sms" ? 160 : undefined}
                placeholder={
                  channel === "sms"
                    ? "Keep it under 160 characters"
                    : "Write your message..."
                }
                className={`w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border focus:outline-none transition-colors text-sm resize-none ${
                  channel === "email"
                    ? "border-zinc-700 focus:border-blue-500"
                    : "border-zinc-700 focus:border-pace-green"
                }`}
              />
              {channel === "sms" && (
                <p
                  className={`text-xs mt-1 text-right ${
                    body.length > 140 ? "text-amber" : "text-zinc-500"
                  }`}
                >
                  {body.length}/160
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={channel === "sms" && smsEligible.length === 0}
                className="flex-1 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-pace-green text-black hover:opacity-90"
              >
                Send to {recipientCount} player{recipientCount !== 1 ? "s" : ""}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-3 rounded-xl text-sm font-medium text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
