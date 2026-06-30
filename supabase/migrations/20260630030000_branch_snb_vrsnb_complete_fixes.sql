-- Complete SNB/VRSNB branch, receiver, advance, payment-edit and admin parity fixes.
-- This migration is intentionally idempotent and is safe to apply after the earlier
-- cashier-session and SNB admin workflow migrations.

-- ---------------------------------------------------------------------------
-- Split payment corrections
-- ---------------------------------------------------------------------------
alter table public.branch_payment_mode_edits
  add column if not exists old_allocations jsonb not null default '[]'::jsonb,
  add column if not exists new_allocations jsonb not null default '[]'::jsonb;

alter table public.branch_payment_mode_edits
  drop constraint if exists branch_payment_mode_edits_old_mode_check;
alter table public.branch_payment_mode_edits
  drop constraint if exists branch_payment_mode_edits_new_mode_check;
alter table public.branch_payment_mode_edits
  add constraint branch_payment_mode_edits_old_mode_check
    check (old_mode in ('cash','upi','card','split')),
  add constraint branch_payment_mode_edits_new_mode_check
    check (new_mode in ('cash','upi','card','split'));

create or replace function public.edit_branch_bill_payment_allocations(
  p_branch text,
  p_bill_id uuid,
  p_allocations jsonb,
  p_changed_by text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  b public.branch_bill_headers%rowtype;
  old_values jsonb;
  new_values jsonb;
  line jsonb;
  total_value numeric(14,2) := 0;
  line_count integer := 0;
  old_mode text;
  new_mode text;
  cashier_id uuid;
  cashier_name text;
  session_id uuid;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if p_branch = 'SNB' and c.role not in ('branch_snb','admin_snb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch = 'VRSNB' and c.role not in ('branch_vrsnb','admin_vrsnb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch not in ('SNB','VRSNB') then raise exception 'Invalid branch'; end if;

  select * into b
  from public.branch_bill_headers
  where id = p_bill_id and branch = p_branch
  for update;
  if b.id is null then raise exception 'Bill not found'; end if;
  if lower(coalesce(b.bill_type,'')) = 'credit' then raise exception 'Credit bills cannot be changed here'; end if;
  if lower(coalesce(b.status,'')) in ('returned','cancelled') then raise exception 'Returned or cancelled bills cannot be edited'; end if;
  if jsonb_typeof(coalesce(p_allocations,'[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_allocations,'[]'::jsonb)) = 0 then
    raise exception 'Add at least one payment allocation';
  end if;

  for line in select value from jsonb_array_elements(p_allocations) loop
    if lower(coalesce(line->>'mode','')) not in ('cash','upi','card') then raise exception 'Invalid payment mode'; end if;
    if round(coalesce((line->>'amount')::numeric,0),2) <= 0 then raise exception 'Allocation amounts must be positive'; end if;
    total_value := total_value + round((line->>'amount')::numeric,2);
    line_count := line_count + 1;
  end loop;
  if (select count(distinct lower(value->>'mode')) from jsonb_array_elements(p_allocations)) <> line_count then
    raise exception 'Each payment mode can be used once';
  end if;
  if round(total_value,2) <> round(b.total,2) then
    raise exception 'Payment allocation must equal bill total %', round(b.total,2);
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object('mode',lower(payment_mode),'amount',round(amount,2)) order by created_at,id),'[]'::jsonb),
    max(cashier_user_id), max(cashier_username), max(counter_session_id)
  into old_values, cashier_id, cashier_name, session_id
  from public.branch_sale_payments
  where bill_id = b.id and coalesce(amount,0) > 0;

  new_values := (
    select jsonb_agg(
      jsonb_build_object('mode',lower(value->>'mode'),'amount',round((value->>'amount')::numeric,2))
      order by lower(value->>'mode')
    )
    from jsonb_array_elements(p_allocations)
  );
  old_mode := case when jsonb_array_length(old_values) > 1 then 'split' else coalesce(old_values->0->>'mode','cash') end;
  new_mode := case when line_count > 1 then 'split' else lower(p_allocations->0->>'mode') end;

  delete from public.branch_sale_payments where bill_id = b.id;
  insert into public.branch_sale_payments(
    bill_id, branch, bill_no, payment_mode, amount, payment_purpose, remarks,
    collected_by, collected_role, cashier_user_id, cashier_username, counter_session_id
  )
  select
    b.id, p_branch, b.bill_no, lower(value->>'mode'), round((value->>'amount')::numeric,2),
    'bill_collection', 'Payment allocation edited', coalesce(nullif(trim(p_changed_by),''),c.username), c.role,
    coalesce(cashier_id,b.cashier_user_id,c.staff_id),
    coalesce(cashier_name,b.cashier_username,c.username),
    coalesce(session_id,b.counter_session_id)
  from jsonb_array_elements(p_allocations);

  insert into public.branch_payment_mode_edits(
    branch,bill_id,bill_no,old_mode,new_mode,amount,changed_by,old_allocations,new_allocations
  ) values (
    p_branch,b.id,b.bill_no,old_mode,new_mode,round(b.total,2),
    coalesce(nullif(trim(p_changed_by),''),c.username),old_values,new_values
  );

  insert into public.branch_operation_records(
    branch,record_type,record_id,record_no,amount,status,actor,payload
  ) values (
    p_branch,'payment_edit',gen_random_uuid()::text,b.bill_no,b.total,'Updated',c.username,
    jsonb_build_object('billId',b.id,'billNo',b.bill_no,'oldAllocations',old_values,
      'newAllocations',new_values,'changedBy',c.username,'changedAt',now())
  );

  return jsonb_build_object('billNo',b.bill_no,'oldAllocations',old_values,
    'newAllocations',new_values,'total',round(b.total,2));
end;
$$;

-- ---------------------------------------------------------------------------
-- Advance-order stock reservation and fulfilment
-- ---------------------------------------------------------------------------
alter table public.branch_advance_orders add column if not exists notes text;
alter table public.branch_advance_orders add column if not exists reservation_status text not null default 'none';
alter table public.branch_advance_orders add column if not exists updated_at timestamptz not null default now();

create table if not exists public.branch_stock_reservations(
  id uuid primary key default gen_random_uuid(),
  branch text not null,
  source_type text not null,
  source_id text not null,
  item_name text not null,
  item_barcode bigint,
  quantity numeric(12,3) not null,
  status text not null default 'active',
  created_by text not null,
  created_at timestamptz not null default now(),
  completed_by text,
  completed_at timestamptz
);
create unique index if not exists branch_stock_reservations_source_item_uidx
  on public.branch_stock_reservations(branch,source_type,source_id,item_name);
create index if not exists branch_stock_reservations_active_idx
  on public.branch_stock_reservations(branch,status,source_type,source_id);

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.branch_stock_reservations'::regclass
      and conname='branch_stock_reservations_quantity_check'
  ) then
    alter table public.branch_stock_reservations
      add constraint branch_stock_reservations_quantity_check check(quantity > 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.branch_stock_reservations'::regclass
      and conname='branch_stock_reservations_status_check'
  ) then
    alter table public.branch_stock_reservations
      add constraint branch_stock_reservations_status_check
      check(status in ('active','consumed','released'));
  end if;
end $$;

alter table public.branch_stock_reservations enable row level security;
drop policy if exists branch_stock_reservations_read_v2 on public.branch_stock_reservations;
create policy branch_stock_reservations_read_v2
on public.branch_stock_reservations for select
using (
  exists (
    select 1 from public.current_app_session_context() c
    where c.role in ('admin','owner')
      or (branch='SNB' and c.role in ('branch_snb','admin_snb','receiver_snb'))
      or (branch='VRSNB' and c.role in ('branch_vrsnb','admin_vrsnb','receiver_vrsnb'))
  )
);

create or replace function public.reserve_branch_stock_items(
  p_branch text,
  p_source_type text,
  p_source_id text,
  p_items jsonb,
  p_created_by text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  line jsonb;
  stock_row public.branch_stock%rowtype;
  qty numeric(12,3);
  existing_count integer;
  reserved_count integer := 0;
  actor text;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if p_branch='SNB' and c.role not in ('branch_snb','admin_snb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch='VRSNB' and c.role not in ('branch_vrsnb','admin_vrsnb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch not in ('SNB','VRSNB') then raise exception 'Invalid branch'; end if;
  if btrim(coalesce(p_source_id,''))='' then raise exception 'Reservation source is required'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' then raise exception 'Items must be an array'; end if;
  actor := coalesce(nullif(trim(p_created_by),''),c.username);

  select count(*) into existing_count
  from public.branch_stock_reservations
  where branch=p_branch and source_type=p_source_type and source_id=p_source_id and status='active';
  if existing_count > 0 then
    return jsonb_build_object('reserved',true,'duplicate',true,'lineCount',existing_count);
  end if;

  for line in select value from jsonb_array_elements(p_items) loop
    if coalesce((line->>'isCustom')::boolean,false) then continue; end if;
    qty := round(coalesce((line->>'quantity')::numeric,0),3);
    if qty <= 0 then raise exception 'Invalid reservation quantity'; end if;

    select * into stock_row
    from public.branch_stock
    where branch=p_branch
      and (
        (nullif(line->>'barcode','') is not null and item_barcode=(line->>'barcode')::bigint)
        or
        (nullif(line->>'barcode','') is null and lower(btrim(item_name))=lower(btrim(line->>'itemName')))
      )
    order by
      case when nullif(line->>'barcode','') is not null and item_barcode=(line->>'barcode')::bigint then 0 else 1 end,
      updated_at desc
    limit 1
    for update;

    if stock_row.id is null then raise exception 'Stock item not found for %',line->>'itemName'; end if;
    if coalesce(stock_row.quantity,0)-coalesce(stock_row.reserved_quantity,0) < qty then
      raise exception 'Only % available for %',
        round(coalesce(stock_row.quantity,0)-coalesce(stock_row.reserved_quantity,0),3),
        stock_row.item_name;
    end if;

    update public.branch_stock
    set reserved_quantity=round(coalesce(reserved_quantity,0)+qty,3),
        updated_at=now(),last_updated_at=now(),last_updated_by=actor
    where id=stock_row.id;

    insert into public.branch_stock_reservations(
      branch,source_type,source_id,item_name,item_barcode,quantity,created_by
    ) values (
      p_branch,p_source_type,p_source_id,stock_row.item_name,stock_row.item_barcode,qty,actor
    );
    reserved_count := reserved_count + 1;
  end loop;

  return jsonb_build_object('reserved',true,'lineCount',reserved_count);
end;
$$;

create or replace function public.release_branch_stock_reservation(
  p_branch text,p_source_type text,p_source_id text,p_released_by text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  r public.branch_stock_reservations%rowtype;
  n integer := 0;
  actor text;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if p_branch='SNB' and c.role not in ('branch_snb','admin_snb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch='VRSNB' and c.role not in ('branch_vrsnb','admin_vrsnb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  actor := coalesce(nullif(trim(p_released_by),''),c.username);

  for r in
    select * from public.branch_stock_reservations
    where branch=p_branch and source_type=p_source_type and source_id=p_source_id and status='active'
    for update
  loop
    update public.branch_stock
    set reserved_quantity=greatest(round(coalesce(reserved_quantity,0)-r.quantity,3),0),
        updated_at=now(),last_updated_at=now(),last_updated_by=actor
    where branch=p_branch
      and ((r.item_barcode is not null and item_barcode=r.item_barcode)
        or (r.item_barcode is null and lower(btrim(item_name))=lower(btrim(r.item_name))));
    if not found then raise exception 'Stock item not found for %',r.item_name; end if;
    update public.branch_stock_reservations
      set status='released',completed_by=actor,completed_at=now()
      where id=r.id;
    n := n + 1;
  end loop;
  return jsonb_build_object('released',n);
end;
$$;

create or replace function public.consume_branch_stock_reservation(
  p_branch text,p_source_type text,p_source_id text,p_consumed_by text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  r public.branch_stock_reservations%rowtype;
  n integer := 0;
  actor text;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if p_branch='SNB' and c.role not in ('branch_snb','admin_snb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch='VRSNB' and c.role not in ('branch_vrsnb','admin_vrsnb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  actor := coalesce(nullif(trim(p_consumed_by),''),c.username);

  for r in
    select * from public.branch_stock_reservations
    where branch=p_branch and source_type=p_source_type and source_id=p_source_id and status='active'
    for update
  loop
    update public.branch_stock
    set quantity=round(quantity-r.quantity,3),
        reserved_quantity=greatest(round(coalesce(reserved_quantity,0)-r.quantity,3),0),
        updated_at=now(),last_updated_at=now(),last_updated_by=actor
    where branch=p_branch
      and ((r.item_barcode is not null and item_barcode=r.item_barcode)
        or (r.item_barcode is null and lower(btrim(item_name))=lower(btrim(r.item_name))))
      and quantity >= r.quantity;
    if not found then raise exception 'Reserved stock is no longer available for %',r.item_name; end if;
    update public.branch_stock_reservations
      set status='consumed',completed_by=actor,completed_at=now()
      where id=r.id;
    n := n + 1;
  end loop;
  return jsonb_build_object('consumed',n);
end;
$$;

create or replace function public.create_branch_advance_order_reserved(
  p_branch text,
  p_customer_name text,
  p_items jsonb,
  p_subtotal numeric,
  p_advance_amount numeric,
  p_advance_method text,
  p_sold_by text,
  p_delivery_date date,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  order_id uuid := gen_random_uuid();
  balance_value numeric;
  row_value public.branch_advance_orders%rowtype;
  counter_id uuid;
  actor text;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if p_branch='SNB' and c.role not in ('branch_snb','admin_snb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch='VRSNB' and c.role not in ('branch_vrsnb','admin_vrsnb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch not in ('SNB','VRSNB') then raise exception 'Invalid branch'; end if;
  if btrim(coalesce(p_customer_name,''))='' or btrim(coalesce(p_notes,''))='' then
    raise exception 'Customer and complete-order note are required';
  end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then
    raise exception 'Add at least one item';
  end if;

  balance_value := round(coalesce(p_subtotal,0)-coalesce(p_advance_amount,0),2);
  actor := coalesce(nullif(trim(p_sold_by),''),c.username);
  if p_subtotal <= 0 or p_advance_amount < 0 or balance_value < 0 then
    raise exception 'Invalid order or advance amount';
  end if;
  if p_advance_amount > 0 and lower(p_advance_method) not in ('cash','upi','card') then
    raise exception 'Invalid advance payment mode';
  end if;

  perform public.reserve_branch_stock_items(
    p_branch,'branch_advance_order',order_id::text,p_items,actor
  );

  insert into public.branch_advance_orders(
    id,branch,customer_name,items,subtotal,advance_amount,advance_method,balance_due,
    sold_by,status,delivery_date,notes,reservation_status
  ) values (
    order_id,p_branch,btrim(p_customer_name),p_items,round(p_subtotal,2),
    round(p_advance_amount,2),lower(p_advance_method),balance_value,actor,'pending',
    p_delivery_date,btrim(p_notes),'reserved'
  ) returning * into row_value;

  if p_advance_amount > 0 then
    counter_id := public.find_open_counter_session(p_branch,c.staff_id);
    insert into public.branch_advance_payments(
      advance_order_id,branch,order_no,payment_mode,amount,payment_stage,collected_by,
      remarks,collector_user_id,collector_username,counter_session_id
    ) values (
      order_id,p_branch,order_id::text,lower(p_advance_method),round(p_advance_amount,2),
      'advance',actor,'Initial advance',c.staff_id,c.username,counter_id
    );
    insert into public.branch_sale_payments(
      advance_order_id,branch,bill_no,payment_mode,amount,payment_purpose,remarks,
      collected_by,collected_role,cashier_user_id,cashier_username,counter_session_id
    ) values (
      order_id,p_branch,order_id::text,lower(p_advance_method),round(p_advance_amount,2),
      'advance_payment','Initial advance',actor,c.role,c.staff_id,c.username,counter_id
    );
  end if;

  return to_jsonb(row_value);
end;
$$;

create or replace function public.complete_branch_advance_order_reserved(
  p_branch text,p_order_id uuid,p_balance_method text,p_completed_by text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  o public.branch_advance_orders%rowtype;
  counter_id uuid;
  actor text;
  mode_value text;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if p_branch='SNB' and c.role not in ('branch_snb','admin_snb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch='VRSNB' and c.role not in ('branch_vrsnb','admin_vrsnb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;

  select * into o
  from public.branch_advance_orders
  where id=p_order_id and branch=p_branch
  for update;
  if o.id is null then raise exception 'Advance order not found'; end if;
  if o.status='completed' then return to_jsonb(o)||jsonb_build_object('duplicate',true); end if;
  if o.status='cancelled' then raise exception 'Cancelled advance order cannot be completed'; end if;

  actor := coalesce(nullif(trim(p_completed_by),''),c.username);
  mode_value := lower(coalesce(p_balance_method,''));
  if coalesce(o.balance_due,0)>0 and mode_value not in ('cash','upi','card') then
    raise exception 'Select Cash, UPI or Card for the balance';
  end if;

  perform public.consume_branch_stock_reservation(
    p_branch,'branch_advance_order',o.id::text,actor
  );
  counter_id := public.find_open_counter_session(p_branch,c.staff_id);

  if coalesce(o.balance_due,0)>0 then
    insert into public.branch_advance_payments(
      advance_order_id,branch,order_no,payment_mode,amount,payment_stage,collected_by,
      remarks,collector_user_id,collector_username,counter_session_id
    ) values (
      o.id,p_branch,o.id::text,mode_value,o.balance_due,'balance',actor,
      'Advance balance collection',c.staff_id,c.username,counter_id
    );
    insert into public.branch_sale_payments(
      advance_order_id,branch,bill_no,payment_mode,amount,payment_purpose,remarks,
      collected_by,collected_role,cashier_user_id,cashier_username,counter_session_id
    ) values (
      o.id,p_branch,o.id::text,mode_value,o.balance_due,'advance_balance',
      'Advance balance collection',actor,c.role,c.staff_id,c.username,counter_id
    );
  end if;

  update public.branch_advance_orders
  set status='completed',fully_paid_at=now(),
      balance_method=case when coalesce(balance_due,0)>0 then mode_value else advance_method end,
      balance_due=0,reservation_status='consumed',updated_at=now()
  where id=o.id
  returning * into o;

  return to_jsonb(o);
end;
$$;

create or replace function public.cancel_branch_advance_order_reserved(
  p_branch text,p_order_id uuid,p_cancelled_by text,p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  o public.branch_advance_orders%rowtype;
  actor text;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if p_branch='SNB' and c.role not in ('branch_snb','admin_snb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch='VRSNB' and c.role not in ('branch_vrsnb','admin_vrsnb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'Cancellation reason is required'; end if;

  select * into o
  from public.branch_advance_orders
  where id=p_order_id and branch=p_branch
  for update;
  if o.id is null then raise exception 'Advance order not found'; end if;
  if o.status='completed' then raise exception 'Completed advance order cannot be cancelled'; end if;
  if o.status='cancelled' then return to_jsonb(o)||jsonb_build_object('duplicate',true); end if;

  actor := coalesce(nullif(trim(p_cancelled_by),''),c.username);
  perform public.release_branch_stock_reservation(
    p_branch,'branch_advance_order',o.id::text,actor
  );
  update public.branch_advance_orders
  set status='cancelled',reservation_status='released',
      notes=concat_ws(E'\n',notes,'Cancellation: '||btrim(p_reason)),updated_at=now()
  where id=o.id
  returning * into o;
  return to_jsonb(o);
end;
$$;

create or replace function public.guard_branch_reserved_stock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.quantity,0)<0 or coalesce(new.reserved_quantity,0)<0 then
    raise exception 'Stock quantities cannot be negative';
  end if;
  if coalesce(new.quantity,0)<coalesce(new.reserved_quantity,0) then
    raise exception 'Reserved stock cannot be sold';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_branch_reserved_stock on public.branch_stock;
create trigger guard_branch_reserved_stock
before insert or update of quantity,reserved_quantity on public.branch_stock
for each row execute function public.guard_branch_reserved_stock();

create or replace function public.record_completed_branch_advance_sale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare line jsonb;
begin
  if new.status='completed' and old.status is distinct from 'completed' then
    for line in select value from jsonb_array_elements(coalesce(new.items,'[]'::jsonb)) loop
      insert into public.branch_sales(
        branch,item_name,item_barcode,quantity_sold,sold_at,sold_by,payment_method,
        unit_price,bill_no,source
      ) values (
        new.branch,coalesce(line->>'itemName',line->>'item_name','Custom item'),
        nullif(coalesce(line->>'barcode',line->>'itemBarcode'),'')::bigint,
        round(coalesce((line->>'quantity')::numeric,0),3),
        coalesce(new.fully_paid_at,now()),new.sold_by,'advance-completed',
        round(coalesce((line->>'price')::numeric,0),2),new.id::text,'advance_order'
      );
    end loop;
    insert into public.branch_operation_records(
      branch,record_type,record_id,record_no,amount,status,actor,payload
    ) values (
      new.branch,'advance_order',new.id::text,new.id::text,new.subtotal,'completed',new.sold_by,
      jsonb_build_object('orderId',new.id,'customerName',new.customer_name,'items',new.items,
        'subtotal',new.subtotal,'advanceAmount',new.advance_amount,'balanceDue',new.balance_due,
        'status',new.status,'deliveryDate',new.delivery_date,'notes',new.notes,'completedAt',new.fully_paid_at)
    ) on conflict(branch,record_type,record_id) do update
      set amount=excluded.amount,status=excluded.status,actor=excluded.actor,
          payload=excluded.payload,updated_at=now();
  end if;
  return new;
end;
$$;
drop trigger if exists record_completed_branch_advance_sale on public.branch_advance_orders;
create trigger record_completed_branch_advance_sale
after update of status on public.branch_advance_orders
for each row execute function public.record_completed_branch_advance_sale();

-- Legacy numbered advance orders are also reservation-aware.
create or replace function public.finalize_branch_advance_order(
  p_branch text,
  p_order_no text,
  p_items jsonb,
  p_order_total numeric,
  p_balance_amount numeric,
  p_payment_mode text,
  p_salesperson text,
  p_biller text,
  p_deduct_stock boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  prior jsonb;
  paid numeric(12,2);
  total_value numeric(12,2):=round(coalesce(p_order_total,0),2);
  balance_value numeric(12,2):=round(coalesce(p_balance_amount,0),2);
  mode_value text:=lower(coalesce(p_payment_mode,''));
  bill_no_value text;
  invoice_value bigint;
  bill_id_value uuid;
  line jsonb;
  qty numeric;
  affected integer;
  actor text;
  counter_id uuid;
  reserved boolean;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if p_branch='SNB' and c.role not in ('branch_snb','admin_snb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch='VRSNB' and c.role not in ('branch_vrsnb','admin_vrsnb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch not in ('Cafe','VRSNB','SNB','Hosur') then raise exception 'Invalid branch'; end if;
  actor:=coalesce(nullif(trim(p_biller),''),c.username,'Staff');
  if btrim(coalesce(p_order_no,''))='' then raise exception 'Advance order number is required'; end if;
  if total_value<=0 or balance_value<0 then raise exception 'Invalid order or balance amount'; end if;
  if balance_value>0 and mode_value not in ('cash','upi','card') then raise exception 'Invalid balance payment mode'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then
    raise exception 'At least one invoice item is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_branch||'|'||p_order_no||'|final',0));
  select payload into prior
  from public.branch_operation_records
  where branch=p_branch and record_type='advance_finalization' and record_id=p_order_no
  limit 1;
  if found then return prior||jsonb_build_object('duplicate',true); end if;

  select coalesce(sum(amount),0) into paid
  from public.branch_advance_payments
  where branch=p_branch and order_no=p_order_no;
  if round(paid+balance_value,2)<>total_value then
    raise exception 'Advance plus balance does not equal the order total';
  end if;

  select exists(
    select 1 from public.branch_stock_reservations
    where branch=p_branch and source_type='branch_advance_order_number'
      and source_id=p_order_no and status='active'
  ) into reserved;
  if reserved then
    perform public.consume_branch_stock_reservation(
      p_branch,'branch_advance_order_number',p_order_no,actor
    );
  end if;

  select public.get_next_bill_number(p_branch) into bill_no_value;
  invoice_value:=nullif(regexp_replace(bill_no_value,'\D','','g'),'')::bigint;
  counter_id:=public.find_open_counter_session(p_branch,c.staff_id);
  insert into public.branch_bill_headers(
    branch,bill_no,invoice_no,bill_type,salesperson,biller,subtotal,total,tendered,
    balance,status,source,notes,cashier_user_id,cashier_username,counter_session_id
  ) values (
    p_branch,bill_no_value,invoice_value,'advance_final',
    coalesce(nullif(trim(p_salesperson),''),actor),actor,total_value,total_value,
    total_value,0,'original','advance_order',p_order_no,c.staff_id,c.username,counter_id
  ) returning id into bill_id_value;

  if balance_value>0 then
    insert into public.branch_advance_payments(
      branch,order_no,bill_id,payment_mode,amount,payment_stage,collected_by,remarks,
      collector_user_id,collector_username,counter_session_id
    ) values (
      p_branch,p_order_no,bill_id_value,mode_value,balance_value,'balance',actor,
      'Final advance balance',c.staff_id,c.username,counter_id
    );
    insert into public.branch_sale_payments(
      bill_id,branch,bill_no,payment_mode,amount,payment_purpose,remarks,collected_by,
      collected_role,cashier_user_id,cashier_username,counter_session_id
    ) values (
      bill_id_value,p_branch,bill_no_value,mode_value,balance_value,'advance_balance',
      p_order_no,actor,c.role,c.staff_id,c.username,counter_id
    );
  end if;

  for line in select value from jsonb_array_elements(p_items) loop
    qty:=round(coalesce((line->>'quantity')::numeric,0),3);
    if qty<=0 or btrim(coalesce(line->>'itemName',''))='' then
      raise exception 'Invalid final invoice item';
    end if;
    if p_deduct_stock and not reserved then
      update public.branch_stock
      set quantity=quantity-qty,updated_at=now(),last_updated_at=now(),last_updated_by=actor
      where branch=p_branch
        and lower(btrim(item_name))=lower(btrim(line->>'itemName'))
        and quantity-coalesce(reserved_quantity,0)>=qty;
      get diagnostics affected=row_count;
      if affected<>1 then raise exception 'Insufficient or reserved stock for %',line->>'itemName'; end if;
    end if;
    insert into public.branch_bill_items(
      bill_id,branch,bill_no,item_name,quantity,unit,unit_price,discount,tax,line_total
    ) values (
      bill_id_value,p_branch,bill_no_value,line->>'itemName',qty,
      coalesce(nullif(line->>'unit',''),'pcs'),coalesce((line->>'price')::numeric,0),
      coalesce((line->>'discount')::numeric,0),coalesce((line->>'tax')::numeric,0),
      coalesce((line->>'lineTotal')::numeric,0)
    );
  end loop;

  prior:=jsonb_build_object('ok',true,'billNo',bill_no_value,'invoiceNo',invoice_value,
    'billId',bill_id_value,'total',total_value,'balanceCollected',balance_value,
    'reservationConsumed',reserved);
  insert into public.branch_operation_records(
    branch,record_type,record_id,record_no,amount,status,actor,payload
  ) values (
    p_branch,'advance_finalization',p_order_no,bill_no_value,total_value,'paid',actor,prior
  );
  return prior;
end;
$$;

-- ---------------------------------------------------------------------------
-- Credit-safe returns
-- ---------------------------------------------------------------------------
create or replace function public.process_branch_return_credit_safe(
  p_branch text,
  p_bill_no text,
  p_return_no text,
  p_amount numeric,
  p_payment_mode text,
  p_returned_by text,
  p_reason text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  cr public.branch_credit_sales%rowtype;
  due_cut numeric(12,2):=0;
  refund_value numeric(12,2):=0;
  mode_value text:=lower(coalesce(p_payment_mode,'cash'));
  result_value jsonb;
  prior_payload jsonb;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if p_branch='SNB' and c.role not in ('branch_snb','admin_snb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch='VRSNB' and c.role not in ('branch_vrsnb','admin_vrsnb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;

  select payload into prior_payload
  from public.branch_operation_records
  where branch=p_branch and record_type='return' and record_id=p_return_no
  limit 1;
  if prior_payload ? 'creditAdjusted' then
    return prior_payload||jsonb_build_object('duplicate',true);
  end if;

  select * into cr
  from public.branch_credit_sales
  where branch=p_branch and bill_no=p_bill_no
  order by created_at desc
  limit 1
  for update;
  if cr.id is not null then
    due_cut:=least(round(coalesce(p_amount,0),2),round(coalesce(cr.credit_amount,0),2));
  end if;
  refund_value:=round(coalesce(p_amount,0)-due_cut,2);
  if refund_value>0 and mode_value not in ('cash','upi','card') then
    raise exception 'Select Cash, UPI or Card for the refund balance';
  end if;

  result_value:=public.process_branch_return(
    p_branch,p_bill_no,p_return_no,p_amount,
    case when refund_value=0 then 'cash' else mode_value end,
    p_returned_by,p_reason,p_items
  );

  if due_cut>0 then
    update public.branch_credit_sales
    set credit_amount=round(credit_amount-due_cut,2),
        status=case
          when round(credit_amount-due_cut,2)<=0 then 'settled'
          when amount_paid>0 then 'partial'
          else 'pending'
        end,
        settled_at=case when round(credit_amount-due_cut,2)<=0 then now() else null end,
        notes=concat_ws(E'\n',notes,'Return '||p_return_no||' reduced outstanding by '||due_cut)
    where id=cr.id;
  end if;
  if refund_value=0 then
    update public.branch_return_records
    set payment_mode='credit_adjustment'
    where branch=p_branch and return_no=p_return_no;
  end if;
  update public.branch_bill_headers
  set tendered=refund_value
  where branch=p_branch and bill_no=p_return_no and bill_type='return';
  update public.branch_operation_records
  set payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object(
    'creditAdjusted',due_cut,'refundAmount',refund_value,
    'refundMode',case when refund_value>0 then mode_value else null end
  )
  where branch=p_branch and record_type='return' and record_id=p_return_no;

  return result_value||jsonb_build_object(
    'creditAdjusted',due_cut,'refundAmount',refund_value,
    'refundMode',case when refund_value>0 then mode_value else null end
  );
end;
$$;

create or replace view public.snb_session_return_totals as
select
  r.counter_session_id,
  sum(r.amount)::numeric(14,2) as returns,
  sum(
    case when lower(r.payment_mode)='cash'
      then coalesce(nullif((o.payload->>'refundAmount')::numeric,0),r.amount)
      else 0
    end
  )::numeric(14,2) as cash_refunds
from public.branch_return_records r
left join public.branch_operation_records o
  on o.branch=r.branch and o.record_type='return' and o.record_id=r.return_no
where r.branch='SNB' and r.counter_session_id is not null
group by r.counter_session_id;

-- ---------------------------------------------------------------------------
-- Canonical barcode namespaces
-- ---------------------------------------------------------------------------
create or replace function public.create_branch_item(
  p_branch text,
  p_name text,
  p_price numeric,
  p_uom text,
  p_category text,
  p_updated_by text default ''
)
returns public.branch_items
language plpgsql
security definer
set search_path = public
as $$
declare
  barcode_value bigint;
  row_value public.branch_items;
  start_value bigint;
  end_value bigint;
begin
  if p_branch not in ('SNB','VRSNB') then raise exception 'Invalid branch'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Item name is required'; end if;
  if p_price is null or p_price<=0 then raise exception 'Price must be greater than zero'; end if;
  if p_uom not in ('Nos','Kgs') then raise exception 'Invalid unit'; end if;

  perform pg_advisory_xact_lock(hashtext('branch-items-'||p_branch));
  start_value:=case when p_branch='SNB' then 1000 else 2000 end;
  end_value:=case when p_branch='SNB' then 1999 else 2999 end;
  select greatest(start_value,coalesce(max(barcode),start_value))+1
    into barcode_value
  from public.branch_items
  where branch=p_branch and barcode between start_value+1 and end_value;
  if barcode_value>end_value then raise exception '% barcode namespace is full',p_branch; end if;
  if exists(select 1 from public.branch_items where barcode=barcode_value) then
    raise exception 'Barcode % is already assigned',barcode_value;
  end if;

  insert into public.branch_items(branch,barcode,name,price,uom,category,active,updated_by)
  values(p_branch,barcode_value,trim(p_name),p_price,p_uom,trim(p_category),true,coalesce(p_updated_by,''))
  returning * into row_value;
  perform public.ensure_branch_stock_link(p_branch,barcode_value,null);
  return row_value;
end;
$$;

create or replace function public.validate_branch_item_barcode_namespace()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.branch='SNB' and (new.barcode<1001 or new.barcode>1999))
     or (new.branch='VRSNB' and (new.barcode<2001 or new.barcode>2999)) then
    raise exception 'Barcode % is outside the % namespace',new.barcode,new.branch;
  end if;
  if exists(select 1 from public.branch_items where barcode=new.barcode and id<>new.id) then
    raise exception 'Barcode % is already assigned',new.barcode;
  end if;
  return new;
end;
$$;
drop trigger if exists validate_branch_item_barcode_namespace on public.branch_items;
create trigger validate_branch_item_barcode_namespace
before insert or update of barcode,branch on public.branch_items
for each row execute function public.validate_branch_item_barcode_namespace();

-- ---------------------------------------------------------------------------
-- Receiver shared records and live advance pipeline
-- ---------------------------------------------------------------------------
create or replace function public.get_branch_receiver_shared_operations(p_branch text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare c record; result_value jsonb;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if p_branch='SNB' and c.role not in ('receiver_snb','admin_snb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch='VRSNB' and c.role not in ('receiver_vrsnb','admin_vrsnb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch not in ('SNB','VRSNB') then raise exception 'Invalid branch'; end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into result_value
  from (
    select id,record_type,record_no,amount,status,payload,created_at
    from public.branch_operation_records
    where branch=p_branch
      and record_type in (
        'purchase_invoice','purchase_return','waste','waste_log','damage','dump',
        'transfer_out','stock_update'
      )
    order by created_at desc
    limit 1000
  ) x;
  return result_value;
end;
$$;

create or replace function public.get_branch_receiver_advance_orders(p_branch text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare c record; result_value jsonb;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if p_branch='SNB' and c.role not in ('receiver_snb','branch_snb','admin_snb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch='VRSNB' and c.role not in ('receiver_vrsnb','branch_vrsnb','admin_vrsnb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch not in ('SNB','VRSNB') then raise exception 'Invalid branch'; end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into result_value
  from (
    select id,customer_name,items,subtotal,advance_amount,balance_due,status,
           delivery_date,notes,created_at
    from public.branch_advance_orders
    where branch=p_branch
    order by created_at desc
    limit 1000
  ) x;
  return result_value;
end;
$$;

-- SNB Order users may read the shared purchase ledgers directly.
drop policy if exists snb_receiver_purchase_invoice_read on public.snb_purchase_invoices;
create policy snb_receiver_purchase_invoice_read
on public.snb_purchase_invoices for select
using (
  exists(select 1 from public.current_app_session_context() c
    where c.role in ('receiver_snb','admin_snb','admin','owner'))
);
drop policy if exists snb_receiver_purchase_return_read on public.snb_purchase_returns;
create policy snb_receiver_purchase_return_read
on public.snb_purchase_returns for select
using (
  exists(select 1 from public.current_app_session_context() c
    where c.role in ('receiver_snb','admin_snb','admin','owner'))
);
drop policy if exists snb_receiver_purchase_return_item_read on public.snb_purchase_return_items;
create policy snb_receiver_purchase_return_item_read
on public.snb_purchase_return_items for select
using (
  exists(select 1 from public.current_app_session_context() c
    where c.role in ('receiver_snb','admin_snb','admin','owner'))
);

-- ---------------------------------------------------------------------------
-- Atomic SNB/VRSNB waste, damage, dump and transfer-out
-- ---------------------------------------------------------------------------
create or replace function public.apply_branch_waste_stock_deduction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  s public.branch_stock%rowtype;
  available_qty numeric;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if new.branch='SNB' and c.role not in ('branch_snb','admin_snb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if new.branch='VRSNB' and c.role not in ('branch_vrsnb','admin_vrsnb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if new.branch not in ('SNB','VRSNB') then raise exception 'Invalid branch'; end if;
  if new.log_type not in ('Dump','Damage','Trans Out') then raise exception 'Invalid waste type'; end if;
  if coalesce(new.quantity,0)<=0 then raise exception 'Quantity must be greater than zero'; end if;
  if btrim(coalesce(new.reason,''))='' or btrim(coalesce(new.verified_by,''))='' then
    raise exception 'Reason and verifier are required';
  end if;

  select * into s
  from public.branch_stock
  where branch=new.branch
    and ((new.item_barcode is not null and item_barcode=new.item_barcode)
      or (new.item_barcode is null and lower(btrim(item_name))=lower(btrim(new.item_name))))
  order by case when new.item_barcode is not null and item_barcode=new.item_barcode then 0 else 1 end,
           updated_at desc
  limit 1
  for update;
  if s.id is null then raise exception 'Stock item not found'; end if;
  available_qty:=coalesce(s.quantity,0)-coalesce(s.reserved_quantity,0);
  if available_qty<new.quantity then
    raise exception 'Insufficient unreserved stock. Available %',round(available_qty,3);
  end if;

  new.item_barcode:=s.item_barcode;
  new.item_name:=s.item_name;
  new.unit:=coalesce(nullif(new.unit,''),s.unit,'pcs');
  new.created_by_user_id:=c.staff_id;
  new.created_by_username:=c.username;
  new.created_at:=coalesce(new.created_at,now());

  update public.branch_stock
  set quantity=round(quantity-new.quantity,3),last_updated_at=now(),updated_at=now(),
      last_updated_by=c.username
  where id=s.id;
  insert into public.branch_stock_adjustments(
    branch,item_name,old_quantity,new_quantity,delta,reason,adjusted_by,reference_id,notes
  ) values (
    new.branch,s.item_name,s.quantity,round(s.quantity-new.quantity,3),-new.quantity,
    'Waste - '||new.log_type,c.username,new.id::text,new.reason
  );
  return new;
end;
$$;

create or replace function public.mirror_branch_waste_operation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.branch_operation_records(
    branch,record_type,record_id,record_no,amount,status,actor,payload
  ) values (
    new.branch,'waste_log',new.id::text,upper(new.log_type)||'-'||left(new.id::text,8),
    new.quantity,'Posted',new.created_by_username,
    jsonb_build_object('logType',new.log_type,'itemName',new.item_name,
      'itemBarcode',new.item_barcode,'quantity',new.quantity,'unit',new.unit,
      'reason',new.reason,'verifiedBy',new.verified_by,'checklist',new.checklist,
      'createdAt',new.created_at)
  ) on conflict(branch,record_type,record_id) do update
    set amount=excluded.amount,status=excluded.status,actor=excluded.actor,
        payload=excluded.payload,updated_at=now();
  return new;
end;
$$;

drop trigger if exists apply_branch_waste_stock_deduction on public.branch_waste_logs;
create trigger apply_branch_waste_stock_deduction
before insert on public.branch_waste_logs
for each row execute function public.apply_branch_waste_stock_deduction();
drop trigger if exists mirror_branch_waste_operation on public.branch_waste_logs;
create trigger mirror_branch_waste_operation
after insert on public.branch_waste_logs
for each row execute function public.mirror_branch_waste_operation();

drop function if exists public.record_branch_waste_secure(text,text,bigint,text,numeric,text,text,text,jsonb);
create function public.record_branch_waste_secure(
  p_branch text,p_log_type text,p_item_barcode bigint,p_item_name text,
  p_quantity numeric,p_unit text,p_reason text,p_verified_by text,p_checklist jsonb
)
returns public.branch_waste_logs
language plpgsql
security definer
set search_path = public
as $$
declare c record; r public.branch_waste_logs;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  insert into public.branch_waste_logs(
    branch,log_type,item_barcode,item_name,quantity,unit,reason,verified_by,
    checklist,created_by_user_id,created_by_username
  ) values (
    p_branch,p_log_type,p_item_barcode,p_item_name,round(p_quantity,3),p_unit,
    btrim(p_reason),btrim(p_verified_by),coalesce(p_checklist,'[]'::jsonb),
    c.staff_id,c.username
  ) returning * into r;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- VRSNB complaint parity
-- ---------------------------------------------------------------------------
create or replace function public.stamp_branch_complaint_ticket_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare c record;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if new.branch='SNB' and c.role not in ('branch_snb','admin_snb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if new.branch='VRSNB' and c.role not in ('branch_vrsnb','admin_vrsnb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if new.branch not in ('SNB','VRSNB') then raise exception 'Invalid branch'; end if;
  new.ticket_no:=coalesce(nullif(new.ticket_no,''),upper(new.branch)||'-CMP-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'));
  new.created_by_user_id:=c.staff_id;
  new.created_by_username:=c.username;
  new.status:=coalesce(nullif(new.status,''),'Open');
  new.created_at:=coalesce(new.created_at,now());
  new.updated_at:=now();
  return new;
end;
$$;

drop function if exists public.create_branch_complaint_ticket(text,text,text,text,text,text);
create function public.create_branch_complaint_ticket(
  p_branch text,p_complaint_area text,p_category text,p_subject text,
  p_description text,p_priority text default 'Medium'
)
returns public.branch_complaint_tickets
language plpgsql
security definer
set search_path = public
as $$
declare r public.branch_complaint_tickets;
begin
  if btrim(coalesce(p_subject,''))='' or btrim(coalesce(p_description,''))='' then
    raise exception 'Subject and description are required';
  end if;
  insert into public.branch_complaint_tickets(
    ticket_no,branch,complaint_area,category,subject,description,priority,status
  ) values (
    '',p_branch,btrim(coalesce(p_complaint_area,p_branch)),
    btrim(coalesce(p_category,'General')),btrim(p_subject),btrim(p_description),
    coalesce(nullif(btrim(p_priority),''),'Medium'),'Open'
  ) returning * into r;
  return r;
end;
$$;

-- Existing policies remain, and these additional policies grant VRSNB parity.
drop policy if exists vrsnb_complaint_insert on public.branch_complaint_tickets;
create policy vrsnb_complaint_insert
on public.branch_complaint_tickets for insert
with check (
  branch='VRSNB' and exists(select 1 from public.current_app_session_context() c
    where c.role in ('branch_vrsnb','admin_vrsnb','admin','owner'))
);
drop policy if exists vrsnb_complaint_select on public.branch_complaint_tickets;
create policy vrsnb_complaint_select
on public.branch_complaint_tickets for select
using (
  branch='VRSNB' and exists(select 1 from public.current_app_session_context() c
    where c.role in ('branch_vrsnb','admin_vrsnb','admin','owner'))
);

-- ---------------------------------------------------------------------------
-- Reversible stock audit confirmation
-- ---------------------------------------------------------------------------
create or replace function public.reverse_branch_stock_count_report(
  p_report_id text,p_reversed_by text,p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  r public.branch_stock_count_reports%rowtype;
  line jsonb;
  item_name_value text;
  current_value numeric;
  confirmed_value numeric;
  restore_value numeric;
  actor text;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if c.role not in ('admin_snb','admin_vrsnb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'Reversal reason is required'; end if;

  select * into r
  from public.branch_stock_count_reports
  where id=p_report_id
  for update;
  if r.id is null then raise exception 'Stock count report not found'; end if;
  if r.status<>'Confirmed' then raise exception 'Only confirmed reports can be reversed'; end if;
  if exists(
    select 1 from public.branch_operation_records
    where branch=r.branch and record_type='stock_count_reversal' and record_id=r.id
  ) then raise exception 'This report was already reversed'; end if;
  actor:=coalesce(nullif(trim(p_reversed_by),''),c.username);

  -- Reversal is refused if any counted item changed after confirmation.
  for line in select value from jsonb_array_elements(r.lines) loop
    item_name_value:=coalesce(line->>'itemName',line->>'item_name');
    confirmed_value:=round(coalesce((line->>'physicalQty')::numeric,0),3);
    select quantity into current_value
    from public.branch_stock
    where branch=r.branch and lower(btrim(item_name))=lower(btrim(item_name_value))
    for update;
    if current_value is null then raise exception 'Stock item not found for %',item_name_value; end if;
    if abs(current_value-confirmed_value)>0.0001 then
      raise exception 'Cannot reverse because % changed after confirmation',item_name_value;
    end if;
  end loop;

  for line in select value from jsonb_array_elements(r.lines) loop
    item_name_value:=coalesce(line->>'itemName',line->>'item_name');
    restore_value:=round(coalesce((line->>'systemQty')::numeric,0),3);
    select quantity into current_value
    from public.branch_stock
    where branch=r.branch and lower(btrim(item_name))=lower(btrim(item_name_value))
    for update;
    update public.branch_stock
    set quantity=restore_value,updated_at=now(),last_updated_at=now(),last_updated_by=actor
    where branch=r.branch and lower(btrim(item_name))=lower(btrim(item_name_value));
    insert into public.branch_stock_adjustments(
      branch,item_name,old_quantity,new_quantity,delta,reason,adjusted_by,reference_id,notes
    ) values (
      r.branch,item_name_value,current_value,restore_value,round(restore_value-current_value,3),
      'Stock Audit Reversal',actor,r.report_no,p_reason
    );
  end loop;

  insert into public.branch_operation_records(
    branch,record_type,record_id,record_no,amount,status,actor,payload
  ) values (
    r.branch,'stock_count_reversal',r.id,r.report_no,0,'Reversed',actor,
    jsonb_build_object('reportId',r.id,'reportNo',r.report_no,'reason',p_reason,
      'reversedBy',actor,'reversedAt',now())
  );
  return jsonb_build_object('reportId',r.id,'reportNo',r.report_no,
    'reversed',true,'reason',p_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
revoke all on function public.edit_branch_bill_payment_allocations(text,uuid,jsonb,text) from public;
revoke all on function public.reserve_branch_stock_items(text,text,text,jsonb,text) from public;
revoke all on function public.release_branch_stock_reservation(text,text,text,text) from public;
revoke all on function public.consume_branch_stock_reservation(text,text,text,text) from public;
revoke all on function public.create_branch_advance_order_reserved(text,text,jsonb,numeric,numeric,text,text,date,text) from public;
revoke all on function public.complete_branch_advance_order_reserved(text,uuid,text,text) from public;
revoke all on function public.cancel_branch_advance_order_reserved(text,uuid,text,text) from public;
revoke all on function public.process_branch_return_credit_safe(text,text,text,numeric,text,text,text,jsonb) from public;
revoke all on function public.get_branch_receiver_shared_operations(text) from public;
revoke all on function public.get_branch_receiver_advance_orders(text) from public;
revoke all on function public.record_branch_waste_secure(text,text,bigint,text,numeric,text,text,text,jsonb) from public;
revoke all on function public.create_branch_complaint_ticket(text,text,text,text,text,text) from public;
revoke all on function public.reverse_branch_stock_count_report(text,text,text) from public;

grant execute on function public.edit_branch_bill_payment_allocations(text,uuid,jsonb,text) to anon,authenticated,service_role;
grant execute on function public.reserve_branch_stock_items(text,text,text,jsonb,text) to anon,authenticated,service_role;
grant execute on function public.release_branch_stock_reservation(text,text,text,text) to anon,authenticated,service_role;
grant execute on function public.consume_branch_stock_reservation(text,text,text,text) to anon,authenticated,service_role;
grant execute on function public.create_branch_advance_order_reserved(text,text,jsonb,numeric,numeric,text,text,date,text) to anon,authenticated,service_role;
grant execute on function public.complete_branch_advance_order_reserved(text,uuid,text,text) to anon,authenticated,service_role;
grant execute on function public.cancel_branch_advance_order_reserved(text,uuid,text,text) to anon,authenticated,service_role;
grant execute on function public.process_branch_return_credit_safe(text,text,text,numeric,text,text,text,jsonb) to anon,authenticated,service_role;
grant execute on function public.get_branch_receiver_shared_operations(text) to anon,authenticated,service_role;
grant execute on function public.get_branch_receiver_advance_orders(text) to anon,authenticated,service_role;
grant execute on function public.record_branch_waste_secure(text,text,bigint,text,numeric,text,text,text,jsonb) to anon,authenticated,service_role;
grant execute on function public.create_branch_complaint_ticket(text,text,text,text,text,text) to anon,authenticated,service_role;
grant execute on function public.reverse_branch_stock_count_report(text,text,text) to anon,authenticated,service_role;
grant select on public.branch_stock_reservations to anon,authenticated,service_role;
grant select on public.snb_session_return_totals to anon,authenticated,service_role;
