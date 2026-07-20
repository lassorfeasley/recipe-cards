-- Adds collections (whose physical recipe box a card came from) and
-- cards.collection_id. Run in the Supabase SQL editor if you already created
-- the tables from schema.sql before this change (schema.sql now includes them).
--
-- The two collection IDs are fixed and must match ADELINE_COLLECTION_ID /
-- PHOBE_COLLECTION_ID in src/lib/db.ts, since the sync upserts by id.

create table if not exists collections (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

insert into collections (id, name) values
  ('b541028d-98ff-40d1-9e06-64b673ab9742', 'Adeline Feasley'),
  ('43c11c93-4a1b-4423-993b-621ad8630527', 'Phobe Butler')
on conflict (id) do nothing;

alter table cards add column if not exists collection_id uuid references collections(id);

-- Backfill: everything digitized before collections existed came from
-- Adeline Feasley's box.
update cards set collection_id = 'b541028d-98ff-40d1-9e06-64b673ab9742'
where collection_id is null;

alter table collections enable row level security;

-- Collection names are public metadata ("from the box of ___").
create policy "anon reads collections"
  on collections for select
  to anon
  using (true);
