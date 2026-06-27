const KEY = "pace_pack_credits";

type CreditMap = Record<string, number>; // packId → extra credits added via UI

function read(): CreditMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as CreditMap;
  } catch {
    return {};
  }
}

export function getExtraCredits(packId: string): number {
  return read()[packId] ?? 0;
}

export function addCredit(packId: string): void {
  if (typeof window === "undefined") return;
  const map = read();
  map[packId] = (map[packId] ?? 0) + 1;
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function getAllExtraCredits(): CreditMap {
  return read();
}
