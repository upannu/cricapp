import type { Session } from './types';

const KEY = 'pace_sessions';

export function getStoredSessions(): Session[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session[]) : [];
  } catch {
    return [];
  }
}

export function addStoredSession(session: Session): void {
  if (typeof window === 'undefined') return;
  const existing = getStoredSessions();
  // Replace if id already exists, otherwise prepend
  const idx = existing.findIndex((s) => s.id === session.id);
  if (idx >= 0) {
    existing[idx] = session;
  } else {
    existing.unshift(session);
  }
  localStorage.setItem(KEY, JSON.stringify(existing));
}
