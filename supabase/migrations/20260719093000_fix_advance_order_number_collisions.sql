-- Allocate advance numbers in PostgreSQL so multiple devices cannot reuse one.
-- Repair the one existing duplicate without hard-coding generated record IDs.

create temp table advance_order_renumber_map on commit drop as
with ranked as (
  select
    operation.branch,
    operation.record_id,
    operation.record_no as old_order_no,
    operation.created_at,
    operation.payload,
    row_number() over (
      partition by operation.branch, operation.record_no
      order by operation.created_at, operation.record_id
    ) as duplicate_rank
  from public.branch_operation_records operation
  where operation.record_type = 'advance_order'
    and operation.record_no ~ '^[A-Za-z]+-ADV-[0-9]+$'
), branch_maximum as (
  select
    branch,
    max((regexp_match(record_no, '([0-9]+)$'))[1]::bigint) as maximum_number
  from public.branch_operation_records
  where record_type = 'advance_order'
    and record_no ~ '^[A-Za-z]+-ADV-[0-9]+$'
  group by branch
), duplicates as (
  select
    ranked.*,
    row_number() over (partition by ranked.branch order by ranked.created_at, ranked.record_id) as replacement_offset
  from ranked
  where ranked.duplicate_rank > 1
)
select
  duplicate.branch,
  duplicate.record_id,
  duplicate.old_order_no,
  duplicate.created_at,
  duplicate.payload,
  duplicate.branch || '-ADV-' || lpad(
    (maximum.maximum_number + duplicate.replacement_offset)::text,
    3,
    '0'
  ) as new_order_no,
  matching_advance.id as advance_order_id
from duplicates duplicate
join branch_maximum maximum on maximum.branch = duplicate.branch
left join lateral (
  select advance.id
  from public.branch_advance_orders advance
  where advance.branch = duplicate.branch
    and advance.customer_name = duplicate.payload->>'customerName'
    and abs(extract(epoch from (advance.created_at - duplicate.created_at))) <= 10
  order by abs(extract(epoch from (advance.created_at - duplicate.created_at))), advance.id
  limit 1
) matching_advance on true;

update public.cake_master_orders cake
set order_no = mapping.new_order_no,
    updated_at = now()
from advance_order_renumber_map mapping
where cake.branch = mapping.branch
  and cake.source_order_id = mapping.record_id;

update public.branch_advance_payments payment
set order_no = mapping.new_order_no
from advance_order_renumber_map mapping
where mapping.advance_order_id is not null
  and payment.advance_order_id = mapping.advance_order_id
  and payment.order_no = mapping.old_order_no;

update public.branch_sale_payments payment
set remarks = mapping.new_order_no
from advance_order_renumber_map mapping
where mapping.advance_order_id is not null
  and payment.advance_order_id = mapping.advance_order_id
  and payment.remarks = mapping.old_order_no;

update public.branch_operation_records operation
set record_no = mapping.new_order_no,
    payload = operation.payload || jsonb_build_object('orderNo', mapping.new_order_no),
    updated_at = now()
from advance_order_renumber_map mapping
where operation.branch = mapping.branch
  and operation.record_type = 'advance_order'
  and operation.record_id = mapping.record_id;

update public.branch_operation_records notification
set record_no = mapping.new_order_no,
    payload = jsonb_set(
      jsonb_set(
        notification.payload,
        '{title}',
        to_jsonb(replace(coalesce(notification.payload->>'title', ''), mapping.old_order_no, mapping.new_order_no)),
        true
      ),
      '{details}',
      to_jsonb(replace(coalesce(notification.payload->>'details', ''), mapping.old_order_no, mapping.new_order_no)),
      true
    ),
    updated_at = now()
from advance_order_renumber_map mapping
where notification.branch = mapping.branch
  and notification.record_type = 'notification'
  and notification.record_no = mapping.old_order_no
  and notification.created_at >= mapping.created_at;

-- Restore open cake orders displaced by the former order-number upsert.
insert into public.cake_master_orders (
  branch, order_no, source_order_id, slip_number, customer_name, mobile,
  delivery_date, delivery_time, cake_kg, flavor, shape, cream_type,
  message_on_cake, design_notes, attachment_data_url,
  order_value, advance_amount, balance_amount, status
)
select
  operation.branch,
  operation.record_no,
  operation.record_id,
  nullif(operation.payload->>'slipNumber', ''),
  coalesce(operation.payload->>'customerName', ''),
  nullif(operation.payload->>'mobile', ''),
  nullif(operation.payload->>'deliveryDate', '')::date,
  nullif(operation.payload->>'deliveryTime', ''),
  nullif(operation.payload->>'cakeKg', ''),
  nullif(operation.payload->>'flavor', ''),
  nullif(operation.payload->>'shape', ''),
  nullif(operation.payload->>'creamType', ''),
  nullif(operation.payload->>'messageOnCake', ''),
  nullif(operation.payload->>'designNotes', ''),
  nullif(operation.payload->>'attachmentDataUrl', ''),
  coalesce(nullif(operation.payload->>'orderValue', '')::numeric, 0),
  coalesce(nullif(operation.payload->>'advanceAmount', '')::numeric, 0),
  coalesce(nullif(operation.payload->>'balanceAmount', '')::numeric, 0),
  'New'
from public.branch_operation_records operation
where operation.record_type = 'advance_order'
  and operation.payload->>'orderType' = 'cake'
  and nullif(operation.payload->>'sentToStoreAt', '') is not null
  and lower(coalesce(operation.status, '')) not in ('paid in full', 'cancelled', 'completed')
  and not exists (
    select 1 from public.cake_master_orders cake
    where cake.branch = operation.branch
      and cake.source_order_id = operation.record_id
  )
  and not exists (
    select 1 from public.branch_operation_records finalization
    where finalization.branch = operation.branch
      and finalization.record_type = 'advance_finalization'
      and finalization.record_id = operation.record_no
  )
on conflict (branch, order_no) do nothing;

create unique index if not exists branch_advance_operation_order_no_unique
  on public.branch_operation_records(branch, record_no)
  where record_type = 'advance_order'
    and record_no ~ '^[A-Za-z]+-ADV-[0-9]+$';

create table if not exists public.branch_advance_number_sequences (
  branch text primary key,
  last_number bigint not null check (last_number >= 0),
  updated_at timestamptz not null default now()
);
alter table public.branch_advance_number_sequences enable row level security;
revoke all on table public.branch_advance_number_sequences from anon, authenticated;

insert into public.branch_advance_number_sequences(branch, last_number)
select
  branch,
  max((regexp_match(record_no, '([0-9]+)$'))[1]::bigint)
from public.branch_operation_records
where record_type = 'advance_order'
  and record_no ~ '^[A-Za-z]+-ADV-[0-9]+$'
group by branch
on conflict (branch) do update
set last_number = greatest(public.branch_advance_number_sequences.last_number, excluded.last_number),
    updated_at = now();

create or replace function public.get_next_advance_order_number(p_branch text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  context record;
  next_number bigint;
begin
  select * into context from public.current_app_session_context();
  if context.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if p_branch = 'SNB' and context.role not in ('receiver_snb','branch_snb','admin_snb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch = 'VRSNB' and context.role not in ('receiver_vrsnb','branch_vrsnb','admin_vrsnb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch = 'Hosur' and context.role not in ('branch_hosur','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch = 'Cafe' and context.role not in ('billing','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch not in ('SNB','VRSNB','Hosur','Cafe') then raise exception 'Invalid branch'; end if;

  insert into public.branch_advance_number_sequences(branch, last_number)
  values (p_branch, 1)
  on conflict (branch) do update
  set last_number = public.branch_advance_number_sequences.last_number + 1,
      updated_at = now()
  returning last_number into next_number;

  return p_branch || '-ADV-' || lpad(next_number::text, 3, '0');
end;
$$;

create or replace function public.prevent_cake_master_order_reassignment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.source_order_id is distinct from new.source_order_id then
    raise exception 'ORDER_NUMBER_ALREADY_USED: % belongs to another advance order', old.order_no;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_cake_master_order_reassignment_trigger
  on public.cake_master_orders;
create trigger prevent_cake_master_order_reassignment_trigger
before update of source_order_id on public.cake_master_orders
for each row execute function public.prevent_cake_master_order_reassignment();

revoke all on function public.get_next_advance_order_number(text) from public;
grant execute on function public.get_next_advance_order_number(text) to anon, authenticated;
revoke all on function public.prevent_cake_master_order_reassignment() from public, anon, authenticated;

notify pgrst, 'reload schema';
