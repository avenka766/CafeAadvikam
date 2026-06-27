-- Keep the canonical branch catalogue and legacy price table in lock-step,
-- and repair staff password creation/login to use the same hash column.

-- ---------------------------------------------------------------------------
-- Branch item price persistence
-- ---------------------------------------------------------------------------

create or replace function public.sync_branch_item_price_compat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.branch_item_prices (
    branch,
    barcode,
    name,
    price,
    updated_at,
    updated_by
  ) values (
    new.branch,
    new.barcode,
    new.name,
    new.price,
    coalesce(new.updated_at, now()),
    coalesce(new.updated_by, '')
  )
  on conflict (branch, barcode) do update
  set name = excluded.name,
      price = excluded.price,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  return new;
end
$$;

drop trigger if exists sync_branch_item_price_compat_trigger on public.branch_items;
create trigger sync_branch_item_price_compat_trigger
after insert or update of name, price, updated_at, updated_by
on public.branch_items
for each row
execute function public.sync_branch_item_price_compat();

-- branch_items is the source of truth. Repair legacy rows immediately so a
-- refreshed old/rolling-deployment screen cannot restore an earlier price.
insert into public.branch_item_prices (
  branch,
  barcode,
  name,
  price,
  updated_at,
  updated_by
)
select
  branch,
  barcode,
  name,
  price,
  coalesce(updated_at, now()),
  coalesce(updated_by, '')
from public.branch_items
on conflict (branch, barcode) do update
set name = excluded.name,
    price = excluded.price,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

-- ---------------------------------------------------------------------------
-- Staff password creation, update and verification
-- ---------------------------------------------------------------------------

-- Repair users created while add_staff_hashed wrote only to password.
update public.staff_users
set password_hash = password,
    updated_at = now()
where (password_hash is null or btrim(password_hash) = '')
  and password ~ '^\$2[aby]\$';

create or replace function public.add_staff_hashed(
  p_username text,
  p_password text,
  p_display_name text,
  p_role text
)
returns setof public.staff_users
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_row public.staff_users;
begin
  if nullif(btrim(p_username), '') is null then
    raise exception 'Username is required';
  end if;
  if length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if nullif(btrim(p_display_name), '') is null then
    raise exception 'Display name is required';
  end if;

  v_hash := extensions.crypt(p_password, extensions.gen_salt('bf'));

  insert into public.staff_users (
    username,
    password,
    password_hash,
    display_name,
    role,
    is_active
  ) values (
    btrim(p_username),
    v_hash,
    v_hash,
    btrim(p_display_name),
    p_role,
    true
  )
  returning * into v_row;

  return next v_row;
end
$$;

create or replace function public.login_staff_secure(
  p_username text,
  p_password text,
  p_device_info text default null
)
returns table (
  id uuid,
  username text,
  display_name text,
  role text,
  session_token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.staff_users;
  v_hash text;
  v_token text;
  v_exp timestamptz;
begin
  select * into v_user
  from public.staff_users
  where lower(staff_users.username) = lower(btrim(p_username))
    and coalesce(is_active, true)
  for update;

  if v_user.id is null then
    return;
  end if;

  v_hash := coalesce(nullif(v_user.password_hash, ''), nullif(v_user.password, ''));
  if v_hash is null or extensions.crypt(p_password, v_hash) <> v_hash then
    return;
  end if;

  -- Self-heal rows created by the old function.
  if v_user.password_hash is null or btrim(v_user.password_hash) = '' then
    update public.staff_users
    set password_hash = v_hash,
        updated_at = now()
    where staff_users.id = v_user.id;
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_exp := now() + interval '8 hours';

  insert into public.app_staff_sessions (
    staff_id,
    token_hash,
    expires_at,
    device_info,
    ip_address
  ) values (
    v_user.id,
    encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
    v_exp,
    left(p_device_info, 1000),
    null
  );

  return query
  select
    v_user.id,
    v_user.username,
    v_user.display_name,
    v_user.role::text,
    v_token,
    v_exp;
end
$$;

-- Remove the older text overload so PostgREST has one unambiguous password
-- update RPC signature.
drop function if exists public.update_staff_password_hashed(text, text);

create or replace function public.update_staff_password_hashed(
  p_user_id uuid,
  p_new_password text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  if length(p_new_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  v_hash := extensions.crypt(p_new_password, extensions.gen_salt('bf'));

  update public.staff_users
  set password = v_hash,
      password_hash = v_hash,
      updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'Staff user not found';
  end if;

  delete from public.app_staff_sessions
  where staff_id = p_user_id;
end
$$;

create or replace function public.set_staff_credential_secure(
  p_user_id uuid,
  p_new_secret text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  if length(p_new_secret) < 6 then
    raise exception 'Credential must be at least 6 characters';
  end if;

  v_hash := extensions.crypt(p_new_secret, extensions.gen_salt('bf'));

  update public.staff_users
  set password = v_hash,
      password_hash = v_hash,
      updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'Staff user not found';
  end if;
end
$$;

create or replace function public.verify_staff_password(
  p_username text,
  p_password text
)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.staff_users staff
    cross join lateral (
      select coalesce(nullif(staff.password_hash, ''), nullif(staff.password, '')) as hash
    ) resolved
    where lower(staff.username) = lower(btrim(p_username))
      and staff.is_active = true
      and resolved.hash is not null
      and extensions.crypt(p_password, resolved.hash) = resolved.hash
  );
$$;

create or replace function public.verify_staff_password(
  p_user_id uuid,
  p_password text
)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.staff_users staff
    cross join lateral (
      select coalesce(nullif(staff.password_hash, ''), nullif(staff.password, '')) as hash
    ) resolved
    where staff.id = p_user_id
      and staff.is_active = true
      and resolved.hash is not null
      and extensions.crypt(p_password, resolved.hash) = resolved.hash
  );
$$;

grant execute on function public.add_staff_hashed(text, text, text, text) to anon, authenticated;
grant execute on function public.login_staff_secure(text, text, text) to anon, authenticated;
grant execute on function public.update_staff_password_hashed(uuid, text) to anon, authenticated;
grant execute on function public.set_staff_credential_secure(uuid, text) to anon, authenticated;
grant execute on function public.verify_staff_password(text, text) to anon, authenticated;
grant execute on function public.verify_staff_password(uuid, text) to anon, authenticated;
