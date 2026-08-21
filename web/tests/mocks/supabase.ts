import { vi } from "vitest";

type TableResponse = { data?: unknown; error?: unknown };

/**
 * Minimal chainable fake for @supabase/supabase-js's PostgrestQueryBuilder.
 * Configure a fixed response per table; every chain method (select/eq/order/
 * limit/insert/update/upsert/delete) returns the same thenable builder,
 * which resolves to that table's { data, error } whether the caller awaits
 * it directly or terminates the chain with .single()/.maybeSingle().
 *
 * Every route in this app builds its own Supabase client inline (no shared
 * singleton), so `vi.mock("@supabase/supabase-js", ...)` /
 * `vi.mock("@supabase/ssr", ...)` returning this fake is the one seam that
 * covers all of them — see AGENTS.md's testing conventions.
 */
export function createSupabaseMock(responses: Record<string, TableResponse> = {}) {
  function builderFor(table: string) {
    const response = responses[table] ?? { data: null, error: null };
    const builder: PromiseLike<TableResponse> & Record<string, ReturnType<typeof vi.fn>> = {
      select: vi.fn(() => builder),
      insert: vi.fn(() => builder),
      update: vi.fn(() => builder),
      upsert: vi.fn(() => builder),
      delete: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      neq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve(response)),
      maybeSingle: vi.fn(() => Promise.resolve(response)),
      then: ((onFulfilled, onRejected) => Promise.resolve(response).then(onFulfilled, onRejected)) as PromiseLike<TableResponse>["then"],
    } as unknown as PromiseLike<TableResponse> & Record<string, ReturnType<typeof vi.fn>>;
    return builder;
  }

  return {
    from: vi.fn((table: string) => builderFor(table)),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      admin: {
        createUser: vi.fn(),
        listUsers: vi.fn(),
        updateUserById: vi.fn(),
      },
    },
  };
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>;
