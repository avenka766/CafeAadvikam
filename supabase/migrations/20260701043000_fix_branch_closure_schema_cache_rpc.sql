-- Make branch counter closure independent of PostgREST column-cache refresh timing.
-- The client sends one JSON payload to this RPC; the database writes the closure
-- and finalizes the counter session atomically.

alter table if exists public.branch_daily_closures
  add column if not exists actual_upi numeric(14,2) not null default 0,
  add column if not exists upi_difference numeric(14,2) not null default 0,
  add column if not exists upi_notes text;

alter table if exists public.branch_counter_sessions
  add column if not exists counted_upi numeric(14,2),
  add column if not exists upi_difference numeric(14,2),
  add column if not exists upi_notes text;

create or replace function public.finalize_branch_counter_closure_secure(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  s public.branch_counter_sessions%rowtype;
  v_session_id uuid;
  v_closure_id uuid;
  v_branch text;
  v_actual_upi numeric;
  v_system_upi numeric;
  v_upi_difference numeric;
  v_upi_notes text;
  v_cash_difference numeric;
  v_existing uuid;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if c.role not in ('branch_snb','branch_vrsnb','branch_hosur','admin_snb','admin_vrsnb','admin_hosur','admin','owner') then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;

  v_session_id := nullif(p_payload->>'counter_session_id','')::uuid;
  if v_session_id is null then raise exception 'COUNTER_SESSION_REQUIRED'; end if;

  select * into s
  from public.branch_counter_sessions
  where id = v_session_id
  for update;
  if s.id is null then raise exception 'COUNTER_SESSION_NOT_FOUND'; end if;
  if s.status <> 'open' then raise exception 'COUNTER_SESSION_ALREADY_CLOSED'; end if;

  v_branch := coalesce(nullif(btrim(p_payload->>'branch'),''), s.branch);
  if v_branch <> s.branch then raise exception 'COUNTER_SESSION_BRANCH_MISMATCH'; end if;
  if c.role = 'branch_snb' and v_branch <> 'SNB' then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if c.role = 'branch_vrsnb' and v_branch <> 'VRSNB' then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if c.role = 'branch_hosur' and v_branch <> 'Hosur' then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if c.role in ('branch_snb','branch_vrsnb','branch_hosur') and s.cashier_user_id <> c.staff_id then
    raise exception 'COUNTER_SESSION_OWNERSHIP_MISMATCH';
  end if;

  v_actual_upi := round(coalesce(nullif(p_payload->>'actual_upi','')::numeric,0),2);
  v_system_upi := round(coalesce(nullif(p_payload->>'upi_total','')::numeric,0),2);
  v_upi_difference := round(v_actual_upi - v_system_upi,2);
  v_upi_notes := nullif(btrim(coalesce(p_payload->>'upi_notes','')),'');
  v_cash_difference := round(coalesce(nullif(p_payload->>'difference','')::numeric,0),2);

  if v_actual_upi < 0 then raise exception 'VERIFIED_UPI_CANNOT_BE_NEGATIVE'; end if;
  if abs(v_upi_difference) >= 0.01 and length(coalesce(v_upi_notes,'')) < 3 then
    raise exception 'UPI_AUDIT_REMARKS_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtext('branch-closure-' || v_session_id::text));

  select id into v_existing
  from public.branch_daily_closures
  where counter_session_id = v_session_id
  order by created_at desc
  limit 1
  for update;

  if v_existing is null then
    insert into public.branch_daily_closures(
      branch,closure_date,cashier,cashier_user_id,cashier_username,counter_session_id,
      opening_cash,gross_sales,net_sales,opening_denominations,closing_denominations,
      cash_total,upi_total,actual_upi,upi_difference,upi_notes,card_total,
      credit_billed,credit_collected,advance_collected,advance_balance_collected,
      refunds,expenses,purchase_payments,discounts,tax_total,bill_count,
      duplicate_prints,expected_cash,actual_cash,difference,notes,status
    ) values (
      v_branch,
      coalesce(nullif(p_payload->>'closure_date','')::date,s.business_date),
      coalesce(nullif(btrim(p_payload->>'cashier'),''),s.cashier_username),
      coalesce(nullif(p_payload->>'cashier_user_id','')::uuid,s.cashier_user_id),
      coalesce(nullif(btrim(p_payload->>'cashier_username'),''),s.cashier_username),
      v_session_id,
      round(coalesce(nullif(p_payload->>'opening_cash','')::numeric,s.opening_cash,0),2),
      round(coalesce(nullif(p_payload->>'gross_sales','')::numeric,0),2),
      round(coalesce(nullif(p_payload->>'net_sales','')::numeric,0),2),
      coalesce(p_payload->'opening_denominations','{}'::jsonb),
      coalesce(p_payload->'closing_denominations','{}'::jsonb),
      round(coalesce(nullif(p_payload->>'cash_total','')::numeric,0),2),
      v_system_upi,
      v_actual_upi,
      v_upi_difference,
      v_upi_notes,
      round(coalesce(nullif(p_payload->>'card_total','')::numeric,0),2),
      round(coalesce(nullif(p_payload->>'credit_billed','')::numeric,0),2),
      round(coalesce(nullif(p_payload->>'credit_collected','')::numeric,0),2),
      round(coalesce(nullif(p_payload->>'advance_collected','')::numeric,0),2),
      round(coalesce(nullif(p_payload->>'advance_balance_collected','')::numeric,0),2),
      round(coalesce(nullif(p_payload->>'refunds','')::numeric,0),2),
      round(coalesce(nullif(p_payload->>'expenses','')::numeric,0),2),
      round(coalesce(nullif(p_payload->>'purchase_payments','')::numeric,0),2),
      round(coalesce(nullif(p_payload->>'discounts','')::numeric,0),2),
      round(coalesce(nullif(p_payload->>'tax_total','')::numeric,0),2),
      coalesce(nullif(p_payload->>'bill_count','')::integer,0),
      coalesce(nullif(p_payload->>'duplicate_prints','')::integer,0),
      round(coalesce(nullif(p_payload->>'expected_cash','')::numeric,0),2),
      round(coalesce(nullif(p_payload->>'actual_cash','')::numeric,0),2),
      v_cash_difference,
      nullif(btrim(coalesce(p_payload->>'notes','')),''),
      'finalized'
    ) returning id into v_closure_id;
  else
    v_closure_id := v_existing;
    update public.branch_daily_closures
    set actual_upi = v_actual_upi,
        upi_difference = v_upi_difference,
        upi_notes = v_upi_notes,
        actual_cash = round(coalesce(nullif(p_payload->>'actual_cash','')::numeric,actual_cash),2),
        expected_cash = round(coalesce(nullif(p_payload->>'expected_cash','')::numeric,expected_cash),2),
        difference = v_cash_difference,
        closing_denominations = coalesce(p_payload->'closing_denominations',closing_denominations),
        notes = nullif(btrim(coalesce(p_payload->>'notes','')),''),
        status = 'finalized',
        updated_at = now()
    where id = v_closure_id;
  end if;

  update public.branch_counter_sessions
  set status = 'finalized',
      closing_denominations = coalesce(p_payload->'closing_denominations','{}'::jsonb),
      gross_sales = round(coalesce(nullif(p_payload->>'gross_sales','')::numeric,0),2),
      discounts = round(coalesce(nullif(p_payload->>'discounts','')::numeric,0),2),
      returns = round(coalesce(nullif(p_payload->>'refunds','')::numeric,0),2),
      net_sales = round(coalesce(nullif(p_payload->>'net_sales','')::numeric,0),2),
      cash_sales = round(coalesce(nullif(p_payload->>'cash_total','')::numeric,0),2),
      upi_sales = v_system_upi,
      counted_upi = v_actual_upi,
      upi_difference = v_upi_difference,
      upi_notes = v_upi_notes,
      card_sales = round(coalesce(nullif(p_payload->>'card_total','')::numeric,0),2),
      credit_sales = round(coalesce(nullif(p_payload->>'credit_billed','')::numeric,0),2),
      credit_collected = round(coalesce(nullif(p_payload->>'credit_collected','')::numeric,0),2),
      advance_collected = round(coalesce(nullif(p_payload->>'session_advance_collected','')::numeric,
        coalesce(nullif(p_payload->>'advance_collected','')::numeric,0) + coalesce(nullif(p_payload->>'advance_balance_collected','')::numeric,0)),2),
      refunds = round(coalesce(nullif(p_payload->>'refunds','')::numeric,0),2),
      expenses = round(coalesce(nullif(p_payload->>'expenses','')::numeric,0),2),
      supplier_payments = round(coalesce(nullif(p_payload->>'supplier_payments','')::numeric,
        nullif(p_payload->>'purchase_payments','')::numeric,0),2),
      bank_deposits = round(coalesce(nullif(p_payload->>'bank_deposits','')::numeric,0),2),
      expected_cash = round(coalesce(nullif(p_payload->>'expected_cash','')::numeric,0),2),
      counted_cash = round(coalesce(nullif(p_payload->>'actual_cash','')::numeric,0),2),
      difference = v_cash_difference,
      bill_count = coalesce(nullif(p_payload->>'bill_count','')::integer,0),
      notes = nullif(btrim(coalesce(p_payload->>'notes','')),''),
      closed_at = now(),
      closed_by_user_id = c.staff_id,
      closed_by_username = c.username,
      updated_at = now()
  where id = v_session_id;

  insert into public.branch_operation_records(
    branch,record_type,record_id,record_no,amount,status,actor,actor_user_id,counter_session_id,payload
  ) values (
    v_branch,'daily_closure',v_closure_id::text,
    coalesce(nullif(p_payload->>'closure_date',''),s.business_date::text),
    round(coalesce(nullif(p_payload->>'net_sales','')::numeric,0),2),
    'finalized',c.username,c.staff_id,v_session_id,
    jsonb_build_object(
      'closureId',v_closure_id,'counterSessionId',v_session_id,
      'systemUpi',v_system_upi,'actualUpi',v_actual_upi,
      'upiDifference',v_upi_difference,'upiNotes',v_upi_notes,
      'expectedCash',coalesce(nullif(p_payload->>'expected_cash','')::numeric,0),
      'actualCash',coalesce(nullif(p_payload->>'actual_cash','')::numeric,0),
      'cashDifference',v_cash_difference,'closedBy',c.username,'closedAt',now()
    )
  )
  on conflict(branch,record_type,record_id) do update
  set amount=excluded.amount,status=excluded.status,actor=excluded.actor,
      actor_user_id=excluded.actor_user_id,counter_session_id=excluded.counter_session_id,
      payload=excluded.payload,updated_at=now();

  return jsonb_build_object(
    'closureId',v_closure_id,
    'counterSessionId',v_session_id,
    'status','finalized',
    'upiDifference',v_upi_difference,
    'cashDifference',v_cash_difference
  );
end;
$$;

revoke all on function public.finalize_branch_counter_closure_secure(jsonb) from public;
grant execute on function public.finalize_branch_counter_closure_secure(jsonb) to anon,authenticated,service_role;

select pg_notify('pgrst','reload schema');
select pg_notify('pgrst','reload config');
