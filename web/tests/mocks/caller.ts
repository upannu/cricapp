/** Shape getCaller() (lib/server-auth.ts) reads off a Supabase Auth user — assign to routeMockState.cookieUser. */
export function rawUser(
  metadata: { role: string; academy_id?: string; coach_id?: string; player_id?: string },
  id = "test-user-id",
) {
  return { id, user_metadata: metadata };
}

export function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
