-- Apply manually AFTER supabase-admin-security.sql and weight shipping migrations.
-- No existing orders/products are deleted or rewritten. Customer RLS stays unchanged.
begin;
alter table public.orders add column if not exists stock_restored_at timestamptz;

create or replace function public.movio_admin_orders(p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.movio_is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_offset is null or p_offset < 0 then raise exception 'INVALID_OFFSET'; end if;
  select coalesce(jsonb_agg(row_data order by created_at desc, id desc), '[]'::jsonb) into result
  from (
    select o.created_at, o.id, jsonb_build_object(
      'id',o.id,'number',o.order_number,'createdAt',o.created_at,
      'name',o.first_name || ' ' || o.last_name,'phone',o.phone,'email',o.email,
      'city',o.city,'address',o.address,'deliveryInformation',o.delivery_information,
      'deliveryType',o.delivery_type,'subtotal',o.subtotal,'deliveryCost',o.delivery_cost,
      'total',o.total,'paymentMethod',o.payment_method,'paymentStatus',o.payment_status,
      'status',o.order_status,'items',coalesce((select jsonb_agg(jsonb_build_object(
        'id',i.product_id,'name',i.product_name,'price',i.unit_price,
        'quantity',i.quantity,'lineTotal',i.line_total) order by i.product_id)
        from public.order_items i where i.order_id=o.id),'[]'::jsonb)) as row_data
    from public.orders o order by o.created_at desc,o.id desc limit 100 offset p_offset
  ) page;
  return result;
end;
$$;

create or replace function public.movio_admin_order_status(p_order_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_order public.orders%rowtype; item record;
begin
  -- Authorization is checked inside PostgreSQL on every invocation, never from metadata.
  if not public.movio_is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('received','preparing','shipped','completed','cancelled') then
    raise exception 'INVALID_STATUS';
  end if;
  select * into current_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if current_order.order_status=p_status then
    return jsonb_build_object('id',p_order_id,'status',p_status);
  end if;
  -- Terminal orders cannot be reopened or cancelled after completion.
  if current_order.order_status in ('cancelled','completed') then raise exception 'ORDER_TERMINAL'; end if;
  if p_status='cancelled' and current_order.stock_restored_at is null then
    -- Legacy cancelled orders are never restored automatically. Stable product lock order.
    for item in select product_id,quantity from public.order_items where order_id=p_order_id order by product_id loop
      -- Restore quantity only; preserve the Admin-configured availability status.
      update public.products set stock=stock+item.quantity,
        updated_at=now() where id::text=item.product_id and stock is not null;
      -- A deleted product cannot be safely recreated; abort the entire cancellation.
      if not found then raise exception 'RESTOCK_PRODUCT_UNAVAILABLE'; end if;
    end loop;
    update public.orders set stock_restored_at=now() where id=p_order_id;
  end if;
  update public.orders set order_status=p_status where id=p_order_id;
  -- Payment status belongs to payment processing and is deliberately preserved.
  return jsonb_build_object('id',p_order_id,'status',p_status);
end;
$$;
revoke all on function public.movio_admin_orders(integer) from public, anon, authenticated;
revoke all on function public.movio_admin_order_status(uuid,text) from public, anon, authenticated;
grant execute on function public.movio_admin_orders(integer) to authenticated;
grant execute on function public.movio_admin_order_status(uuid,text) to authenticated;
notify pgrst, 'reload schema';
commit;
