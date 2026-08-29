import type { NextConfig } from "next";

// Auth pages must never be cached long-term by the CDN in front of production (Hostinger) — a
// stale cached copy can outlive the JS chunk hashes it references once a new deploy ships new
// chunks, breaking the page entirely until the cache expires or is manually purged (happened
// 2026-08-28: /login and /signup were stuck serving a year-cached HTML pointing at a chunk that
// no longer existed on the server). Explicit no-store here overrides whatever default caching
// policy the host would otherwise apply to these routes.
const NO_CACHE_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password"];

const nextConfig: NextConfig = {
  async headers() {
    return NO_CACHE_PATHS.map((source) => ({
      source,
      headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
    }));
  },
};

export default nextConfig;
