alter table public.admin_notifications
add column if not exists recipient_role text not null default 'admin';

create index if not exists idx_admin_notifications_recipient_role_created_at
on public.admin_notifications (recipient_role, created_at desc);

create or replace function public.deduct_materials(p_id uuid, p_qty numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_qty numeric;
begin
  update public.store_raw_stock
  set quantity = quantity - p_qty,
      updated_at = now()
  where id = p_id
  returning quantity into v_new_qty;

  if v_new_qty is null then
    raise exception 'Stock item not found';
  end if;

  return v_new_qty;
end;
$$;
