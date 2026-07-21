-- Fix a typo in the collection name: "Phebe Butler" -> "Phoebe Butler".
-- Collections are referenced everywhere by id, so only the display name
-- changes. Safe to run in the Supabase SQL editor (or via
-- scripts/rename-phoebe-collection.mjs, which also updates the local SQLite db).

update collections
  set name = 'Phoebe Butler'
  where id = '43c11c93-4a1b-4423-993b-621ad8630527';
