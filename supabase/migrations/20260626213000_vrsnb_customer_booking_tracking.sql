-- VRSNB customer booking: 3% tax, mobile tracking and secure fulfilment updates.

alter table public.public_orders
  add column if not exists subtotal numeric,
  add column if not exists tax_rate numeric,
  add column if not exists tax_amount numeric,
  add column if not exists delivery_slot text;

update public.public_orders
set subtotal = coalesce(subtotal, amount),
    tax_rate = coalesce(tax_rate, 0),
    tax_amount = coalesce(tax_amount, 0)
where subtotal is null or tax_rate is null or tax_amount is null;

alter table public.public_orders
  alter column subtotal set default 0,
  alter column subtotal set not null,
  alter column tax_rate set default 3,
  alter column tax_rate set not null,
  alter column tax_amount set default 0,
  alter column tax_amount set not null;

create index if not exists public_orders_customer_phone_created_idx
  on public.public_orders (customer_phone, created_at desc);

create or replace function public.track_public_orders_by_phone(p_phone text)
returns table (
  id uuid,
  order_number text,
  customer_name text,
  items jsonb,
  subtotal numeric,
  tax_rate numeric,
  tax_amount numeric,
  amount numeric,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := right(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 10);
begin
  if v_phone !~ '^[0-9]{10}$' then
    raise exception 'Enter a valid 10-digit mobile number';
  end if;

  return query
  select
    o.id,
    o.order_number,
    o.customer_name,
    o.items,
    o.subtotal,
    o.tax_rate,
    o.tax_amount,
    o.amount,
    o.status,
    o.created_at,
    o.updated_at,
    o.completed_at,
    o.cancelled_at
  from public.public_orders o
  where right(regexp_replace(o.customer_phone, '[^0-9]', '', 'g'), 10) = v_phone
    and o.status not in ('payment_pending', 'payment_failed')
  order by o.created_at desc
  limit 20;
end;
$$;

revoke all on function public.track_public_orders_by_phone(text) from public;
grant execute on function public.track_public_orders_by_phone(text) to anon, authenticated;

create or replace function public.update_public_order_status_secure(p_order_id uuid, p_status text)
returns public.public_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  updated_order public.public_orders;
  next_status text := lower(trim(coalesce(p_status, '')));
begin
  select * into strict actor
  from public.require_app_staff(array['admin', 'owner']);

  if next_status not in ('paid', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled') then
    raise exception 'Unsupported online order status';
  end if;

  update public.public_orders
  set status = next_status,
      updated_at = now(),
      completed_at = case when next_status = 'completed' then now() else completed_at end,
      cancelled_at = case when next_status = 'cancelled' then now() else cancelled_at end
  where id = p_order_id
    and status not in ('payment_pending', 'payment_failed')
  returning * into updated_order;

  if updated_order.id is null then
    raise exception 'Online order not found or payment is incomplete';
  end if;

  perform public.emit_business_event(
    'VRSNB',
    'info',
    'PUBLIC_ORDER_STATUS_UPDATED',
    'public_order',
    updated_order.id::text,
    null,
    to_jsonb(updated_order),
    null,
    'Online order status changed to ' || next_status,
    updated_order.order_number
  );

  return updated_order;
end;
$$;

revoke all on function public.update_public_order_status_secure(uuid, text) from public;
grant execute on function public.update_public_order_status_secure(uuid, text) to anon, authenticated;
