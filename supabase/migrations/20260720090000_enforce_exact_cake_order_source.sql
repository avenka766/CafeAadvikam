-- A cake must remain linked to the immutable advance-order source that created it.
-- Human-readable order numbers are not sufficient identifiers across older clients.

create unique index if not exists cake_master_orders_source_order_unique
  on public.cake_master_orders(branch, source_order_id)
  where source_order_id is not null and btrim(source_order_id) <> '';

create or replace function public.validate_cake_master_order_source()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  source_order_no text;
begin
  if nullif(btrim(coalesce(new.source_order_id, '')), '') is null then
    raise exception 'ADVANCE_SOURCE_REQUIRED: Cake order % has no immutable source order ID', new.order_no;
  end if;

  select operation.record_no
  into source_order_no
  from public.branch_operation_records operation
  where operation.branch = new.branch
    and operation.record_type = 'advance_order'
    and operation.record_id = new.source_order_id;

  if source_order_no is null then
    raise exception 'ADVANCE_SOURCE_NOT_SAVED: Save advance order % before sending it to Cake Master', new.order_no;
  end if;

  if source_order_no is distinct from new.order_no then
    raise exception 'ADVANCE_SOURCE_MISMATCH: Cake order % belongs to source order %', new.order_no, source_order_no;
  end if;

  if exists (
    select 1
    from public.branch_operation_records operation
    where operation.branch = new.branch
      and operation.record_type = 'advance_order'
      and operation.record_no = new.order_no
      and operation.record_id <> new.source_order_id
  ) then
    raise exception 'ORDER_NUMBER_ALREADY_USED: % belongs to another advance order', new.order_no;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_cake_master_order_source_trigger
  on public.cake_master_orders;
create trigger validate_cake_master_order_source_trigger
before insert or update of order_no, source_order_id, status
on public.cake_master_orders
for each row execute function public.validate_cake_master_order_source();

revoke all on function public.validate_cake_master_order_source() from public, anon, authenticated;

notify pgrst, 'reload schema';
