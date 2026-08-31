<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Testing conventions

Vitest (unit + API route tests) + Playwright (E2E) + MSW. No test framework predates this — these conventions are the whole contract.

- `page.tsx` files are async Server Components — Vitest/RTL cannot render them (Next's own docs confirm this). **New page → E2E only**, in `tests/e2e/<area>.spec.ts`. Never add a Vitest test for a `page.tsx`.
- New `app/api/**/route.ts` → `tests/api/<mirrored-path>.test.ts`. Mock `@supabase/ssr`/`@supabase/supabase-js` (via `tests/mocks/supabase.ts`), `@anthropic-ai/sdk`, `nodemailer`. Stripe routes are the one exception — they hit the real Stripe **test-mode** API, not mocked.
- New `components/*Client.tsx` → `tests/components/<Name>.test.tsx` (RTL, jsdom).
- New pure logic in `lib/*.ts` → `tests/unit/lib/<name>.test.ts`.
- New `.from("some_table")` call anywhere → update `tests/seed/schema-notes.md` and `tests/seed/seed.ts` in the same PR. The DB schema lives entirely in the hosted dev Supabase project, not in this repo — `schema-notes.md` is the only source of truth for it here.
- `tests/e2e/*.spec.ts` tag slow/heavy specs (real video/pose processing) with `@slow` — the CI `video-pipeline-e2e` job only runs those, and only when video-pipeline files change (see `.github/workflows/ci.yml`).
