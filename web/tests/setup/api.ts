import { vi, beforeEach } from "vitest";
import { config } from "dotenv";
import path from "node:path";
import { createSupabaseMock, type SupabaseMock } from "../mocks/supabase";

// Loads real values (e.g. a Stripe test-mode secret key) for local runs where
// they exist — CI supplies its own via the workflow's `env:` block, and
// dotenv never overrides an already-set var, so this is a no-op there.
config({ path: path.resolve(__dirname, "../../.env.local") });

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
  authAdminResponses: {} as Record<string, unknown>,
  authResponses: {} as Record<string, unknown>,
  lastServiceClient: null as SupabaseMock | null,
  /** Every client createClient() has produced this test, in call order — some
   * routes build more than one (e.g. a service client + a separate anon
   * client for signInWithPassword), so `lastServiceClient` alone isn't
   * always the one a test needs to assert against. */
  allServiceClients: [] as SupabaseMock[],
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
    const client = createSupabaseMock(
      routeMockState.tableResponses,
      routeMockState.storageResponses,
      routeMockState.authAdminResponses,
      routeMockState.authResponses,
    );
    routeMockState.lastServiceClient = client;
    routeMockState.allServiceClients.push(client);
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
process.env.GOOGLE_MAPS_API_KEY ||= "test-maps-key";
process.env.CLICKSEND_USERNAME ||= "test-clicksend-user";
process.env.CLICKSEND_API_KEY ||= "test-clicksend-key";
process.env.CRON_SECRET ||= "test-cron-secret";
process.env.PLATFORM_ADMIN_EMAIL ||= "test-admin@example.com";

// MSW is deliberately NOT wired up globally here: starting its Node interceptor
// for the whole "api" project caused the Stripe SDK's real HTTP calls to hang
// (a real, reproduced conflict between msw/node's request interception and
// Stripe's Node client, not just a config mistake). Routes that need MSW
// (geocode, send-sms — see tests/mocks/msw-handlers.ts) start/stop their own
// scoped server instance in their own test file instead.

beforeEach(() => {
  routeMockState.cookieUser = null;
  routeMockState.tableResponses = {};
  routeMockState.storageResponses = {};
  routeMockState.authAdminResponses = {};
  routeMockState.authResponses = {};
  routeMockState.lastServiceClient = null;
  routeMockState.allServiceClients = [];
});
