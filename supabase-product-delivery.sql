-- Replaces the UNEXECUTED fixed-fee migration. Run manually first.
-- Existing products remain valid/editable; missing weight blocks ordering.
begin;
alter table public.products add column if not exists weight_kg numeric(12,3);
alter table public.products add column if not exists free_delivery boolean not null default false;
do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.products'::regclass
    and conname = 'products_weight_kg_positive') then
    alter table public.products add constraint products_weight_kg_positive
      check (weight_kg is null or weight_kg between 0.001 and 999999999.999);
  end if;
end;
$$;
-- NULL is deliberately allowed for legacy products, never accepted by checkout.
-- No product columns, rows or RLS policies are otherwise changed.
commit;
