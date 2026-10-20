begin;

-- ============================================================================
-- Admin roadmap tracker + player/coach/academy profile photos.
-- Run on dev first (diomvkqovkjipxyuzgoz), verify, then run the same on prod
-- (itpdrqrawtdnllwbvijl) once ready to ship there too.
-- ============================================================================

-- ─── Roadmap tracker (platform_admin only) ─────────────────────────────────
create table if not exists public.platform_roadmap_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  status text not null default 'Planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_roadmap_items enable row level security;

create policy platform_roadmap_items_select_admin on public.platform_roadmap_items
  for select using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin');

-- No insert/update/delete policy — written only by the service-role route
-- (app/api/admin/roadmap/route.ts), same treatment as platform_revenue_events.

-- Seed one real item now that the photo feature below ships in this same PR.
insert into public.platform_roadmap_items (title, description, status)
values (
  'Profile photos for players, coaches, and academies',
  'Upload and display a photo on a player/coach profile and a logo on an academy profile.',
  'Completed'
);

-- ─── Profile photos ─────────────────────────────────────────────────────────
alter table public.players add column if not exists photo_url text;
alter table public.coaches add column if not exists photo_url text;
alter table public.academies add column if not exists logo_url text;

commit;
