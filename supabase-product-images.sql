-- Manual migration only. Uses the existing inline image storage and Admin RLS.
-- Apply to a test database first; no products are deleted or recreated.
begin;
alter table public.products add column if not exists images text[];
-- NULL means legacy single-image product. An empty array means intentionally no images.
-- No backfill or updates to existing product rows are necessary.
notify pgrst, 'reload schema';
commit;
