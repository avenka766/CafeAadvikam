-- Keep Cake Master dispatch status authoritative for branch advance orders.
-- Older Packing browser state must never downgrade an order after dispatch.

create or replace function public.protect_dispatched_advance_order_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.record_type = 'advance_order'
     and old.payload->>'storeStatus' = 'dispatched'
     and coalesce(new.payload->>'storeStatus', '') <> 'dispatched' then
    new.payload := jsonb_set(coalesce(new.payload, '{}'::jsonb), '{storeStatus}', '"dispatched"'::jsonb, true);

    if lower(coalesce(old.status, '')) = 'dispatched'
       and lower(coalesce(new.status, '')) not in ('paid in full', 'cancelled', 'completed') then
      new.status := old.status;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_dispatched_advance_order_status_trigger
  on public.branch_operation_records;
create trigger protect_dispatched_advance_order_status_trigger
before update on public.branch_operation_records
for each row execute function public.protect_dispatched_advance_order_status();

create or replace function public.sync_cake_dispatch_to_advance_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
begin
  if lower(coalesce(new.status, '')) <> 'dispatched' then
    return new;
  end if;

  actor_name := coalesce(nullif(btrim(new.dispatched_by), ''), 'Packing');

  update public.branch_operation_records operation
  set payload = operation.payload || jsonb_build_object(
        'storeStatus', 'dispatched',
        'storeAcceptedBy', actor_name,
        'preparedQuantity', new.prepared_quantity
      ),
      status = case
        when lower(coalesce(operation.status, '')) in ('paid in full', 'cancelled', 'completed') then operation.status
        else 'dispatched'
      end,
      actor = actor_name,
      updated_at = now()
  where operation.branch = new.branch
    and operation.record_type = 'advance_order'
    and operation.record_id = new.source_order_id
    and not exists (
      select 1
      from public.branch_operation_records finalization
      where finalization.branch = new.branch
        and finalization.record_type = 'advance_finalization'
        and finalization.record_id = new.order_no
    );

  return new;
end;
$$;

drop trigger if exists sync_cake_dispatch_to_advance_order_trigger
  on public.cake_master_orders;
create trigger sync_cake_dispatch_to_advance_order_trigger
after insert or update of status on public.cake_master_orders
for each row execute function public.sync_cake_dispatch_to_advance_order();

-- Repair only dispatched Cake Master orders that still have an open branch order.
update public.branch_operation_records operation
set payload = operation.payload || jsonb_build_object(
      'storeStatus', 'dispatched',
      'storeAcceptedBy', coalesce(nullif(btrim(cake.dispatched_by), ''), 'Packing'),
      'preparedQuantity', cake.prepared_quantity
    ),
    status = 'dispatched',
    actor = coalesce(nullif(btrim(cake.dispatched_by), ''), operation.actor),
    updated_at = now()
from public.cake_master_orders cake
where cake.branch = operation.branch
  and cake.source_order_id = operation.record_id
  and operation.record_type = 'advance_order'
  and lower(cake.status) = 'dispatched'
  and coalesce(operation.payload->>'storeStatus', '') <> 'dispatched'
  and lower(coalesce(operation.status, '')) not in ('paid in full', 'cancelled', 'completed')
  and not exists (
    select 1
    from public.branch_operation_records finalization
    where finalization.branch = cake.branch
      and finalization.record_type = 'advance_finalization'
      and finalization.record_id = cake.order_no
  );

revoke all on function public.protect_dispatched_advance_order_status() from public, anon, authenticated;
revoke all on function public.sync_cake_dispatch_to_advance_order() from public, anon, authenticated;

notify pgrst, 'reload schema';
