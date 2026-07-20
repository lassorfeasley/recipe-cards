-- Adds the machine-readable recipe to extractions:
--   { ingredients: [{ raw, item, quantity, unit, note, section }],
--     steps: [{ text, section }],
--     prep_minutes, total_minutes, yield }
-- Run in the Supabase SQL editor if you created the tables from schema.sql
-- before this change (schema.sql now includes the column).

alter table extractions add column if not exists recipe_structured jsonb;
