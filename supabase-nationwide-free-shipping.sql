-- Apply manually AFTER product delivery, weight shipping and Admin security migrations.
-- Free delivery is authoritative per product, nationwide, independent of weight.
-- No historical orders, product values, policies or grants are rewritten.
begin;
create or replace function public.movio_place_order(p_checkout_token uuid, p_user_id uuid,
  p_customer jsonb, p_items jsonb, p_delivery_cost numeric, p_delivery_type text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  existing public.orders%rowtype;
  product public.products%rowtype;
  entry jsonb;
  payload jsonb;
  order_id uuid;
  receipt text;
  subtotal numeric(12,2) := 0;
  delivery_cost numeric(12,2) := 0;
  total_weight numeric(16,3) := 0;
  chargeable_weight numeric(16,3) := 0;
  free_count integer := 0;
  paid_count integer := 0;
  bracket numeric;
  shipping_rate numeric;
  tariff_version constant text := 'movio-official-weight-v1';
  quantity integer;
  price numeric(12,2);
  snapshots jsonb := '[]'::jsonb;
begin
  if p_checkout_token is null or p_customer is null or p_items is null
    or p_delivery_type is null or p_delivery_type not in ('city','region','branch_pickup','village_highland') then
    raise exception 'INVALID_CHECKOUT';
  end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'INVALID_ITEMS'; end if;
  if jsonb_array_length(p_items) not between 1 and 50 then raise exception 'INVALID_ITEMS'; end if;
  payload := jsonb_build_object('customer', p_customer, 'items', p_items,
    'user_id', p_user_id, 'delivery_type', p_delivery_type);
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
    if not product.free_delivery and (product.weight_kg is null or product.weight_kg < 0.001
      or product.weight_kg > 999999999.999) then raise exception 'PRODUCT_WEIGHT_REQUIRED'; end if;
    if product.free_delivery is null then raise exception 'INVALID_SHIPPING_DATA'; end if;
    -- Expected values are confirmation guards, not authoritative product data.
    if (entry->>'expectedWeightKg')::numeric is distinct from product.weight_kg
      or (entry->>'expectedFreeDelivery') is null
      or (entry->>'expectedFreeDelivery')::boolean <> product.free_delivery then
      raise exception 'SHIPPING_DATA_CHANGED';
    end if;
    -- Sum known weights without NULL propagation; item snapshots retain NULL.
    -- Paid products have already passed the non-NULL weight validation above.
    total_weight := total_weight + coalesce(product.weight_kg, 0) * quantity;
    if product.free_delivery then free_count := free_count + 1;
    else
      paid_count := paid_count + 1;
      chargeable_weight := chargeable_weight + product.weight_kg * quantity;
    end if;
    subtotal := subtotal + price * quantity;
    snapshots := snapshots || jsonb_build_array(jsonb_build_object('id', product.id::text,
      'name', product.name, 'image', product.image, 'price', price, 'quantity', quantity,
      'weight_kg', product.weight_kg, 'free_delivery', product.free_delivery));
  end loop;
  if chargeable_weight > 1000 then raise exception 'DELIVERY_CONFIRMATION_REQUIRED'; end if;
  if paid_count > 0 then
    -- One bracket for the entire chargeable shipment, inclusive upper bounds.
    select t.max_weight, case p_delivery_type
      when 'city' then t.city when 'region' then t.region
      when 'branch_pickup' then t.branch_pickup else t.village_highland end
    into bracket, shipping_rate
    from (values
      (1,6.5,10.5,6,15.5),(5,7.5,12.5,6,17.5),(10,11,16,10,21),
      (15,16,21,15,26),(20,19,26,20,31),(30,30,36,30,45),
      (50,45,65,50,80),(100,65,105,80,120),(150,80,145,110,175),
      (200,100,185,140,215),(250,120,220,170,250),(300,140,260,200,290),
      (500,220,340,280,390),(750,300,450,370,500),(1000,380,700,510,750)
    ) as t(max_weight, city, region, branch_pickup, village_highland)
    where chargeable_weight <= t.max_weight order by t.max_weight limit 1;
    if shipping_rate is null then raise exception 'DELIVERY_CONFIRMATION_REQUIRED'; end if;
    delivery_cost := shipping_rate;
  end if;
  -- Legacy p_delivery_cost is NEVER read. Preserve the actual charged snapshot.
  insert into public.orders (checkout_token, request_payload, user_id, first_name,
    last_name, phone, email, city, address, subtotal, delivery_cost, total, payment_method,
    delivery_type, total_weight_kg, chargeable_weight_kg, tariff_max_weight_kg, shipping_tariff_version)
  values (p_checkout_token, payload, p_user_id, p_customer->>'firstName',
    p_customer->>'lastName', p_customer->>'phone', nullif(p_customer->>'email',''),
    p_customer->>'city', p_customer->>'address', subtotal, delivery_cost,
    subtotal + delivery_cost, 'cash_on_delivery', p_delivery_type, total_weight,
    chargeable_weight, bracket, tariff_version)
  returning id, order_number into order_id, receipt;
  for entry in select value from jsonb_array_elements(snapshots) loop
    quantity := (entry->>'quantity')::integer;
    price := (entry->>'price')::numeric;
    insert into public.order_items (order_id, product_id, product_name, product_image,
      unit_price, quantity, line_total, weight_kg, free_delivery)
    values (order_id, entry->>'id', entry->>'name', entry->>'image', price, quantity, price * quantity,
      (entry->>'weight_kg')::numeric, (entry->>'free_delivery')::boolean);
    update public.products set stock = stock - quantity,
      stock_status = case when stock - quantity <= 0 then 'ამოიწურა' else stock_status end,
      updated_at = now() where id::text = entry->>'id';
  end loop;
  return jsonb_build_object('id', order_id, 'number', receipt, 'subtotal', subtotal,
    'deliveryCost', delivery_cost, 'total', subtotal + delivery_cost,
    'deliveryType', p_delivery_type, 'totalWeightKg', total_weight, 'chargeableWeightKg', chargeable_weight);
end;
$$;
revoke all on function public.movio_place_order(uuid, uuid, jsonb, jsonb, numeric, text) from public, anon, authenticated;
grant execute on function public.movio_place_order(uuid, uuid, jsonb, jsonb, numeric, text) to service_role;
notify pgrst, 'reload schema';
commit;
