const KEY = "pace_agreed_days";

type DaysMap = Record<string, string[]>; // packId → ["Mon","Wed",...]

function read(): DaysMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as DaysMap;
  } catch {
    return {};
  }
}

export function getAgreedDays(packId: string): string[] {
  return read()[packId] ?? [];
}

export function setAgreedDays(packId: string, days: string[]): void {
  if (typeof window === "undefined") return;
  const map = read();
  map[packId] = days;
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function getAllAgreedDays(): DaysMap {
  return read();
}
