-- Recipe Card Archive — Supabase schema
-- Run in the Supabase SQL editor (or `supabase db push`).
--
-- Storage model: original scans stay LOCAL (the admin tool works on your
-- machine); only the cropped card pairs are uploaded, to the public `cards`
-- bucket as cards/{card_id}/front.jpg and cards/{card_id}/back.jpg.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- A physical recipe-box a card came from, named for its original owner.
create table collections (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- Light provenance for each scanned folder (no scan files are stored).
create table batches (
  id            uuid primary key default gen_random_uuid(),
  batch_number  int not null unique,
  dpi           int,
  status        text not null default 'uploaded'
    check (status in ('uploaded', 'fronts_cropped', 'backs_aligned', 'complete')),
  created_at    timestamptz not null default now()
);

-- One row per physical card.
create table cards (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid references batches(id) on delete cascade,
  position        int not null,
  slug            text unique,
  front_crop      jsonb,            -- { x, y, w, h, rotation } in source-scan pixels
  back_crop       jsonb,
  front_rotate180 boolean not null default false,
  back_rotate180  boolean not null default false,
  front_image     text,             -- object key within the 'cards' bucket, e.g. "{id}/front.jpg"
  back_image      text,
  status          text not null default 'cropped'
    check (status in ('cropped', 'extracted', 'reviewed', 'published')),
  collection_id   uuid references collections(id),
  created_at      timestamptz not null default now(),
  unique (batch_id, position)
);

-- AI extraction results, kept separate so re-runs don't clobber human edits.
create table extractions (
  id                  uuid primary key default gen_random_uuid(),
  card_id             uuid not null references cards(id) on delete cascade,
  title               text,
  category            text
    check (category is null or category in
      ('dessert','bread','main','side','salad','beverage','snack','preserves','sauce','other')),
  writing_medium      text
    check (writing_medium is null or writing_medium in
      ('cursive','print-handwriting','typewriter','mixed','pre-printed')),
  ink_colors          text[],
  card_design         text,
  attribution         text,
  back_relationship   text
    check (back_relationship is null or back_relationship in
      ('continuation','separate-recipe','blank','notes')),
  transcription_front text,
  transcription_back  text,
  ingredients         text[],  -- lowercase ingredient tags, e.g. {'flour','raisin'}
  recipe_markdown     text,    -- plain-language rewrite of the recipe, as markdown
  recipe_structured   jsonb,   -- { ingredients: [{raw,item,quantity,unit,note,section}], steps: [{text,section}], prep_minutes, total_minutes, yield }
  ai_notes            text,
  confidence          text
    check (confidence is null or confidence in ('high','medium','low')),
  model               text,
  raw_response        jsonb,
  reviewed            boolean not null default false,
  created_at          timestamptz not null default now()
);

-- Full-text search over title + transcriptions for the public gallery.
alter table extractions add column fts tsvector
  generated always as (
    to_tsvector('english',
      coalesce(title, '') || ' ' ||
      coalesce(transcription_front, '') || ' ' ||
      coalesce(transcription_back, ''))
  ) stored;
create index extractions_fts on extractions using gin (fts);
-- Fast "recipes containing X" filters for the public gallery.
create index extractions_ingredients on extractions using gin (ingredients);
create index extractions_card_id on extractions (card_id, created_at desc);
create index cards_status on cards (status);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Writes come from the admin tool using the service_role key (bypasses RLS).
-- The anon key can only read published cards and their reviewed extractions.

alter table batches     enable row level security;
alter table cards       enable row level security;
alter table extractions enable row level security;
alter table collections enable row level security;

-- Collection names are public metadata ("from the box of ___").
create policy "anon reads collections"
  on collections for select
  to anon
  using (true);

create policy "anon reads published cards"
  on cards for select
  to anon
  using (status = 'published');

create policy "anon reads reviewed extractions of published cards"
  on extractions for select
  to anon
  using (
    reviewed
    and exists (
      select 1 from cards c
      where c.id = extractions.card_id and c.status = 'published'
    )
  );

-- No anon policy on batches: they are admin-side metadata only.

-- ---------------------------------------------------------------------------
-- Storage: public bucket for cropped card pairs (no scans bucket)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('cards', 'cards', true)
on conflict (id) do nothing;

-- Public bucket already allows anonymous reads of objects via the public URL;
-- this policy additionally allows listing/reading through the API.
create policy "public read card images"
  on storage.objects for select
  to anon
  using (bucket_id = 'cards');

-- Uploads/updates/deletes are done with the service_role key (bypasses RLS),
-- so no write policies are needed for anon or authenticated.
