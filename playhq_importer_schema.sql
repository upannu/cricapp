begin;

-- ============================================================================
-- PlayHQ importer Phase 1 schema additions.
-- Run on dev first (diomvkqovkjipxyuzgoz), verify, then run the same on prod
-- (itpdrqrawtdnllwbvijl) once the importer code is ready to ship there too.
-- ============================================================================

-- Which PlayHQ organisation (club) each academy pulls games from. The actual
-- PlayHQ API key/tenant lives in env vars (PLAYHQ_API_KEY/PLAYHQ_TENANT),
-- shared across the whole platform — these columns are just an id, not a
-- secret, same treatment as academies.stripe_customer_id.
alter table public.academies add column if not exists playhq_org_id text;
alter table public.academies add column if not exists playhq_org_name text;
alter table public.academies add column if not exists playhq_connected_at timestamptz;

-- Dedup key so re-importing the same PlayHQ game is a safe no-op.
alter table public.matches add column if not exists playhq_game_id text;
create unique index if not exists matches_playhq_game_id_key
  on public.matches (playhq_game_id) where playhq_game_id is not null;

-- Lets upsertImportedMatchStats-style writes target (match_id, player_id) directly instead of
-- select-then-insert/update.
alter table public.imported_match_stats
  add constraint imported_match_stats_match_player_key unique (match_id, player_id);

commit;
