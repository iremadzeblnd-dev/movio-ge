-- Run manually after the product and weight-shipping migrations.
-- No account is automatically an Admin. Bootstrap instructions are in PRELAUNCH.md.
begin;
create schema if not exists movio_private;
revoke all on schema movio_private from public, anon, authenticated;
create table if not exists movio_private.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table movio_private.admin_users enable row level security;
revoke all on table movio_private.admin_users from public, anon, authenticated;

create or replace function public.movio_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from movio_private.admin_users a where a.user_id = auth.uid()
  );
$$;
revoke all on function public.movio_is_admin() from public, anon, authenticated;
grant execute on function public.movio_is_admin() to authenticated, service_role;

alter table public.products enable row level security;
-- Permissive policies combine with OR. Remove ALL/write policies instead of
-- merely adding an Admin policy alongside an existing customer write policy.
-- Preserve the read portion of any ALL policy as SELECT with the same predicate,
-- roles and permissive/restrictive mode; existing SELECT policies are untouched.
do $$
declare p record; role_list text; role_oid oid;
begin
  for p in select * from pg_catalog.pg_policy
    where polrelid = 'public.products'::regclass and polcmd in ('*','a','w','d')
  loop
    if p.polcmd = '*' then
      role_list := '';
      foreach role_oid in array p.polroles loop
        role_list := role_list || case when role_list = '' then '' else ', ' end ||
          case when role_oid = 0 then 'public' else pg_catalog.quote_ident(pg_catalog.pg_get_userbyid(role_oid)) end;
      end loop;
      execute pg_catalog.format('drop policy if exists %I on public.products', 'movio_read_' || p.oid);
      execute pg_catalog.format('create policy %I on public.products as %s for select to %s using (%s)',
        'movio_read_' || p.oid, case when p.polpermissive then 'permissive' else 'restrictive' end,
        role_list, coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), 'true'));
    end if;
    execute pg_catalog.format('drop policy %I on public.products', p.polname);
  end loop;
end;
$$;
revoke insert, update, delete, truncate, references, trigger on public.products from public, anon, authenticated;
grant select, insert, update, delete on public.products to authenticated;
-- Admin must be able to list inactive products as well.
drop policy if exists movio_admin_product_read on public.products;
create policy movio_admin_product_read on public.products for select to authenticated
  using ((select public.movio_is_admin()));
create policy movio_admin_product_insert on public.products for insert to authenticated
  with check ((select public.movio_is_admin()));
create policy movio_admin_product_update on public.products for update to authenticated
  using ((select public.movio_is_admin())) with check ((select public.movio_is_admin()));
create policy movio_admin_product_delete on public.products for delete to authenticated
  using ((select public.movio_is_admin()));
-- Orders retain customer-only reads and server-only mutations; no Admin order
-- management is exposed here. Future management must check this same allowlist.
notify pgrst, 'reload schema';
commit;
