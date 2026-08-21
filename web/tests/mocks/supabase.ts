import { vi } from "vitest";

type TableResponse = { data?: unknown; error?: unknown };

export interface TableBuilder extends PromiseLike<TableResponse> {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
}

export interface StorageBucketMock {
  list: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  download: ReturnType<typeof vi.fn>;
  upload: ReturnType<typeof vi.fn>;
  createSignedUploadUrl: ReturnType<typeof vi.fn>;
  getPublicUrl: ReturnType<typeof vi.fn>;
}

type StorageResponses = Record<string, Partial<Record<keyof StorageBucketMock, unknown>>>;

/**
 * Minimal chainable fake for @supabase/supabase-js's PostgrestQueryBuilder +
 * Storage API. Configure a fixed response per table/bucket; every chain
 * method (select/eq/order/limit/insert/update/upsert/delete) returns the
 * SAME builder instance for a given table (cached, so route tests can assert
 * on e.g. `mock.tables.players.update` having been called with specific
 * args), resolving to that table's { data, error } whether awaited directly
 * or terminated with .single()/.maybeSingle().
 *
 * Every route in this app builds its own Supabase client inline (no shared
 * singleton), so `vi.mock("@supabase/supabase-js", ...)` returning this fake
 * is the one seam that covers all of them — see AGENTS.md's testing
 * conventions. Pair with tests/setup/api.ts for full route-handler tests
 * (also mocks next/headers + @supabase/ssr for getCaller()).
 */
export function createSupabaseMock(
  tableResponses: Record<string, TableResponse> = {},
  storageResponses: StorageResponses = {},
) {
  const tables: Record<string, TableBuilder> = {};
  const buckets: Record<string, StorageBucketMock> = {};

  function builderFor(table: string): TableBuilder {
    if (table in tables) return tables[table];
    const response = tableResponses[table] ?? { data: null, error: null };
    const builder = {
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
      then: ((onFulfilled, onRejected) => Promise.resolve(response).then(onFulfilled, onRejected)) as TableBuilder["then"],
    } as TableBuilder;
    tables[table] = builder;
    return builder;
  }

  function bucketFor(bucket: string): StorageBucketMock {
    if (bucket in buckets) return buckets[bucket];
    const configured = storageResponses[bucket] ?? {};
    const mock: StorageBucketMock = {
      list: vi.fn(async () => configured.list ?? { data: [], error: null }),
      remove: vi.fn(async () => configured.remove ?? { data: null, error: null }),
      download: vi.fn(async () => configured.download ?? { data: null, error: null }),
      upload: vi.fn(async () => configured.upload ?? { data: { path: "mock-path" }, error: null }),
      createSignedUploadUrl: vi.fn(
        async () => configured.createSignedUploadUrl ?? { data: { signedUrl: "https://example.test/signed", token: "mock-token", path: "mock-path" }, error: null },
      ),
      getPublicUrl: vi.fn(() => configured.getPublicUrl ?? { data: { publicUrl: "https://example.test/public/mock-path" } }),
    };
    buckets[bucket] = mock;
    return mock;
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
    storage: {
      from: vi.fn((bucket: string) => bucketFor(bucket)),
      createBucket: vi.fn(async () => ({ data: null, error: null })),
    },
    /** Direct access to per-table/bucket mocks for assertions, e.g. `mock.tables.players.update`. */
    tables,
    buckets,
  };
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>;
