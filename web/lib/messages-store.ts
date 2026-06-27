import type { Message } from "@/lib/types";

const KEY = "pace_messages";

function read(): Message[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Message[];
  } catch {
    return [];
  }
}

export function getMessagesForPlayer(playerId: string): Message[] {
  return read()
    .filter((m) => m.playerId === playerId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function saveMessage(msg: Omit<Message, "id">): Message {
  const all = read();
  const newMsg: Message = { ...msg, id: `msg_${Date.now()}` };
  all.unshift(newMsg);
  localStorage.setItem(KEY, JSON.stringify(all));
  return newMsg;
}
