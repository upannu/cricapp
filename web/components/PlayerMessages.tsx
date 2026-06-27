"use client";

import { useState, useEffect } from "react";
import type { Message } from "@/lib/types";
import { fetchMessages } from "@/lib/db";
import { MessageModal } from "@/components/MessageModal";

const CHANNEL_STYLES = {
  email: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  sms:   "bg-pace-green/15 text-pace-green border-pace-green/30",
};

function formatTs(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    + " · "
    + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

interface Props {
  playerId: string;
  playerName: string;
  playerEmail: string;
  playerPhone: string;
}

export function PlayerMessages({ playerId, playerName, playerEmail, playerPhone }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [showModal, setShowModal] = useState(false);

  function reload() {
    fetchMessages(playerId).then(setMessages);
  }

  useEffect(() => { reload(); }, [playerId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-surface rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Messages</h2>
          <p className="text-zinc-500 text-xs mt-0.5">Emails and SMS sent to this player</p>
        </div>
        <button type="button" onClick={() => setShowModal(true)}
          className="px-4 py-2 text-xs font-bold text-blue-400 border border-blue-500/30 rounded-xl hover:bg-blue-500/10 transition-colors cursor-pointer">
          ✉ Send Message
        </button>
      </div>

      {messages.length === 0 ? (
        <div className="bg-ink rounded-xl p-8 text-center">
          <p className="text-zinc-500 text-sm mb-1">No messages yet</p>
          <p className="text-zinc-600 text-xs">Send an email or SMS and it will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <MessageCard key={m.id} message={m} />
          ))}
        </div>
      )}

      {showModal && (
        <MessageModal
          playerId={playerId}
          playerName={playerName}
          playerEmail={playerEmail}
          playerPhone={playerPhone}
          onClose={() => { setShowModal(false); reload(); }}
        />
      )}
    </div>
  );
}

function MessageCard({ message: m }: { message: Message }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-ink rounded-xl border border-transparent hover:border-zinc-700 transition-colors">
      <button type="button" onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-3 cursor-pointer">
        <div className="flex items-start gap-3">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex-shrink-0 mt-0.5 ${CHANNEL_STYLES[m.channel]}`}>
            {m.channel === "email" ? "✉ EMAIL" : "💬 SMS"}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              {m.channel === "email" && m.subject && (
                <span className="text-white text-xs font-semibold truncate">{m.subject}</span>
              )}
              {m.channel === "sms" && (
                <span className="text-white text-xs font-semibold truncate">{m.body.slice(0, 60)}{m.body.length > 60 ? "…" : ""}</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-zinc-500">
              <span>{m.fromName}</span>
              <span>·</span>
              <span>{formatTs(m.date)}</span>
            </div>
          </div>
          <span className={`text-zinc-500 text-xs transition-transform duration-200 flex-shrink-0 ${expanded ? "rotate-180" : ""}`}>▾</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-zinc-700/50">
          {m.channel === "email" && m.subject && (
            <p className="text-xs text-zinc-400 mb-2"><span className="font-semibold">Subject:</span> {m.subject}</p>
          )}
          <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{m.body}</p>
        </div>
      )}
    </div>
  );
}
