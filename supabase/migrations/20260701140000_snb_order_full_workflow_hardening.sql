-- SNB Order end-to-end workflow hardening.
--
-- Fixes:
-- 1. Branch-aware receiver/admin role mapping.
-- 2. A single stock deduction owner for Dump, Damage and Transfer Out.
-- 3. Current branch_stock_adjustments schema usage (legacy columns removed).
-- 4. Explicit SNB Order access to advance-order creation and stock reservation.
-- 5. Purchase Return validation against synced revisions, prior returns and
--    unreserved live stock.

create or replace function public.require_app_staff(
  p_roles text[] default null,
  p_branch text default null
)
returns table(
  id uuid,
  username text,
  display_name text,
  role text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v record;
  v_branch text;
begin
  select * into v from public.current_app_staff();

  if v.id is null then
    raise exception 'SESSION_REQUIRED' using errcode = '28000';
  end if;

  if p_roles is not null and not (v.role = any(p_roles)) then
    raise exception 'ROLE_NOT_ALLOWED' using errcode = '42501';
  end if;

  v_branch := case v.role
    when 'branch_snb' then 'SNB'
    when 'admin_snb' then 'SNB'
    when 'receiver_snb' then 'SNB'
    when 'branch_vrsnb' then 'VRSNB'
    when 'admin_vrsnb' then 'VRSNB'
    when 'receiver_vrsnb' then 'VRSNB'
    when 'branch_hosur' then 'Hosur'
    when 'admin_hosur' then 'Hosur'
    when 'receiver_hosur' then 'Hosur'
    else null
  end;

  if p_branch is not null
     and v.role not in ('admin', 'owner')
     and coalesce(v_branch, '') <> p_branch then
    raise exception 'BRANCH_NOT_ALLOWED' using errcode = '42501';
  end if;

  return query
  select v.id, v.username, v.display_name, v.role;
end;
$$;

create or replace function public.current_app_session_context()
returns table(
  app_session_id uuid,
  staff_id uuid,
  username text,
  display_name text,
  role text,
  device_info text
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_headers jsonb := '{}'::jsonb;
  v_token text;
begin
  begin
    v_headers := coalesce(
      nullif(current_setting('request.headers', true), ''),
      '{}'
    )::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_token := nullif(
    coalesce(
      v_headers ->> 'x-cafe-session',
      v_headers ->> 'X-Cafe-Session'
    ),
    ''
  );

  if v_token is null then
    return;
  end if;

  return query
  select
    s.id,
    u.id,
    u.username,
    u.display_name,
    u.role::text,
    s.device_info
  from public.app_staff_sessions s
  join public.staff_users u on u.id = s.staff_id
  where s.token_hash = encode(
          extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
          'hex'
        )
    and s.revoked_at is null
    and s.expires_at > now()
    and coalesce(u.is_active, true)
  order by s.created_at desc
  limit 1;
end;
$$;

create or replace function public.record_branch_waste_secure(
  p_branch text,
  p_log_type text,
  p_item_barcode bigint,
  p_item_name text,
  p_quantity numeric,
  p_unit text,
  p_reason text,
  p_verified_by text,
  p_checklist jsonb
)
returns public.branch_waste_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  stock_row public.branch_stock%rowtype;
  created public.branch_waste_logs;
  available_quantity numeric;
  actor_name text;
begin
  select * into actor
  from public.require_app_staff(
    array[
      'receiver_snb',
      'admin_snb',
      'branch_snb',
      'receiver_vrsnb',
      'admin_vrsnb',
      'branch_vrsnb',
      'admin',
      'owner'
    ],
    p_branch
  )
  limit 1;

  if actor.id is null then
    raise exception 'SESSION_REQUIRED';
  end if;
  if p_branch not in ('SNB', 'VRSNB') then
    raise exception 'This stock movement RPC only accepts SNB or VRSNB';
  end if;
  if p_log_type not in ('Dump', 'Damage', 'Trans Out') then
    raise exception 'Invalid stock movement type';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;
  if btrim(coalesce(p_reason, '')) = ''
     or btrim(coalesce(p_verified_by, '')) = '' then
    raise exception 'Reason and verified by are required';
  end if;

  actor_name := case
    when actor.role = 'receiver_snb' then 'SNB Order - ' || actor.username
    when actor.role = 'receiver_vrsnb' then 'VRSNB Order - ' || actor.username
    else actor.username
  end;

  perform pg_advisory_xact_lock(
    hashtext(
      p_branch || '_WASTE:' ||
      coalesce(p_item_barcode::text, lower(btrim(p_item_name)))
    )
  );

  select * into stock_row
  from public.branch_stock
  where branch = p_branch
    and (
      (p_item_barcode is not null and item_barcode = p_item_barcode)
      or (
        p_item_barcode is null
        and lower(btrim(item_name)) = lower(btrim(p_item_name))
      )
    )
  order by updated_at desc nulls last, id
  limit 1
  for update;

  if stock_row.id is null then
    raise exception 'Stock item not found';
  end if;

  available_quantity := greatest(
    coalesce(stock_row.quantity, 0) -
    coalesce(stock_row.reserved_quantity, 0),
    0
  );

  if available_quantity < round(p_quantity, 3) then
    raise exception 'Insufficient unreserved stock. Available %, requested %',
      round(available_quantity, 3),
      round(p_quantity, 3);
  end if;

  insert into public.branch_waste_logs(
    branch,
    log_type,
    item_barcode,
    item_name,
    quantity,
    unit,
    reason,
    verified_by,
    checklist,
    created_by_user_id,
    created_by_username
  ) values (
    p_branch,
    p_log_type,
    coalesce(p_item_barcode, stock_row.item_barcode),
    stock_row.item_name,
    round(p_quantity, 3),
    coalesce(nullif(lower(btrim(p_unit)), ''), stock_row.unit, 'pcs'),
    btrim(p_reason),
    btrim(p_verified_by),
    coalesce(p_checklist, '[]'::jsonb),
    actor.id,
    actor_name
  )
  returning * into created;

  update public.branch_stock
  set quantity = round(quantity - created.quantity, 3),
      updated_at = now(),
      last_updated_at = now(),
      last_updated_by = actor_name
  where id = stock_row.id;

  insert into public.branch_stock_adjustments(
    branch,
    item_name,
    old_quantity,
    new_quantity,
    delta,
    reason,
    adjusted_by,
    adjusted_at,
    reference_id,
    notes,
    metadata
  ) values (
    p_branch,
    stock_row.item_name,
    stock_row.quantity,
    round(stock_row.quantity - created.quantity, 3),
    -created.quantity,
    case
      when created.log_type = 'Trans Out' then 'Transfer Out'
      else 'Waste - ' || created.log_type
    end,
    actor_name,
    now(),
    created.id::text,
    created.reason,
    jsonb_build_object(
      'itemBarcode', stock_row.item_barcode,
      'verifiedBy', created.verified_by,
      'checklist', created.checklist,
      'sourceRole', actor.role,
      'sourceLabel', case
        when actor.role = 'receiver_snb' then 'SNB Order'
        when actor.role = 'receiver_vrsnb' then 'VRSNB Order'
        else p_branch || ' Admin'
      end,
      'referenceNo',
        upper(created.log_type) || '-' || left(created.id::text, 8)
    )
  );

  return created;
end;
$$;

-- The secured RPC above owns the complete stock mutation. The legacy trigger
-- repeated the deduction and had a separate stale role list.
alter table public.branch_waste_logs
  disable trigger apply_branch_waste_stock_deduction;

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
  if c.staff_id is null then
    raise exception 'SESSION_REQUIRED';
  end if;

  if p_branch = 'SNB'
     and c.role not in (
       'receiver_snb', 'branch_snb', 'admin_snb', 'admin', 'owner'
     ) then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;

  if p_branch = 'VRSNB'
     and c.role not in (
       'receiver_vrsnb', 'branch_vrsnb', 'admin_vrsnb', 'admin', 'owner'
     ) then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;

  if p_branch not in ('SNB', 'VRSNB') then
    raise exception 'Invalid branch';
  end if;
  if btrim(coalesce(p_source_id, '')) = '' then
    raise exception 'Reservation source is required';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Items must be an array';
  end if;

  actor := coalesce(nullif(trim(p_created_by), ''), c.username);

  select count(*) into existing_count
  from public.branch_stock_reservations
  where branch = p_branch
    and source_type = p_source_type
    and source_id = p_source_id
    and status = 'active';

  if existing_count > 0 then
    return jsonb_build_object(
      'reserved', true,
      'duplicate', true,
      'lineCount', existing_count
    );
  end if;

  for line in select value from jsonb_array_elements(p_items) loop
    if coalesce((line ->> 'isCustom')::boolean, false) then
      continue;
    end if;

    qty := round(coalesce((line ->> 'quantity')::numeric, 0), 3);
    if qty <= 0 then
      raise exception 'Invalid reservation quantity';
    end if;

    select * into stock_row
    from public.branch_stock
    where branch = p_branch
      and (
        (
          nullif(line ->> 'barcode', '') is not null
          and item_barcode = (line ->> 'barcode')::bigint
        )
        or (
          nullif(line ->> 'barcode', '') is null
          and lower(btrim(item_name)) =
              lower(btrim(line ->> 'itemName'))
        )
      )
    order by case
      when nullif(line ->> 'barcode', '') is not null
       and item_barcode = (line ->> 'barcode')::bigint then 0
      else 1
    end
    limit 1
    for update;

    if stock_row.id is null then
      raise exception 'Stock item not found for %', line ->> 'itemName';
    end if;

    if coalesce(stock_row.quantity, 0) -
       coalesce(stock_row.reserved_quantity, 0) < qty then
      raise exception 'Only % available for %',
        round(
          coalesce(stock_row.quantity, 0) -
          coalesce(stock_row.reserved_quantity, 0),
          3
        ),
        stock_row.item_name;
    end if;

    update public.branch_stock
    set reserved_quantity = round(
          coalesce(reserved_quantity, 0) + qty,
          3
        ),
        updated_at = now(),
        last_updated_at = now(),
        last_updated_by = actor
    where id = stock_row.id;

    insert into public.branch_stock_reservations(
      branch,
      source_type,
      source_id,
      item_name,
      item_barcode,
      quantity,
      created_by
    ) values (
      p_branch,
      p_source_type,
      p_source_id,
      stock_row.item_name,
      stock_row.item_barcode,
      qty,
      actor
    );

    reserved_count := reserved_count + 1;
  end loop;

  return jsonb_build_object(
    'reserved', true,
    'lineCount', reserved_count
  );
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
  created public.branch_advance_orders%rowtype;
  counter_id uuid;
  actor text;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then
    raise exception 'SESSION_REQUIRED';
  end if;

  if p_branch = 'SNB'
     and c.role not in (
       'receiver_snb', 'branch_snb', 'admin_snb', 'admin', 'owner'
     ) then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;

  if p_branch = 'VRSNB'
     and c.role not in (
       'receiver_vrsnb', 'branch_vrsnb', 'admin_vrsnb', 'admin', 'owner'
     ) then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;

  if p_branch not in ('SNB', 'VRSNB') then
    raise exception 'Invalid branch';
  end if;
  if btrim(coalesce(p_customer_name, '')) = ''
     or btrim(coalesce(p_notes, '')) = '' then
    raise exception 'Customer and complete-order note are required';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Add at least one item';
  end if;
  if p_delivery_date is null or p_delivery_date < current_date then
    raise exception 'Choose today or a future delivery date';
  end if;

  balance_value := round(
    coalesce(p_subtotal, 0) - coalesce(p_advance_amount, 0),
    2
  );
  actor := coalesce(nullif(trim(p_sold_by), ''), c.username);

  if p_subtotal <= 0
     or p_advance_amount < 0
     or balance_value < 0 then
    raise exception 'Invalid order or advance amount';
  end if;
  if p_advance_amount > 0
     and lower(p_advance_method) not in ('cash', 'upi', 'card') then
    raise exception 'Invalid advance payment mode';
  end if;

  perform public.reserve_branch_stock_items(
    p_branch,
    'branch_advance_order',
    order_id::text,
    p_items,
    actor
  );

  insert into public.branch_advance_orders(
    id,
    branch,
    customer_name,
    items,
    subtotal,
    advance_amount,
    advance_method,
    balance_due,
    sold_by,
    status,
    delivery_date,
    notes,
    reservation_status
  ) values (
    order_id,
    p_branch,
    btrim(p_customer_name),
    p_items,
    round(p_subtotal, 2),
    round(p_advance_amount, 2),
    lower(coalesce(nullif(p_advance_method, ''), 'cash')),
    balance_value,
    actor,
    'pending',
    p_delivery_date,
    btrim(p_notes),
    'reserved'
  )
  returning * into created;

  if p_advance_amount > 0 then
    counter_id := public.find_open_counter_session(p_branch, c.staff_id);

    insert into public.branch_advance_payments(
      advance_order_id,
      branch,
      order_no,
      payment_mode,
      amount,
      payment_stage,
      collected_by,
      remarks,
      collector_user_id,
      collector_username,
      counter_session_id
    ) values (
      order_id,
      p_branch,
      order_id::text,
      lower(p_advance_method),
      round(p_advance_amount, 2),
      'advance',
      actor,
      'Initial advance',
      c.staff_id,
      c.username,
      counter_id
    );

    insert into public.branch_sale_payments(
      advance_order_id,
      branch,
      bill_no,
      payment_mode,
      amount,
      payment_purpose,
      remarks,
      collected_by,
      collected_role,
      cashier_user_id,
      cashier_username,
      counter_session_id
    ) values (
      order_id,
      p_branch,
      order_id::text,
      lower(p_advance_method),
      round(p_advance_amount, 2),
      'advance_payment',
      'Initial advance',
      actor,
      c.role,
      c.staff_id,
      c.username,
      counter_id
    );
  end if;

  return to_jsonb(created);
end;
$$;

create or replace function public.create_snb_purchase_return_secure(
  p_purchase_invoice_id uuid,
  p_return_date date,
  p_reason_type text,
  p_settlement_type text,
  p_credit_note_no text,
  p_reference_no text,
  p_remarks text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  invoice_row record;
  invoice_item record;
  stock_row public.branch_stock%rowtype;
  item jsonb;
  return_id uuid;
  return_no text;
  quantity_value numeric;
  prior_returned numeric;
  invoice_returnable numeric;
  live_available numeric;
  ratio numeric;
  line_tax numeric;
  line_discount numeric;
  line_value numeric;
  total_value numeric := 0;
  financial_adjustment numeric := 0;
  actor_name text;
  effective_return_date date;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then
    raise exception 'SESSION_REQUIRED';
  end if;
  if c.role not in ('receiver_snb', 'admin_snb', 'admin', 'owner') then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;

  actor_name := case
    when c.role = 'receiver_snb' then 'SNB Order - ' || c.username
    else c.username
  end;

  if p_reason_type not in (
    'Damaged',
    'Expired',
    'Quality Issue',
    'Short Received',
    'Wrong Item',
    'Other'
  ) then
    raise exception 'Select a valid return reason';
  end if;
  if p_settlement_type not in (
    'Credit Note',
    'Replacement',
    'Cash Refund',
    'Bank Refund',
    'Pending',
    'No Financial Adjustment'
  ) then
    raise exception 'Select a valid settlement type';
  end if;
  if length(btrim(coalesce(p_remarks, ''))) < 5 then
    raise exception 'Clear return remarks are required';
  end if;
  if p_settlement_type = 'Credit Note'
     and btrim(coalesce(p_credit_note_no, '')) = '' then
    raise exception 'Credit note number is required';
  end if;
  if p_settlement_type in ('Cash Refund', 'Bank Refund')
     and btrim(coalesce(p_reference_no, '')) = '' then
    raise exception 'Refund reference is required';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Select at least one return item';
  end if;

  select * into invoice_row
  from public.snb_purchase_invoices
  where id = p_purchase_invoice_id
  for update;

  if invoice_row.id is null then
    raise exception 'Purchase invoice not found';
  end if;
  if invoice_row.sync_status <> 'Synced'
     or coalesce(invoice_row.revision_pending, false) then
    raise exception 'Re-sync the purchase invoice before creating a return';
  end if;

  effective_return_date := coalesce(p_return_date, current_date);
  if effective_return_date > current_date then
    raise exception 'Return date cannot be in the future';
  end if;
  if effective_return_date < invoice_row.invoice_date then
    raise exception 'Return date cannot be before the invoice date';
  end if;

  return_no :=
    'SNB-PR-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISSMS');

  insert into public.snb_purchase_returns(
    return_no,
    purchase_invoice_id,
    supplier_name,
    invoice_number,
    return_date,
    reason_type,
    settlement_type,
    credit_note_no,
    reference_no,
    remarks,
    total_amount,
    entered_by,
    entered_by_user_id,
    app_session_id
  ) values (
    return_no,
    invoice_row.id,
    invoice_row.supplier_name,
    invoice_row.invoice_number,
    effective_return_date,
    p_reason_type,
    p_settlement_type,
    nullif(btrim(coalesce(p_credit_note_no, '')), ''),
    nullif(btrim(coalesce(p_reference_no, '')), ''),
    btrim(p_remarks),
    0,
    actor_name,
    c.staff_id,
    c.app_session_id
  )
  returning id into return_id;

  for item in select value from jsonb_array_elements(p_items) loop
    quantity_value := round(
      coalesce((item ->> 'quantity')::numeric, 0),
      3
    );
    if quantity_value <= 0 then
      raise exception 'Return quantity must be positive';
    end if;
    if length(btrim(coalesce(item ->> 'item_reason', ''))) < 3 then
      raise exception 'Item damage details are required';
    end if;

    select * into invoice_item
    from public.snb_purchase_invoice_items
    where id = (item ->> 'purchase_invoice_item_id')::uuid
      and purchase_invoice_id = invoice_row.id
    for update;

    if invoice_item.id is null then
      raise exception 'Invoice item not found';
    end if;

    select coalesce(sum(quantity), 0) into prior_returned
    from public.snb_purchase_return_items
    where purchase_invoice_item_id = invoice_item.id;

    invoice_returnable := greatest(
      coalesce(invoice_item.synced_quantity, 0) - prior_returned,
      0
    );
    if quantity_value > invoice_returnable then
      raise exception 'Return quantity exceeds returnable quantity for %',
        invoice_item.item_name;
    end if;

    select * into stock_row
    from public.branch_stock
    where branch = 'SNB'
      and lower(btrim(item_name)) = lower(btrim(invoice_item.item_name))
    order by updated_at desc
    limit 1
    for update;

    if stock_row.id is null then
      raise exception 'SNB stock row not found for %',
        invoice_item.item_name;
    end if;

    live_available := greatest(
      coalesce(stock_row.quantity, 0) -
      coalesce(stock_row.reserved_quantity, 0),
      0
    );
    if live_available < quantity_value then
      raise exception 'Insufficient unreserved stock for %. Available %',
        invoice_item.item_name,
        round(live_available, 3);
    end if;

    ratio := case
      when coalesce(invoice_item.quantity, 0) > 0
        then quantity_value / invoice_item.quantity
      else 0
    end;
    line_tax := round(coalesce(invoice_item.tax, 0) * ratio, 2);
    line_discount := round(
      coalesce(invoice_item.discount, 0) * ratio,
      2
    );
    line_value := round(
      greatest(
        quantity_value * coalesce(invoice_item.rate, 0) +
        line_tax -
        line_discount,
        0
      ),
      2
    );

    update public.branch_stock
    set quantity = round(quantity - quantity_value, 3),
        last_updated_at = now(),
        updated_at = now(),
        last_updated_by = actor_name
    where id = stock_row.id;

    update public.snb_stock
    set current_stock = greatest(
          round(current_stock - quantity_value, 3),
          0
        ),
        last_updated_by = actor_name,
        updated_at = now()
    where lower(btrim(item_name)) =
          lower(btrim(invoice_item.item_name));

    insert into public.snb_purchase_return_items(
      purchase_return_id,
      purchase_invoice_item_id,
      item_name,
      quantity,
      unit,
      rate,
      tax,
      discount,
      line_total,
      item_reason,
      batch_no,
      expiry_date,
      stock_before,
      stock_after
    ) values (
      return_id,
      invoice_item.id,
      invoice_item.item_name,
      quantity_value,
      invoice_item.unit,
      invoice_item.rate,
      line_tax,
      line_discount,
      line_value,
      btrim(item ->> 'item_reason'),
      nullif(btrim(coalesce(item ->> 'batch_no', '')), ''),
      nullif(item ->> 'expiry_date', '')::date,
      round(stock_row.quantity, 3),
      round(stock_row.quantity - quantity_value, 3)
    );

    insert into public.branch_stock_adjustments(
      branch,
      item_name,
      old_quantity,
      new_quantity,
      delta,
      reason,
      adjusted_by,
      adjusted_at,
      reference_id,
      notes,
      metadata
    ) values (
      'SNB',
      invoice_item.item_name,
      round(stock_row.quantity, 3),
      round(stock_row.quantity - quantity_value, 3),
      -quantity_value,
      'Purchase Return - ' || p_reason_type,
      actor_name,
      now(),
      return_no,
      btrim(item ->> 'item_reason'),
      jsonb_build_object(
        'purchaseReturnId', return_id,
        'purchaseInvoiceId', invoice_row.id,
        'purchaseInvoiceItemId', invoice_item.id,
        'invoiceNumber', invoice_row.invoice_number,
        'itemBarcode', stock_row.item_barcode,
        'settlementType', p_settlement_type,
        'sourceRole', c.role
      )
    );

    total_value := total_value + line_value;
  end loop;

  total_value := round(total_value, 2);
  financial_adjustment := case
    when p_settlement_type in (
      'Credit Note',
      'Cash Refund',
      'Bank Refund'
    ) then total_value
    else 0
  end;

  update public.snb_purchase_returns
  set total_amount = total_value
  where id = return_id;

  update public.snb_purchase_invoices
  set return_amount = round(
        coalesce(return_amount, 0) + financial_adjustment,
        2
      ),
      updated_at = now()
  where id = invoice_row.id;

  insert into public.branch_operation_records(
    branch,
    record_type,
    record_id,
    record_no,
    amount,
    status,
    actor,
    actor_user_id,
    payload
  ) values (
    'SNB',
    'purchase_return',
    return_id::text,
    return_no,
    total_value,
    'Posted',
    actor_name,
    c.staff_id,
    jsonb_build_object(
      'returnId', return_id,
      'returnNo', return_no,
      'invoiceId', invoice_row.id,
      'invoiceNumber', invoice_row.invoice_number,
      'supplier', invoice_row.supplier_name,
      'reasonType', p_reason_type,
      'settlementType', p_settlement_type,
      'total', total_value,
      'financialAdjustment', financial_adjustment,
      'enteredBy', actor_name,
      'sourceRole', c.role,
      'createdAt', now()
    )
  )
  on conflict (branch, record_type, record_id) do update
  set amount = excluded.amount,
      status = excluded.status,
      actor = excluded.actor,
      actor_user_id = excluded.actor_user_id,
      payload = excluded.payload,
      updated_at = now();

  update public.branch_operation_records operation_row
  set payload = coalesce(operation_row.payload, '{}'::jsonb) ||
      jsonb_build_object(
        'paidAmount', invoice_snapshot.paid_amount,
        'returnAmount', invoice_snapshot.return_amount,
        'balanceAmount', invoice_snapshot.balance_amount,
        'syncStatus', invoice_snapshot.sync_status
      ),
      updated_at = now()
  from public.snb_purchase_invoices invoice_snapshot
  where invoice_snapshot.id = invoice_row.id
    and operation_row.branch = 'SNB'
    and operation_row.record_type = 'purchase_invoice'
    and (
      operation_row.record_id = invoice_row.id::text
      or operation_row.payload ->> 'invoiceId' = invoice_row.id::text
    );

  return jsonb_build_object(
    'returnId', return_id,
    'returnNo', return_no,
    'total', total_value,
    'financialAdjustment', financial_adjustment,
    'enteredBy', actor_name
  );
end;
$$;

revoke all on function public.require_app_staff(text[], text) from public;
grant execute on function public.require_app_staff(text[], text)
  to anon, authenticated, service_role;

revoke all on function public.record_branch_waste_secure(
  text, text, bigint, text, numeric, text, text, text, jsonb
) from public;
grant execute on function public.record_branch_waste_secure(
  text, text, bigint, text, numeric, text, text, text, jsonb
) to anon, authenticated, service_role;

revoke all on function public.reserve_branch_stock_items(
  text, text, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.reserve_branch_stock_items(
  text, text, text, jsonb, text
) to service_role;

grant execute on function public.create_branch_advance_order_reserved(
  text, text, jsonb, numeric, numeric, text, text, date, text
) to anon, authenticated, service_role;

grant execute on function public.create_snb_purchase_return_secure(
  uuid, date, text, text, text, text, text, jsonb
) to anon, authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
select pg_notify('pgrst', 'reload config');
