-- Repair UUID lookups in payment allocation edits.
-- PostgreSQL does not provide max(uuid); keep the latest cashier context instead.

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

  select coalesce(
    jsonb_agg(
      jsonb_build_object('mode',lower(payment_mode),'amount',round(amount,2))
      order by created_at,id
    ),
    '[]'::jsonb
  )
  into old_values
  from public.branch_sale_payments
  where bill_id = b.id and coalesce(amount,0) > 0;

  select cashier_user_id, cashier_username, counter_session_id
  into cashier_id, cashier_name, session_id
  from public.branch_sale_payments
  where bill_id = b.id and coalesce(amount,0) > 0
  order by created_at desc nulls last, id desc
  limit 1;

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

grant execute on function public.edit_branch_bill_payment_allocations(text,uuid,jsonb,text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
