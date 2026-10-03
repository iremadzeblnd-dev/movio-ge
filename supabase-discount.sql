alter table public.products
  add column if not exists discount_visible boolean not null default false,
  add column if not exists discount_percent numeric not null default 0
    check (discount_percent >= 0 and discount_percent <= 100);
