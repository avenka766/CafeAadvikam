-- Keep source deployments aligned with the production split-payment finalizer.

drop function if exists public.finalize_branch_advance_order_v2(text,text,jsonb,numeric,numeric,text,text,text,boolean,numeric,numeric,numeric,text);

create or replace function public.finalize_branch_advance_order_v2(
  p_branch text,
  p_order_no text,
  p_items jsonb,
  p_order_total numeric,
  p_balance_amount numeric,
  p_payment_mode text,
  p_salesperson text,
  p_biller text,
  p_deduct_stock boolean default true,
  p_discount_amount numeric default 0,
  p_additional_charges numeric default 0,
  p_refund_amount numeric default 0,
  p_refund_mode text default null,
  p_payment_splits jsonb default null
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
  refund_value numeric(12,2) := round(coalesce(p_refund_amount,0),2);
  discount_value numeric(12,2) := round(coalesce(p_discount_amount,0),2);
  additional_value numeric(12,2) := round(coalesce(p_additional_charges,0),2);
  mode_value text := lower(coalesce(p_payment_mode,''));
  refund_mode_value text := lower(coalesce(p_refund_mode,''));
  bill_no_value text;
  refund_no_value text;
  invoice_value bigint;
  bill_id_value uuid;
  advance_order_id_value uuid;
  stock_id_value uuid;
  line jsonb;
  qty numeric;
  actor text;
  counter_id uuid;
  reserved boolean;
  line_barcode bigint;
  has_splits boolean := p_payment_splits is not null
    and jsonb_typeof(p_payment_splits) = 'array'
    and jsonb_array_length(p_payment_splits) > 0;
  split_line jsonb;
  split_mode text;
  split_amount numeric(12,2);
  split_sum numeric(12,2) := 0;
  split_mode_count integer := 0;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if p_branch = 'SNB' and c.role not in ('receiver_snb','branch_snb','admin_snb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch = 'VRSNB' and c.role not in ('receiver_vrsnb','branch_vrsnb','admin_vrsnb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_branch not in ('Cafe','VRSNB','SNB','Hosur') then raise exception 'Invalid branch'; end if;

  actor := coalesce(nullif(btrim(p_biller),''),c.username,'Staff');
  if btrim(coalesce(p_order_no,'')) = '' then raise exception 'Advance order number is required'; end if;
  if total_value <= 0 or balance_value < 0 or refund_value < 0 or discount_value < 0 or additional_value < 0 then
    raise exception 'Invalid final bill amount';
  end if;
  if balance_value > 0 and not has_splits and mode_value not in ('cash','upi','card') then raise exception 'Invalid balance payment mode'; end if;
  if refund_value > 0 and refund_mode_value not in ('cash','upi','card') then raise exception 'Select Cash, UPI, or Card as the refund mode'; end if;
  if balance_value > 0 and refund_value > 0 then raise exception 'A bill cannot collect a balance and issue a refund together'; end if;

  if has_splits then
    if balance_value <= 0 then raise exception 'Payment splits can only be used when a balance is due'; end if;
    for split_line in select value from jsonb_array_elements(p_payment_splits) loop
      split_mode := lower(coalesce(split_line->>'mode',''));
      split_amount := round(coalesce((split_line->>'amount')::numeric,0),2);
      if split_mode not in ('cash','upi','card') then raise exception 'Invalid split payment mode'; end if;
      if split_amount <= 0 then raise exception 'Split payment amounts must be greater than zero'; end if;
      split_sum := split_sum + split_amount;
    end loop;
    select count(distinct lower(value->>'mode')) into split_mode_count from jsonb_array_elements(p_payment_splits);
    if split_mode_count <> jsonb_array_length(p_payment_splits) then
      raise exception 'Each payment mode can only be used once in a split payment';
    end if;
    if round(split_sum,2) <> balance_value then
      raise exception 'Split payment amounts (%) do not add up to the balance due (%)', round(split_sum,2), balance_value;
    end if;
  end if;
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

  select coalesce(sum(amount) filter (where payment_stage in ('advance','balance')),0)
    into paid
  from public.branch_advance_payments
  where branch = p_branch and order_no = p_order_no;

  select advance_order_id
    into advance_order_id_value
  from public.branch_advance_payments
  where branch = p_branch
    and order_no = p_order_no
    and advance_order_id is not null
  order by created_at asc, id asc
  limit 1;

  if round(greatest(total_value - paid,0),2) <> balance_value
     or round(greatest(paid - total_value,0),2) <> refund_value then
    raise exception 'Advance payment, final balance, and refund do not match the final bill total';
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
    branch,bill_no,invoice_no,bill_type,salesperson,biller,subtotal,discount,total,tendered,
    balance,status,source,notes,cashier_user_id,cashier_username,counter_session_id
  ) values (
    p_branch,bill_no_value,invoice_value,'advance_final',
    coalesce(nullif(btrim(p_salesperson),''),actor),actor,total_value + discount_value,
    discount_value,total_value,total_value,0,'original','advance_order',
    concat(p_order_no,'; additional_charges=',additional_value,'; refund=',refund_value,' ',refund_mode_value),
    c.staff_id,c.username,counter_id
  ) returning id into bill_id_value;

  if balance_value > 0 then
    if has_splits then
      for split_line in select value from jsonb_array_elements(p_payment_splits) loop
        split_mode := lower(split_line->>'mode');
        split_amount := round((split_line->>'amount')::numeric,2);
        insert into public.branch_advance_payments(
          advance_order_id,branch,order_no,bill_id,payment_mode,amount,payment_stage,collected_by,remarks,
          collector_user_id,collector_username,counter_session_id
        ) values (
          advance_order_id_value,p_branch,p_order_no,bill_id_value,split_mode,split_amount,'balance',actor,
          'Final advance balance (split payment)',c.staff_id,c.username,counter_id
        );
        insert into public.branch_sale_payments(
          bill_id,advance_order_id,branch,bill_no,payment_mode,amount,payment_purpose,remarks,collected_by,
          collected_role,cashier_user_id,cashier_username,counter_session_id
        ) values (
          bill_id_value,advance_order_id_value,p_branch,bill_no_value,split_mode,split_amount,'advance_balance',
          p_order_no,actor,c.role,c.staff_id,c.username,counter_id
        );
      end loop;
    else
      insert into public.branch_advance_payments(
        advance_order_id,branch,order_no,bill_id,payment_mode,amount,payment_stage,collected_by,remarks,
        collector_user_id,collector_username,counter_session_id
      ) values (
        advance_order_id_value,p_branch,p_order_no,bill_id_value,mode_value,balance_value,'balance',actor,
        'Final advance balance',c.staff_id,c.username,counter_id
      );
      insert into public.branch_sale_payments(
        bill_id,advance_order_id,branch,bill_no,payment_mode,amount,payment_purpose,remarks,collected_by,
        collected_role,cashier_user_id,cashier_username,counter_session_id
      ) values (
        bill_id_value,advance_order_id_value,p_branch,bill_no_value,mode_value,balance_value,'advance_balance',
        p_order_no,actor,c.role,c.staff_id,c.username,counter_id
      );
    end if;
  end if;

  for line in select value from jsonb_array_elements(p_items) loop
    qty := round(coalesce((line->>'quantity')::numeric,0),3);
    line_barcode := nullif(line->>'barcode','')::bigint;
    if qty <= 0 or btrim(coalesce(line->>'itemName','')) = '' then raise exception 'Invalid final invoice item'; end if;

    if p_deduct_stock and not reserved then
      stock_id_value := null;
      -- Packing creates flavour-specific rows. Prefer that exact description;
      -- category barcodes are only a fallback for older catalogue stock.
      select id into stock_id_value
      from public.branch_stock
      where branch = p_branch
        and lower(btrim(item_name)) = lower(btrim(line->>'itemName'))
        and quantity - coalesce(reserved_quantity,0) >= qty
      order by updated_at desc nulls last, id
      limit 1
      for update;

      if stock_id_value is null and line_barcode is not null then
        select id into stock_id_value
        from public.branch_stock
        where branch = p_branch and item_barcode = line_barcode
          and quantity - coalesce(reserved_quantity,0) >= qty
        order by updated_at desc nulls last, id
        limit 1
        for update;
      end if;
      if stock_id_value is null then raise exception 'Insufficient or reserved stock for %',line->>'itemName'; end if;

      update public.branch_stock
      set quantity = quantity - qty, updated_at = now(), last_updated_at = now(), last_updated_by = actor
      where id = stock_id_value;
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

  if additional_value > 0 then
    insert into public.branch_bill_items(
      bill_id,branch,bill_no,item_name,quantity,unit,unit_price,discount,tax,line_total
    ) values (bill_id_value,p_branch,bill_no_value,'Additional Charges',1,'pcs',additional_value,0,0,additional_value);
  end if;

  if refund_value > 0 then
    refund_no_value := p_branch || '-ADV-REF-' || invoice_value::text;
    insert into public.branch_advance_payments(
      advance_order_id,branch,order_no,bill_id,payment_mode,amount,payment_stage,collected_by,remarks,
      collector_user_id,collector_username,counter_session_id
    ) values (
      advance_order_id_value,p_branch,p_order_no,bill_id_value,refund_mode_value,refund_value,'refund',actor,
      'Advance overpayment refund',c.staff_id,c.username,counter_id
    );
    insert into public.branch_sale_payments(
      bill_id,advance_order_id,branch,bill_no,payment_mode,amount,payment_purpose,remarks,collected_by,
      collected_role,cashier_user_id,cashier_username,counter_session_id
    ) values (
      bill_id_value,advance_order_id_value,p_branch,bill_no_value,refund_mode_value,refund_value,'refund',
      p_order_no,actor,c.role,c.staff_id,c.username,counter_id
    );
    insert into public.branch_return_records(
      branch,bill_no,return_no,amount,payment_mode,returned_by,reason,items,
      cashier_user_id,cashier_username,counter_session_id
    ) values (
      p_branch,bill_no_value,refund_no_value,refund_value,refund_mode_value,actor,
      'Advance overpayment refund for ' || p_order_no,p_items,c.staff_id,c.username,counter_id
    );
    insert into public.branch_operation_records(
      branch,record_type,record_id,record_no,amount,status,actor,payload
    ) values (
      p_branch,'return',refund_no_value,refund_no_value,refund_value,'refunded',actor,
      jsonb_build_object('refundAmount',refund_value,'refundMode',refund_mode_value,
        'originalBillNo',bill_no_value,'advanceOrderNo',p_order_no)
    );
  end if;

  prior := jsonb_build_object(
    'ok',true,'billNo',bill_no_value,'invoiceNo',invoice_value,'billId',bill_id_value,
    'total',total_value,'balanceCollected',balance_value,'refundAmount',refund_value,
    'refundMode',nullif(refund_mode_value,''),'refundNo',refund_no_value,
    'additionalCharges',additional_value,'reservationConsumed',reserved
  );
  insert into public.branch_operation_records(
    branch,record_type,record_id,record_no,amount,status,actor,payload
  ) values (
    p_branch,'advance_finalization',p_order_no,bill_no_value,total_value,'paid',actor,prior
  );
  return prior;
end;
$$;

revoke all on function public.finalize_branch_advance_order_v2(text,text,jsonb,numeric,numeric,text,text,text,boolean,numeric,numeric,numeric,text,jsonb) from public;
grant execute on function public.finalize_branch_advance_order_v2(text,text,jsonb,numeric,numeric,text,text,text,boolean,numeric,numeric,numeric,text,jsonb) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

