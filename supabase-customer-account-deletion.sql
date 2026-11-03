-- NEW migration only. Apply manually to the existing project after orders/admin security.
-- Does not delete accounts or change the admin allowlist when installed.
begin;
create or replace function movio_private.customer_deletion_retention_ready()
returns boolean language sql stable security definer set search_path = '' as $$
  select count(*) = 1 and coalesce(bool_and(c.confdeltype = 'n'), false)
  from pg_catalog.pg_constraint c
  where c.contype = 'f' and c.conrelid = 'public.orders'::regclass
    and c.confrelid = 'auth.users'::regclass
    and c.conkey = array[(select a.attnum from pg_catalog.pg_attribute a where a.attrelid = 'public.orders'::regclass and a.attname = 'user_id')]
    and c.confkey = array[(select a.attnum from pg_catalog.pg_attribute a where a.attrelid = 'auth.users'::regclass and a.attname = 'id')];
$$;
revoke all on function movio_private.customer_deletion_retention_ready() from public, anon, authenticated;

create or replace function movio_private.guard_customer_account_deletion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- The parent row lock serializes deletion against new FK-linked orders/admin grants.
  perform 1 from auth.users where id = old.id for update;
  if exists (select 1 from movio_private.admin_users where user_id = old.id) then
    raise exception 'ADMIN_ACCOUNT_PROTECTED' using errcode = '42501';
  end if;
  if not movio_private.customer_deletion_retention_ready() then
    raise exception 'ACCOUNT_DELETION_RETENTION_NOT_READY';
  end if;
  -- Keep necessary order fields/items/statuses; remove duplicated PII and identity in retry snapshots.
  update public.orders set request_payload = '{"account_deleted":true}'::jsonb where user_id = old.id;
  -- Existing ON DELETE SET NULL detaches orders. No order, item, payment or stock is deleted/changed.
  return old;
end;
$$;
revoke all on function movio_private.guard_customer_account_deletion() from public, anon, authenticated;
drop trigger if exists movio_guard_customer_account_deletion on auth.users;
create trigger movio_guard_customer_account_deletion before delete on auth.users
  for each row execute function movio_private.guard_customer_account_deletion();

create or replace function public.movio_customer_deletion_check()
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from auth.users where id = auth.uid()) then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if exists (select 1 from movio_private.admin_users where user_id = auth.uid()) then return false; end if;
  if not movio_private.customer_deletion_retention_ready() or not exists (
    select 1 from pg_catalog.pg_trigger where tgrelid = 'auth.users'::regclass
      and tgname = 'movio_guard_customer_account_deletion' and tgenabled in ('O','A')
      and tgfoid = 'movio_private.guard_customer_account_deletion()'::regprocedure
  ) then raise exception 'ACCOUNT_DELETION_NOT_READY'; end if;
  return true;
end;
$$;
revoke all on function public.movio_customer_deletion_check() from public, anon;
grant execute on function public.movio_customer_deletion_check() to authenticated;
notify pgrst, 'reload schema';
commit;
