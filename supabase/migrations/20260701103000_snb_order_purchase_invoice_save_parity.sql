-- Make SNB Order Purchase Invoice identical to SNB Admin while preserving
-- role attribution and the existing audited revision/delta-sync protections.

create or replace function public.save_snb_purchase_invoice_secure(
  p_invoice_id uuid,
  p_supplier_name text,
  p_invoice_number text,
  p_invoice_date date,
  p_items jsonb,
  p_payment_method text,
  p_remarks text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  rid uuid;
  total_value numeric;
  actor_name text;
  invoice_status text;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if c.role not in ('receiver_snb', 'admin_snb', 'admin', 'owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;

  actor_name := case
    when c.role = 'receiver_snb' then 'SNB Order - ' || c.username
    else c.username
  end;

  if btrim(coalesce(p_supplier_name, '')) = ''
     or btrim(coalesce(p_invoice_number, '')) = '' then
    raise exception 'Supplier and invoice number are required';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Add at least one item';
  end if;

  select round(coalesce(sum(greatest(
    coalesce(x.total_amount, x.quantity * x.rate + coalesce(x.tax, 0) - coalesce(x.discount, 0)),
    0
  )), 0), 2)
  into total_value
  from jsonb_to_recordset(p_items) as x(
    item_name text,
    quantity numeric,
    unit text,
    rate numeric,
    tax numeric,
    discount numeric,
    total_amount numeric
  );

  if p_invoice_id is null then
    insert into public.snb_purchase_invoices(
      supplier_name, invoice_number, invoice_date, total_amount, paid_amount,
      balance_amount, payment_method, sync_status, remarks, created_by
    ) values (
      btrim(p_supplier_name),
      btrim(p_invoice_number),
      coalesce(p_invoice_date, current_date),
      total_value,
      0,
      total_value,
      lower(coalesce(nullif(btrim(p_payment_method), ''), 'credit')),
      'Not Synced',
      nullif(btrim(coalesce(p_remarks, '')), ''),
      actor_name
    )
    returning id, sync_status into rid, invoice_status;
  else
    select sync_status into invoice_status
    from public.snb_purchase_invoices
    where id = p_invoice_id
    for update;

    if invoice_status is null then raise exception 'Purchase invoice not found'; end if;
    if invoice_status in ('Synced', 'Re-sync Required') then
      raise exception 'Use the audited revision workflow for a synced purchase invoice';
    end if;

    update public.snb_purchase_invoices
    set supplier_name = btrim(p_supplier_name),
        invoice_number = btrim(p_invoice_number),
        invoice_date = coalesce(p_invoice_date, current_date),
        total_amount = total_value,
        payment_method = lower(coalesce(nullif(btrim(p_payment_method), ''), 'credit')),
        remarks = nullif(btrim(coalesce(p_remarks, '')), ''),
        updated_at = now()
    where id = p_invoice_id
    returning id, sync_status into rid, invoice_status;

    delete from public.snb_purchase_invoice_items
    where purchase_invoice_id = rid;
  end if;

  insert into public.snb_purchase_invoice_items(
    purchase_invoice_id, item_name, quantity, unit, rate, tax, discount,
    total_amount, synced_quantity
  )
  select
    rid,
    btrim(x.item_name),
    round(x.quantity, 3),
    lower(coalesce(nullif(btrim(x.unit), ''), 'pcs')),
    round(x.rate, 2),
    round(coalesce(x.tax, 0), 2),
    round(coalesce(x.discount, 0), 2),
    round(greatest(
      coalesce(x.total_amount, x.quantity * x.rate + coalesce(x.tax, 0) - coalesce(x.discount, 0)),
      0
    ), 2),
    0
  from jsonb_to_recordset(p_items) as x(
    item_name text,
    quantity numeric,
    unit text,
    rate numeric,
    tax numeric,
    discount numeric,
    total_amount numeric
  );

  insert into public.branch_operation_records(
    branch, record_type, record_id, record_no, amount, status, actor, payload
  ) values (
    'SNB',
    'purchase_invoice',
    rid::text,
    btrim(p_invoice_number),
    total_value,
    coalesce(invoice_status, 'Not Synced'),
    actor_name,
    jsonb_build_object(
      'invoiceId', rid,
      'invoiceNumber', btrim(p_invoice_number),
      'invoiceNo', btrim(p_invoice_number),
      'invoiceDate', coalesce(p_invoice_date, current_date),
      'supplier', btrim(p_supplier_name),
      'total', total_value,
      'paymentMethod', lower(coalesce(nullif(btrim(p_payment_method), ''), 'credit')),
      'syncStatus', coalesce(invoice_status, 'Not Synced'),
      'remarks', nullif(btrim(coalesce(p_remarks, '')), ''),
      'items', p_items,
      'sourceRole', c.role,
      'sourceLabel', case when c.role = 'receiver_snb' then 'SNB Order' else 'SNB Admin' end,
      'enteredBy', actor_name,
      'updatedAt', now()
    )
  )
  on conflict (branch, record_type, record_id) do update
  set record_no = excluded.record_no,
      amount = excluded.amount,
      status = excluded.status,
      actor = excluded.actor,
      payload = excluded.payload,
      updated_at = now();

  return jsonb_build_object(
    'invoiceId', rid,
    'invoiceNumber', btrim(p_invoice_number),
    'total', total_value,
    'status', coalesce(invoice_status, 'Not Synced'),
    'enteredBy', actor_name
  );
end;
$$;

revoke all on function public.save_snb_purchase_invoice_secure(uuid,text,text,date,jsonb,text,text) from public;
grant execute on function public.save_snb_purchase_invoice_secure(uuid,text,text,date,jsonb,text,text)
  to anon, authenticated, service_role;

select pg_notify('pgrst','reload schema');
