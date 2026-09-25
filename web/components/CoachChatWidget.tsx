"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "What does my front knee angle mean?",
  "Give me a drill for over-striding",
  "How do I build pace safely?",
];

export function CoachChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  if (!user) return null;

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError("");
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Coach AI couldn't respond right now.");
        setSending(false);
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content + chunk };
          return copy;
        });
      }
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[360px] max-w-[calc(100vw-3rem)] h-[520px] max-h-[calc(100vh-8rem)] bg-hp-surface border border-white/12 shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/12 bg-hp-ink">
            <div>
              <p className="text-sm font-bold text-hp-paper">Coach AI</p>
              <p className="text-[11px] text-hp-paper/45">Cricket coaching & analysis only</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-hp-paper/45 hover:text-hp-paper transition-colors cursor-pointer"
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div>
                <p className="text-xs text-hp-paper/45 mb-3">Ask about technique, drills, your reports, or training — Coach AI stays on cricket.</p>
                <div className="space-y-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="w-full text-left px-3 py-2 bg-hp-ink text-xs text-hp-paper/70 hover:text-hp-paper hover:bg-white/8 transition-colors cursor-pointer"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user" ? "bg-hp-cg text-hp-paper" : "bg-hp-ink text-hp-paper/80"
                  }`}
                >
                  {m.content || (sending && i === messages.length - 1 ? "…" : "")}
                </div>
              </div>
            ))}
            {error && (
              <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                {error}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="flex items-center gap-2 p-3 border-t border-white/12"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Coach AI…"
              disabled={sending}
              className="flex-1 bg-hp-ink border border-white/12 px-3 py-2 text-sm text-hp-paper placeholder-hp-paper/30 focus:outline-none focus:border-hp-cg disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="px-3 py-2 bg-hp-cg text-hp-paper text-sm font-bold hover:bg-hp-cg/90 transition-colors cursor-pointer disabled:opacity-50"
            >
              →
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-hp-cg text-hp-paper shadow-2xl hover:bg-hp-cg/90 transition-colors cursor-pointer flex items-center justify-center text-2xl"
        title={open ? "Close Coach AI chat" : "Coach AI chat"}
        aria-label={open ? "Close Coach AI chat" : "Open Coach AI chat"}
      >
        {open ? "✕" : "🏏"}
      </button>
    </>
  );
}
