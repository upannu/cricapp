/** Shape getCaller() (lib/server-auth.ts) reads off a Supabase Auth user — assign to routeMockState.cookieUser.
 * getCaller() reads role/scoping off app_metadata (server-only), not user_metadata (client-writable) —
 * see docs/reverse-engineered/domains/academy_admin.md section 0 for the migration this mirrors. */
export function rawUser(
  metadata: { role: string; academy_id?: string; coach_id?: string; player_id?: string },
  id = "test-user-id",
) {
  return { id, app_metadata: metadata };
}

export function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
