import type { Player } from "@/lib/types";

const KEY = "pace_player_edits";

type PlayerEdits = Record<string, Partial<Player>>; // playerId → overrides

function read(): PlayerEdits {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as PlayerEdits;
  } catch {
    return {};
  }
}

export function savePlayerEdits(playerId: string, edits: Partial<Player>): void {
  if (typeof window === "undefined") return;
  const all = read();
  all[playerId] = { ...(all[playerId] ?? {}), ...edits };
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function getPlayerEdits(playerId: string): Partial<Player> {
  return read()[playerId] ?? {};
}

export function applyEdits(player: Player): Player {
  const edits = read()[player.id] ?? {};
  return { ...player, ...edits };
}
