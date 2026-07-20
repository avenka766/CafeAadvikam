-- Keep custom advance-cake descriptions linked to the reusable SNB cake catalogue,
-- and keep the visible advance number consistent through payment collection.

create or replace function public.create_snb_order_advance_order_secure_v2(
  p_order_no text,
  p_customer_name text,
  p_items jsonb,
  p_subtotal numeric,
  p_advance_amount numeric,
  p_advance_method text,
  p_delivery_date date,
  p_notes text,
  p_entered_by text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  result jsonb;
  order_id uuid;
  actor text;
  counter_id uuid;
  visible_order_no text := btrim(coalesce(p_order_no, ''));
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if c.role not in ('receiver_snb','branch_snb','admin_snb','admin','owner') then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;
  if visible_order_no = '' then raise exception 'Advance order number is required'; end if;

  select id into counter_id
  from public.branch_counter_sessions
  where branch = 'SNB' and cashier_user_id = c.staff_id and status = 'open'
  order by opened_at desc
  limit 1
  for update;
  if counter_id is null then
    raise exception 'COUNTER_NOT_OPEN: Open the Daily Closure counter before taking an advance order.';
  end if;

  actor := coalesce(nullif(btrim(p_entered_by), ''), 'SNB Order - ' || c.username);
  result := public.create_branch_advance_order_reserved(
    'SNB', p_customer_name, p_items, p_subtotal, p_advance_amount,
    p_advance_method, actor, p_delivery_date, p_notes
  );
  order_id := (result->>'id')::uuid;

  update public.branch_advance_payments
  set order_no = visible_order_no,
      collected_by = actor,
      remarks = 'SNB Order collected',
      counter_session_id = coalesce(counter_session_id, counter_id)
  where advance_order_id = order_id and payment_stage = 'advance';

  update public.branch_sale_payments
  set collected_by = actor,
      collected_role = 'receiver_snb',
      remarks = visible_order_no,
      counter_session_id = coalesce(counter_session_id, counter_id)
  where advance_order_id = order_id
    and payment_purpose in ('advance_payment','advance_paid');

  return result || jsonb_build_object(
    'orderNo', visible_order_no,
    'collectionSource', 'SNB Order collected',
    'counterSessionId', counter_id
  );
end;
$$;

revoke all on function public.create_snb_order_advance_order_secure_v2(text,text,jsonb,numeric,numeric,text,date,text,text) from public;
grant execute on function public.create_snb_order_advance_order_secure_v2(text,text,jsonb,numeric,numeric,text,date,text,text) to anon, authenticated, service_role;

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
  total_value numeric(12,2) := round(coalesce(p_order_total,0),2);
  balance_value numeric(12,2) := round(coalesce(p_balance_amount,0),2);
  mode_value text := lower(coalesce(p_payment_mode,''));
  bill_no_value text;
  invoice_value bigint;
  bill_id_value uuid;
  line jsonb;
  qty numeric;
  affected integer;
  actor text;
  counter_id uuid;
  reserved boolean;
  line_barcode bigint;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if p_branch = 'SNB' and c.role not in ('receiver_snb','branch_snb','admin_snb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch = 'VRSNB' and c.role not in ('receiver_vrsnb','branch_vrsnb','admin_vrsnb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch not in ('Cafe','VRSNB','SNB','Hosur') then raise exception 'Invalid branch'; end if;
  actor := coalesce(nullif(trim(p_biller),''),c.username,'Staff');
  if btrim(coalesce(p_order_no,'')) = '' then raise exception 'Advance order number is required'; end if;
  if total_value <= 0 or balance_value < 0 then raise exception 'Invalid order or balance amount'; end if;
  if balance_value > 0 and mode_value not in ('cash','upi','card') then raise exception 'Invalid balance payment mode'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then
    raise exception 'At least one invoice item is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_branch || '|' || p_order_no || '|final',0));
  select payload into prior
  from public.branch_operation_records
  where branch = p_branch and record_type = 'advance_finalization' and record_id = p_order_no
  limit 1;
  if found then return prior || jsonb_build_object('duplicate',true); end if;

  select coalesce(sum(amount),0) into paid
  from public.branch_advance_payments
  where branch = p_branch and order_no = p_order_no;
  if round(paid + balance_value,2) <> total_value then
    raise exception 'Advance plus balance does not equal the order total';
  end if;

  select exists(
    select 1 from public.branch_stock_reservations
    where branch = p_branch and source_type = 'branch_advance_order_number'
      and source_id = p_order_no and status = 'active'
  ) into reserved;
  if reserved then
    perform public.consume_branch_stock_reservation(p_branch,'branch_advance_order_number',p_order_no,actor);
  end if;

  select public.get_next_bill_number(p_branch) into bill_no_value;
  invoice_value := nullif(regexp_replace(bill_no_value,'\D','','g'),'')::bigint;
  counter_id := public.find_open_counter_session(p_branch,c.staff_id);
  insert into public.branch_bill_headers(
    branch,bill_no,invoice_no,bill_type,salesperson,biller,subtotal,total,tendered,
    balance,status,source,notes,cashier_user_id,cashier_username,counter_session_id
  ) values (
    p_branch,bill_no_value,invoice_value,'advance_final',
    coalesce(nullif(trim(p_salesperson),''),actor),actor,total_value,total_value,
    total_value,0,'original','advance_order',p_order_no,c.staff_id,c.username,counter_id
  ) returning id into bill_id_value;

  if balance_value > 0 then
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
    qty := round(coalesce((line->>'quantity')::numeric,0),3);
    line_barcode := nullif(line->>'barcode','')::bigint;
    if qty <= 0 or btrim(coalesce(line->>'itemName','')) = '' then
      raise exception 'Invalid final invoice item';
    end if;
    if p_deduct_stock and not reserved then
      update public.branch_stock
      set quantity = quantity - qty, updated_at = now(), last_updated_at = now(), last_updated_by = actor
      where branch = p_branch
        and (
          (line_barcode is not null and item_barcode = line_barcode)
          or (line_barcode is null and lower(btrim(item_name)) = lower(btrim(line->>'itemName')))
        )
        and quantity - coalesce(reserved_quantity,0) >= qty;
      get diagnostics affected = row_count;
      if affected <> 1 then raise exception 'Insufficient or reserved stock for %',line->>'itemName'; end if;
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

  prior := jsonb_build_object(
    'ok',true,'billNo',bill_no_value,'invoiceNo',invoice_value,'billId',bill_id_value,
    'total',total_value,'balanceCollected',balance_value,'reservationConsumed',reserved
  );
  insert into public.branch_operation_records(
    branch,record_type,record_id,record_no,amount,status,actor,payload
  ) values (
    p_branch,'advance_finalization',p_order_no,bill_no_value,total_value,'paid',actor,prior
  );
  return prior;
end;
$$;

revoke all on function public.finalize_branch_advance_order(text,text,jsonb,numeric,numeric,text,text,text,boolean) from public;
grant execute on function public.finalize_branch_advance_order(text,text,jsonb,numeric,numeric,text,text,text,boolean) to anon, authenticated, service_role;

-- Merge historical custom cake stock into its reusable catalogue row. The
-- customer-facing descriptions remain untouched on advance orders and bills.
do $$
declare
  stock_row record;
  target_barcode bigint;
  affected integer;
begin
  for stock_row in
    select id, branch, item_name, quantity
    from public.branch_stock
    where branch in ('SNB','Hosur') and item_barcode is null
      and (item_name ilike 'Butter Cream - %' or item_name ilike 'Fresh Cream - %')
  loop
    target_barcode := case
      when stock_row.item_name ilike 'Butter Cream - Birthday Premium Flavours - %' then 1164
      when stock_row.item_name ilike 'Butter Cream - Birthday Flavours - %' then 1163
      when stock_row.item_name ilike 'Butter Cream - Fondant Cakes%' then 1162
      when stock_row.item_name ilike 'Fresh Cream - Birthday Flavour Pastry Cakes - %' then 1167
      when stock_row.item_name ilike 'Fresh Cream - Birthday Prime Flavour Cakes - %' then 1168
      when stock_row.item_name ilike 'Fresh Cream - Birthday Pastry Cakes - %' then 1166
      when stock_row.item_name ilike 'Fresh Cream - Fondant Cakes%' then 1169
      else null
    end;
    if target_barcode is not null then
      if stock_row.quantity > 0 then
        update public.branch_stock
        set quantity = round(quantity + stock_row.quantity, 3),
            updated_at = now(),
            last_updated_at = now(),
            last_updated_by = 'Advance cake catalogue repair'
        where branch = stock_row.branch and item_barcode = target_barcode;
        get diagnostics affected = row_count;
        if affected = 0 then
          insert into public.branch_stock(
            branch, item_name, item_barcode, quantity, unit, min_threshold, reserved_quantity
          )
          select
            stock_row.branch, bi.name, target_barcode, round(stock_row.quantity, 3),
            case when bi.uom = 'Kgs' then 'kg' else 'pcs' end,
            case when bi.uom = 'Kgs' then 2 else 10 end,
            0
          from public.branch_items bi
          where bi.branch = 'SNB' and bi.barcode = target_barcode;
        end if;
      end if;
      delete from public.branch_stock where id = stock_row.id;
    end if;
  end loop;

  update public.branch_incoming
  set item_barcode = case
    when item_name ilike 'Butter Cream - Birthday Premium Flavours - %' then 1164
    when item_name ilike 'Butter Cream - Birthday Flavours - %' then 1163
    when item_name ilike 'Butter Cream - Fondant Cakes%' then 1162
    when item_name ilike 'Fresh Cream - Birthday Flavour Pastry Cakes - %' then 1167
    when item_name ilike 'Fresh Cream - Birthday Prime Flavour Cakes - %' then 1168
    when item_name ilike 'Fresh Cream - Birthday Pastry Cakes - %' then 1166
    when item_name ilike 'Fresh Cream - Fondant Cakes%' then 1169
    else item_barcode
  end
  where branch in ('SNB','Hosur') and item_barcode is null
    and (item_name ilike 'Butter Cream - %' or item_name ilike 'Fresh Cream - %');
end;
$$;

notify pgrst, 'reload schema';
