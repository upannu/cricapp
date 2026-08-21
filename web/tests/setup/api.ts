import { vi, beforeEach } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "../mocks/supabase";

/**
 * Shared mutable state for every tests/api/**.test.ts route-handler test.
 * Configure `cookieUser` to control what getCaller() resolves to, and
 * `tableResponses`/`storageResponses` to control what the service-role
 * client returns per table/bucket — see tests/mocks/supabase.ts. After the
 * route handler runs, `lastServiceClient` is the mock it built, so tests can
 * assert on e.g. `lastServiceClient.tables.sessions.delete` call args.
 * Reset before every test so cases don't leak into each other.
 */
const routeMockState = vi.hoisted(() => ({
  cookieUser: null as null | { id: string; user_metadata: Record<string, unknown> },
  tableResponses: {} as Record<string, { data?: unknown; error?: unknown }>,
  storageResponses: {} as Record<string, Record<string, unknown>>,
  lastServiceClient: null as SupabaseMock | null,
}));
export { routeMockState };

// getCaller() (lib/server-auth.ts) reads the session via next/headers' cookies()
// and @supabase/ssr's createServerClient(...).auth.getUser() — mock both so
// routeMockState.cookieUser controls "who is signed in" for every route test.
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: routeMockState.cookieUser }, error: null })) },
  })),
  createBrowserClient: vi.fn(),
}));

// Every route builds its own service-role client via createClient(...) — mock
// it to return our chainable fake, configured per-test via tableResponses/storageResponses.
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => {
    const client = createSupabaseMock(routeMockState.tableResponses, routeMockState.storageResponses);
    routeMockState.lastServiceClient = client;
    return client;
  }),
}));

// Routes gate on these env vars directly (e.g. `if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return 500`)
// before ever touching the mocked Supabase/Anthropic clients — Vitest doesn't
// auto-load .env.local the way `next dev` does, so set well-formed defaults
// here. A test exercising the "missing config" branch itself should use
// vi.stubEnv(name, "") + vi.unstubAllEnvs() in its own afterEach.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";
process.env.ANTHROPIC_API_KEY ||= "test-anthropic-key";
process.env.GMAIL_USER ||= "test@example.com";
process.env.GMAIL_APP_PASSWORD ||= "test-app-password";

beforeEach(() => {
  routeMockState.cookieUser = null;
  routeMockState.tableResponses = {};
  routeMockState.storageResponses = {};
  routeMockState.lastServiceClient = null;
});
