-- Adds ingredient tags and the cleaned-up markdown recipe to extractions.
-- Run in the Supabase SQL editor if you already created the tables from
-- schema.sql before this change (schema.sql now includes these columns).

alter table extractions add column if not exists ingredients text[];
alter table extractions add column if not exists recipe_markdown text;

create index if not exists extractions_ingredients
  on extractions using gin (ingredients);
