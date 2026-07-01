-- Allow controlled edits of already-synced SNB purchase invoices.
-- Edits create an auditable revision and require a second, delta-only stock sync.

alter table public.snb_purchase_invoices
  add column if not exists revision_number integer not null default 0,
  add column if not exists revision_pending boolean not null default false,
  add column if not exists last_edit_reason text;

alter table public.admin_notifications drop constraint if exists admin_notifications_type_check;
alter table public.admin_notifications add constraint admin_notifications_type_check check (
  type in (
    'invoice_pending', 'baker_shortage', 'packing_discrepancy',
    'packing_remainder', 'low_stock', 'credit_sale', 'price_change',
    'snb_purchase_invoice_revision', 'store_item_change', 'recipe_change'
  )
);

-- Revision snapshots are stored in the existing branch_operation_records audit ledger
-- with record_type = purchase_invoice_revision. This avoids a second competing
-- source of truth while preserving every before/after revision permanently.

-- Direct table writes remain locked. Only the secure revision/sync functions set
-- transaction-local flags that allow changes to a synced invoice.
create or replace function public.guard_snb_purchase_invoice_header()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.sync_status in ('Synced', 'Re-sync Required')
     and (new.supplier_name, new.invoice_number, new.invoice_date, new.total_amount)
         is distinct from
         (old.supplier_name, old.invoice_number, old.invoice_date, old.total_amount)
     and coalesce(current_setting('app.snb_purchase_revision', true), '') <> 'on'
  then
    raise exception 'Synced purchase invoices can only be changed through the audited revision workflow';
  end if;

  if coalesce(new.total_amount, 0) < coalesce(new.paid_amount, 0) + coalesce(new.return_amount, 0) then
    raise exception 'Invoice total cannot be below paid and adjusted amounts';
  end if;

  new.balance_amount := greatest(
    round(coalesce(new.total_amount, 0) - coalesce(new.paid_amount, 0) - coalesce(new.return_amount, 0), 2),
    0
  );
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.guard_snb_purchase_invoice_item_changes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  invoice_id_value uuid;
  invoice_status text;
begin
  if tg_op = 'DELETE' then
    invoice_id_value := old.purchase_invoice_id;
  else
    invoice_id_value := new.purchase_invoice_id;
  end if;
  select sync_status into invoice_status
  from public.snb_purchase_invoices
  where id = invoice_id_value;

  if invoice_status in ('Synced', 'Re-sync Required')
     and coalesce(current_setting('app.snb_purchase_revision', true), '') <> 'on'
     and coalesce(current_setting('app.snb_purchase_stock_sync', true), '') <> 'on'
  then
    raise exception 'Synced purchase invoice items can only be changed through the audited revision workflow';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.save_snb_purchase_invoice_revision_secure(
  p_invoice_id uuid,
  p_supplier_name text,
  p_invoice_number text,
  p_invoice_date date,
  p_items jsonb,
  p_payment_method text,
  p_remarks text,
  p_edit_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  inv record;
  line jsonb;
  existing_item_id uuid;
  existing_item_name text;
  normalized_name text;
  line_quantity numeric;
  line_rate numeric;
  line_tax numeric;
  line_discount numeric;
  line_total numeric;
  total_value numeric := 0;
  old_snapshot_value jsonb := '[]'::jsonb;
  new_snapshot_value jsonb := '[]'::jsonb;
  delta_snapshot_value jsonb := '[]'::jsonb;
  next_revision integer;
  duplicate_count integer;
  returned_row record;
  desired_quantity numeric;
  recipient text;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if c.role not in ('admin_snb', 'admin', 'owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;

  if p_invoice_id is null then raise exception 'Purchase invoice is required'; end if;
  if length(btrim(coalesce(p_edit_reason, ''))) < 5 then
    raise exception 'Enter a clear reason for editing the synced invoice';
  end if;
  if btrim(coalesce(p_supplier_name, '')) = '' or btrim(coalesce(p_invoice_number, '')) = '' then
    raise exception 'Supplier and invoice number are required';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Add at least one item';
  end if;

  select * into inv
  from public.snb_purchase_invoices
  where id = p_invoice_id
  for update;

  if inv.id is null then raise exception 'Purchase invoice not found'; end if;
  if inv.sync_status not in ('Synced', 'Re-sync Required') then
    raise exception 'Use the normal invoice save workflow until the first stock sync is complete';
  end if;

  select count(*) - count(distinct lower(regexp_replace(btrim(x.item_name), '\s+', ' ', 'g')))
  into duplicate_count
  from jsonb_to_recordset(p_items) as x(item_name text);

  if duplicate_count > 0 then
    raise exception 'Each item can appear only once in a purchase invoice';
  end if;

  for line in select value from jsonb_array_elements(p_items)
  loop
    normalized_name := lower(regexp_replace(btrim(coalesce(line->>'item_name', '')), '\s+', ' ', 'g'));
    line_quantity := coalesce(nullif(line->>'quantity', '')::numeric, 0);
    line_rate := coalesce(nullif(line->>'rate', '')::numeric, 0);
    line_tax := coalesce(nullif(line->>'tax', '')::numeric, 0);
    line_discount := coalesce(nullif(line->>'discount', '')::numeric, 0);

    if normalized_name = '' then raise exception 'Invoice item name is required'; end if;
    if line_quantity <= 0 then raise exception 'Invoice quantity must be greater than zero for %', line->>'item_name'; end if;
    if line_rate < 0 then raise exception 'Invoice rate cannot be negative for %', line->>'item_name'; end if;
    if line_tax < 0 or line_discount < 0 then raise exception 'Tax and discount cannot be negative for %', line->>'item_name'; end if;

    line_total := round(greatest(
      coalesce(
        nullif(line->>'total_amount', '')::numeric,
        line_quantity * line_rate + line_tax - line_discount
      ),
      0
    ), 2);
    total_value := total_value + line_total;
  end loop;

  total_value := round(total_value, 2);
  if total_value < coalesce(inv.paid_amount, 0) + coalesce(inv.return_amount, 0) then
    raise exception 'Invoice total cannot be below paid and adjusted amounts';
  end if;

  -- An edited quantity may never fall below quantity already returned against
  -- the original invoice item.
  for returned_row in
    select ii.item_name, coalesce(sum(ri.quantity), 0) as returned_quantity
    from public.snb_purchase_invoice_items ii
    join public.snb_purchase_return_items ri on ri.purchase_invoice_item_id = ii.id
    where ii.purchase_invoice_id = p_invoice_id
    group by ii.item_name
  loop
    select coalesce(sum(x.quantity), 0)
    into desired_quantity
    from jsonb_to_recordset(p_items) as x(item_name text, quantity numeric)
    where lower(regexp_replace(btrim(x.item_name), '\s+', ' ', 'g')) =
          lower(regexp_replace(btrim(returned_row.item_name), '\s+', ' ', 'g'));

    if desired_quantity < returned_row.returned_quantity then
      raise exception 'Quantity for % cannot be below the already returned quantity of %',
        returned_row.item_name, returned_row.returned_quantity;
    end if;
  end loop;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'itemId', id,
      'itemName', item_name,
      'quantity', quantity,
      'syncedQuantity', synced_quantity,
      'unit', unit,
      'rate', rate,
      'tax', tax,
      'discount', discount,
      'totalAmount', total_amount
    ) order by item_name, created_at
  ), '[]'::jsonb)
  into old_snapshot_value
  from public.snb_purchase_invoice_items
  where purchase_invoice_id = p_invoice_id
    and quantity > 0;

  next_revision := coalesce(inv.revision_number, 0) + 1;
  perform set_config('app.snb_purchase_revision', 'on', true);

  -- Move the header out of the fully-synced state before editing item rows.
  -- This is compatible with older item guards that lock only exact Synced rows.
  update public.snb_purchase_invoices
  set sync_status = 'Re-sync Required',
      revision_pending = true,
      updated_at = now()
  where id = p_invoice_id;

  -- Keep historical item IDs (purchase returns point to them). Removed items
  -- retain their IDs with desired quantity zero, so re-sync deducts only their
  -- previously synced quantity.
  update public.snb_purchase_invoice_items
  set quantity = 0,
      total_amount = 0
  where purchase_invoice_id = p_invoice_id;

  for line in select value from jsonb_array_elements(p_items)
  loop
    normalized_name := lower(regexp_replace(btrim(line->>'item_name'), '\s+', ' ', 'g'));
    line_quantity := round((line->>'quantity')::numeric, 3);
    line_rate := round(coalesce((line->>'rate')::numeric, 0), 2);
    line_tax := round(coalesce((line->>'tax')::numeric, 0), 2);
    line_discount := round(coalesce((line->>'discount')::numeric, 0), 2);
    line_total := round(greatest(
      coalesce(
        nullif(line->>'total_amount', '')::numeric,
        line_quantity * line_rate + line_tax - line_discount
      ),
      0
    ), 2);

    select id, item_name
    into existing_item_id, existing_item_name
    from public.snb_purchase_invoice_items
    where purchase_invoice_id = p_invoice_id
      and lower(regexp_replace(btrim(item_name), '\s+', ' ', 'g')) = normalized_name
    order by synced_quantity desc, created_at asc
    limit 1
    for update;

    if existing_item_id is null then
      insert into public.snb_purchase_invoice_items(
        purchase_invoice_id, item_name, quantity, unit, rate, tax, discount,
        total_amount, synced_quantity
      ) values (
        p_invoice_id,
        btrim(line->>'item_name'),
        line_quantity,
        lower(coalesce(nullif(btrim(line->>'unit'), ''), 'pcs')),
        line_rate,
        line_tax,
        line_discount,
        line_total,
        0
      );
    else
      update public.snb_purchase_invoice_items
      set item_name = btrim(line->>'item_name'),
          quantity = line_quantity,
          unit = lower(coalesce(nullif(btrim(line->>'unit'), ''), 'pcs')),
          rate = line_rate,
          tax = line_tax,
          discount = line_discount,
          total_amount = line_total
      where id = existing_item_id;
    end if;

    existing_item_id := null;
    existing_item_name := null;
  end loop;

  update public.snb_purchase_invoices
  set supplier_name = btrim(p_supplier_name),
      invoice_number = btrim(p_invoice_number),
      invoice_date = coalesce(p_invoice_date, current_date),
      total_amount = total_value,
      payment_method = lower(coalesce(nullif(btrim(p_payment_method), ''), 'credit')),
      remarks = nullif(btrim(coalesce(p_remarks, '')), ''),
      sync_status = 'Re-sync Required',
      revision_pending = true,
      revision_number = next_revision,
      last_edit_reason = btrim(p_edit_reason),
      updated_at = now()
  where id = p_invoice_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'itemId', id,
      'itemName', item_name,
      'quantity', quantity,
      'syncedQuantity', synced_quantity,
      'unit', unit,
      'rate', rate,
      'tax', tax,
      'discount', discount,
      'totalAmount', total_amount
    ) order by item_name, created_at
  ), '[]'::jsonb)
  into new_snapshot_value
  from public.snb_purchase_invoice_items
  where purchase_invoice_id = p_invoice_id
    and quantity > 0;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'itemName', item_name,
      'unit', unit,
      'syncedQuantity', synced_quantity,
      'newQuantity', quantity,
      'delta', delta
    ) order by item_name
  ), '[]'::jsonb)
  into delta_snapshot_value
  from (
    select
      min(item_name) as item_name,
      min(unit) as unit,
      round(sum(coalesce(synced_quantity, 0)), 3) as synced_quantity,
      round(sum(coalesce(quantity, 0)), 3) as quantity,
      round(sum(coalesce(quantity, 0) - coalesce(synced_quantity, 0)), 3) as delta
    from public.snb_purchase_invoice_items
    where purchase_invoice_id = p_invoice_id
    group by lower(regexp_replace(btrim(item_name), '\s+', ' ', 'g'))
    having abs(sum(coalesce(quantity, 0) - coalesce(synced_quantity, 0))) > 0.0001
  ) changes;

  insert into public.branch_operation_records(
    branch, record_type, record_id, record_no, amount, status, actor, payload
  ) values (
    'SNB',
    'purchase_invoice_revision',
    p_invoice_id::text || ':' || next_revision::text,
    btrim(p_invoice_number),
    total_value,
    'Pending Re-sync',
    c.username,
    jsonb_build_object(
      'invoiceId', p_invoice_id,
      'invoiceNumber', btrim(p_invoice_number),
      'supplierName', btrim(p_supplier_name),
      'revisionNumber', next_revision,
      'status', 'Pending Re-sync',
      'editReason', btrim(p_edit_reason),
      'editedBy', c.username,
      'editedByUserId', c.staff_id,
      'editedAt', now(),
      'oldTotal', inv.total_amount,
      'newTotal', total_value,
      'oldSnapshot', old_snapshot_value,
      'newSnapshot', new_snapshot_value,
      'changes', delta_snapshot_value
    )
  )
  on conflict (branch, record_type, record_id) do update
  set record_no = excluded.record_no,
      amount = excluded.amount,
      status = excluded.status,
      actor = excluded.actor,
      payload = excluded.payload,
      updated_at = now();

  foreach recipient in array array['admin_snb', 'admin', 'owner']
  loop
    insert into public.admin_notifications(
      type, title, body, ref_id, ref_label, meta, is_read, recipient_role
    ) values (
      'snb_purchase_invoice_revision',
      'Synced SNB purchase invoice edited',
      format(
        'Invoice %s from %s was edited by %s. Stock re-sync is required.',
        btrim(p_invoice_number), btrim(p_supplier_name), c.username
      ),
      p_invoice_id::text,
      btrim(p_invoice_number),
      jsonb_build_object(
        'invoiceId', p_invoice_id,
        'invoiceNumber', btrim(p_invoice_number),
        'supplierName', btrim(p_supplier_name),
        'revisionNumber', next_revision,
        'status', 'Pending Re-sync',
        'editReason', btrim(p_edit_reason),
        'editedBy', c.username,
        'editedAt', now(),
        'oldTotal', inv.total_amount,
        'newTotal', total_value,
        'changes', delta_snapshot_value,
        'oldSnapshot', old_snapshot_value,
        'newSnapshot', new_snapshot_value
      ),
      false,
      recipient
    );
  end loop;

  return jsonb_build_object(
    'invoiceId', p_invoice_id,
    'revisionNumber', next_revision,
    'status', 'Re-sync Required',
    'total', total_value,
    'changes', delta_snapshot_value
  );
end;
$$;

revoke all on function public.save_snb_purchase_invoice_revision_secure(uuid,text,text,date,jsonb,text,text,text) from public;
grant execute on function public.save_snb_purchase_invoice_revision_secure(uuid,text,text,date,jsonb,text,text,text)
  to anon, authenticated, service_role;

-- Delta-only stock synchronization. Positive changes add stock; negative changes
-- deduct stock only when enough unreserved live stock is available.
create or replace function public.snb_sync_purchase_invoice_to_stock(
  p_invoice_id uuid,
  p_synced_by text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  inv record;
  item record;
  stock_row record;
  old_qty numeric;
  new_qty numeric;
  delta_qty numeric;
  normalized_unit text;
  actor_name text;
  free_quantity numeric;
  latest_revision integer;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if c.role not in ('admin_snb', 'admin', 'owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;

  select * into inv
  from public.snb_purchase_invoices
  where id = p_invoice_id
  for update;

  if inv.id is null then raise exception 'Purchase invoice not found'; end if;
  if inv.sync_status = 'Synced' and not coalesce(inv.revision_pending, false) then
    return;
  end if;
  if inv.sync_status not in ('Not Synced', 'Partially Synced', 'Re-sync Required') then
    raise exception 'Purchase invoice is not ready for stock sync';
  end if;

  actor_name := coalesce(nullif(btrim(p_synced_by), ''), c.username);
  perform set_config('app.snb_purchase_stock_sync', 'on', true);

  for item in
    select *
    from public.snb_purchase_invoice_items
    where purchase_invoice_id = p_invoice_id
    order by created_at, id
  loop
    delta_qty := round(coalesce(item.quantity, 0) - coalesce(item.synced_quantity, 0), 3);
    if abs(delta_qty) <= 0.0001 then
      continue;
    end if;

    normalized_unit := case
      when lower(btrim(coalesce(item.unit, ''))) in ('nos','no','number','numbers','pc','pcs','piece','pieces') then 'pcs'
      when lower(btrim(coalesce(item.unit, ''))) in ('kg','kgs','kilogram','kilograms') then 'kg'
      else lower(btrim(coalesce(item.unit, '')))
    end;

    if normalized_unit not in ('pcs', 'kg') then
      raise exception 'Unsupported stock unit "%" for item "%". Use pcs or kg.', item.unit, item.item_name;
    end if;

    perform pg_advisory_xact_lock(hashtext('snb-stock-' || lower(btrim(item.item_name))));

    select * into stock_row
    from public.branch_stock
    where branch = 'SNB'
      and lower(btrim(item_name)) = lower(btrim(item.item_name))
    order by updated_at desc
    limit 1
    for update;

    if stock_row.id is null then
      if delta_qty < 0 then
        raise exception 'Cannot deduct % % of % because the item is not available in SNB stock',
          abs(delta_qty), normalized_unit, item.item_name;
      end if;
      old_qty := 0;
      new_qty := delta_qty;
      insert into public.branch_stock(
        branch, item_name, quantity, min_threshold, unit,
        last_updated_by, last_updated_at, updated_at
      ) values (
        'SNB', btrim(item.item_name), new_qty, 10, normalized_unit,
        actor_name, now(), now()
      );
    else
      old_qty := coalesce(stock_row.quantity, 0);
      free_quantity := greatest(old_qty - coalesce(stock_row.reserved_quantity, 0), 0);
      if delta_qty < 0 and abs(delta_qty) > free_quantity then
        raise exception 'Cannot reduce % by % %. Only % % is currently unreserved and available.',
          item.item_name, abs(delta_qty), normalized_unit, free_quantity, normalized_unit;
      end if;

      new_qty := round(old_qty + delta_qty, 3);
      if new_qty < 0 then
        raise exception 'Cannot reduce % below zero stock', item.item_name;
      end if;

      update public.branch_stock
      set quantity = new_qty,
          unit = normalized_unit,
          last_updated_by = actor_name,
          last_updated_at = now(),
          updated_at = now()
      where id = stock_row.id;
    end if;

    update public.snb_purchase_invoice_items
    set synced_quantity = quantity
    where id = item.id;

    insert into public.branch_stock_adjustments(
      branch, item_name, old_quantity, new_quantity, delta,
      reason, adjusted_by, reference_id, notes
    ) values (
      'SNB', item.item_name, old_qty, new_qty, delta_qty,
      case when inv.sync_status = 'Re-sync Required'
        then 'Purchase Invoice Re-sync'
        else 'Purchase Invoice Stock Sync'
      end,
      actor_name,
      inv.invoice_number,
      case when inv.sync_status = 'Re-sync Required'
        then 'Revision ' || coalesce(inv.revision_number, 0) || ' of purchase invoice ' || inv.invoice_number
        else 'Purchase invoice ' || inv.invoice_number
      end
    );
  end loop;

  update public.snb_purchase_invoices
  set sync_status = 'Synced',
      revision_pending = false,
      synced_at = now(),
      synced_by = actor_name,
      updated_at = now()
  where id = p_invoice_id
  returning revision_number into latest_revision;

  if coalesce(latest_revision, 0) > 0 then
    update public.branch_operation_records
    set status = 'Synced',
        actor = actor_name,
        payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
          'status', 'Synced',
          'resyncedBy', actor_name,
          'resyncedAt', now()
        ),
        updated_at = now()
    where branch = 'SNB'
      and record_type = 'purchase_invoice_revision'
      and record_id = p_invoice_id::text || ':' || latest_revision::text;

    update public.admin_notifications
    set title = 'SNB purchase invoice re-synced',
        body = format(
          'Invoice %s revision %s was re-synced to stock by %s.',
          inv.invoice_number, latest_revision, actor_name
        ),
        meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object(
          'status', 'Synced',
          'resyncedBy', actor_name,
          'resyncedAt', now()
        ),
        is_read = false,
        created_at = now()
    where type = 'snb_purchase_invoice_revision'
      and ref_id = p_invoice_id::text
      and coalesce((meta->>'revisionNumber')::integer, 0) = latest_revision;
  end if;
end;
$$;

revoke all on function public.snb_sync_purchase_invoice_to_stock(uuid,text) from public;
grant execute on function public.snb_sync_purchase_invoice_to_stock(uuid,text)
  to anon, authenticated, service_role;

-- Returns must wait until a pending invoice revision has been re-synced.
create or replace function public.guard_snb_purchase_return_synced_invoice()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  invoice_status text;
begin
  select sync_status into invoice_status
  from public.snb_purchase_invoices
  where id = new.purchase_invoice_id;

  if invoice_status is distinct from 'Synced' then
    raise exception 'Re-sync the edited purchase invoice before creating a purchase return';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_snb_purchase_return_synced_invoice on public.snb_purchase_returns;
create trigger guard_snb_purchase_return_synced_invoice
before insert or update of purchase_invoice_id on public.snb_purchase_returns
for each row execute function public.guard_snb_purchase_return_synced_invoice();

select pg_notify('pgrst', 'reload schema');
