-- Run once in Supabase SQL Editor. Transaction aborts if these objects already exist.
-- No product/auth policies are changed. Existing product IDs are snapshotted as text.
begin;
create sequence public.movio_order_number_seq start 100000;
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('MOVIO-' || nextval('public.movio_order_number_seq')::text),
  user_id uuid references auth.users(id) on delete set null,
  checkout_token uuid not null unique,
  request_payload jsonb not null,
  first_name text not null check (length(first_name) between 1 and 80),
  last_name text not null check (length(last_name) between 1 and 80),
  phone text not null check (length(phone) between 7 and 30),
  email text check (length(email) <= 254),
  city text not null check (length(city) between 1 and 100),
  address text not null check (length(address) between 1 and 500),
  delivery_information text not null default '',
  subtotal numeric(12,2) not null check (subtotal >= 0),
  delivery_cost numeric(12,2) not null check (delivery_cost >= 0),
  total numeric(12,2) not null check (total = subtotal + delivery_cost),
  payment_method text not null check (payment_method = 'cash_on_delivery'),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','cancelled','refunded')),
  order_status text not null default 'received' check (order_status in ('received','preparing','shipped','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null,
  product_name text not null,
  product_image text,
  unit_price numeric(12,2) not null check (unit_price > 0),
  quantity integer not null check (quantity between 1 and 100),
  line_total numeric(12,2) not null check (line_total = unit_price * quantity),
  unique (order_id, product_id)
);
create index orders_user_created_idx on public.orders(user_id, created_at desc);
create index order_items_order_idx on public.order_items(order_id);
create function public.movio_orders_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger orders_updated_at before update on public.orders
for each row execute function public.movio_orders_updated_at();

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
revoke all on public.orders, public.order_items from public, anon, authenticated;
revoke all on sequence public.movio_order_number_seq from public, anon, authenticated;
-- Never expose checkout capability or request payload through customer SELECT.
grant select (id, order_number, user_id, first_name, last_name, phone, email, city,
  address, delivery_information, subtotal, delivery_cost, total, payment_method,
  payment_status, order_status, created_at, updated_at) on public.orders to authenticated;
grant select on public.order_items to authenticated;
grant all on public.orders, public.order_items to service_role;
grant usage, select on sequence public.movio_order_number_seq to service_role;
create policy orders_read_own on public.orders for select to authenticated
using (user_id = (select auth.uid()));
create policy order_items_read_own on public.order_items for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));

-- Server-only RPC: NEVER grant execution to anon/authenticated.
-- Vercel verifies Auth and anti-bot token before supplying p_user_id.
-- One database transaction covers items, totals, and stock; failures roll back all.
create function public.movio_place_order(p_checkout_token uuid, p_user_id uuid,
  p_customer jsonb, p_items jsonb, p_delivery_cost numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  existing public.orders%rowtype;
  product public.products%rowtype;
  entry jsonb;
  payload jsonb;
  order_id uuid;
  receipt text;
  subtotal numeric(12,2) := 0;
  quantity integer;
  price numeric(12,2);
  snapshots jsonb := '[]'::jsonb;
begin
  if p_checkout_token is null or p_customer is null or p_items is null
    or p_delivery_cost is null or p_delivery_cost < 0 or p_delivery_cost > 10000
    or p_delivery_cost <> round(p_delivery_cost, 2) then
    raise exception 'INVALID_CHECKOUT';
  end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'INVALID_ITEMS'; end if;
  if jsonb_array_length(p_items) not between 1 and 50 then raise exception 'INVALID_ITEMS'; end if;
  payload := jsonb_build_object('customer', p_customer, 'items', p_items,
    'user_id', p_user_id, 'delivery_cost', p_delivery_cost);
  -- Serializes retries of the same capability, including concurrent requests.
  perform pg_advisory_xact_lock(hashtextextended(p_checkout_token::text, 0));
  select * into existing from public.orders where checkout_token = p_checkout_token;
  if found then
    if existing.request_payload <> payload then raise exception 'CHECKOUT_CONFLICT'; end if;
    return jsonb_build_object('id', existing.id, 'number', existing.order_number,
      'subtotal', existing.subtotal, 'deliveryCost', existing.delivery_cost, 'total', existing.total);
  end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(p_items) x)
    <> jsonb_array_length(p_items) then raise exception 'INVALID_ITEMS'; end if;
  -- Stable lock ordering prevents two multi-product orders deadlocking.
  for entry in select value from jsonb_array_elements(p_items) order by value->>'id' loop
    if jsonb_typeof(entry->'quantity') <> 'number'
      or (entry->>'quantity') !~ '^[0-9]{1,3}$' then raise exception 'INVALID_ITEMS'; end if;
    quantity := (entry->>'quantity')::integer;
    if quantity not between 1 and 100 then raise exception 'INVALID_ITEMS'; end if;
    select * into product from public.products where id::text = entry->>'id' for update;
    if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    if product.active is false or product.stock_status = 'ამოიწურა'
      or product.stock is null or product.stock < quantity then raise exception 'STOCK_UNAVAILABLE'; end if;
    price := round(product.price::numeric, 2);
    if price is null or price <= 0 then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    -- Expected price is only a confirmation guard. Actual price comes from products.
    if (entry->>'expectedPrice') is null or (entry->>'expectedPrice')::numeric <> price then
      raise exception 'PRICE_CHANGED';
    end if;
    subtotal := subtotal + price * quantity;
    snapshots := snapshots || jsonb_build_array(jsonb_build_object('id', product.id::text,
      'name', product.name, 'image', product.image, 'price', price, 'quantity', quantity));
  end loop;
  insert into public.orders (checkout_token, request_payload, user_id, first_name,
    last_name, phone, email, city, address, subtotal, delivery_cost, total, payment_method)
  values (p_checkout_token, payload, p_user_id, p_customer->>'firstName',
    p_customer->>'lastName', p_customer->>'phone', nullif(p_customer->>'email',''),
    p_customer->>'city', p_customer->>'address', subtotal, p_delivery_cost,
    subtotal + p_delivery_cost, 'cash_on_delivery')
  returning id, order_number into order_id, receipt;
  for entry in select value from jsonb_array_elements(snapshots) loop
    quantity := (entry->>'quantity')::integer;
    price := (entry->>'price')::numeric;
    insert into public.order_items (order_id, product_id, product_name, product_image,
      unit_price, quantity, line_total)
    values (order_id, entry->>'id', entry->>'name', entry->>'image', price, quantity, price * quantity);
    update public.products set stock = stock - quantity,
      stock_status = case when stock - quantity <= 0 then 'ამოიწურა' else stock_status end,
      updated_at = now() where id::text = entry->>'id';
  end loop;
  return jsonb_build_object('id', order_id, 'number', receipt, 'subtotal', subtotal,
    'deliveryCost', p_delivery_cost, 'total', subtotal + p_delivery_cost);
end;
$$;
revoke all on function public.movio_place_order(uuid, uuid, jsonb, jsonb, numeric) from public, anon, authenticated;
grant execute on function public.movio_place_order(uuid, uuid, jsonb, jsonb, numeric) to service_role;
revoke all on function public.movio_orders_updated_at() from public, anon, authenticated;
commit;
