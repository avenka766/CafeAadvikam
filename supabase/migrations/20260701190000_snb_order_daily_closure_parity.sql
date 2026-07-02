-- SNB Order daily closure parity with SNB Branch.
-- Provides secured counter session RPCs, server-side advance collection snapshot,
-- mandatory open-counter enforcement, and receiver_snb closure authorization.

create or replace function public.get_my_branch_counter_session_secure(
  p_branch text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c record;
  s public.branch_counter_sessions%rowtype;
  normalized_branch text := btrim(coalesce(p_branch, ''));
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;

  if normalized_branch = 'SNB'
     and c.role not in ('receiver_snb','branch_snb','admin_snb','admin','owner') then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;
  if normalized_branch = 'VRSNB'
     and c.role not in ('receiver_vrsnb','branch_vrsnb','admin_vrsnb','admin','owner') then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;
  if normalized_branch = 'Hosur'
     and c.role not in ('receiver_hosur','branch_hosur','admin_hosur','admin','owner') then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;
  if normalized_branch = 'Cafe'
     and c.role not in ('biller','admin_cafe','admin','owner') then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;
  if normalized_branch not in ('SNB','VRSNB','Hosur','Cafe') then
    raise exception 'BRANCH_NOT_ALLOWED';
  end if;

  select * into s
  from public.branch_counter_sessions
  where branch = normalized_branch
    and cashier_user_id = c.staff_id
    and status = 'open'
  order by opened_at desc
  limit 1;

  if s.id is null then return null; end if;

  return to_jsonb(s) || jsonb_build_object(
    'sourceRole', c.role,
    'sourceLabel', case when c.role = 'receiver_snb' then 'SNB Order' else normalized_branch || ' Branch' end
  );
end;
$$;

create or replace function public.open_branch_counter_session_secure(
  p_branch text,
  p_opening_cash numeric,
  p_opening_denominations jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  s public.branch_counter_sessions%rowtype;
  normalized_branch text := btrim(coalesce(p_branch, ''));
  opening_value numeric := round(coalesce(p_opening_cash, 0), 2);
  display_value text;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;

  if normalized_branch = 'SNB'
     and c.role not in ('receiver_snb','branch_snb','admin_snb','admin','owner') then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;
  if normalized_branch = 'VRSNB'
     and c.role not in ('receiver_vrsnb','branch_vrsnb','admin_vrsnb','admin','owner') then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;
  if normalized_branch = 'Hosur'
     and c.role not in ('receiver_hosur','branch_hosur','admin_hosur','admin','owner') then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;
  if normalized_branch = 'Cafe'
     and c.role not in ('biller','admin_cafe','admin','owner') then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;
  if normalized_branch not in ('SNB','VRSNB','Hosur','Cafe') then
    raise exception 'BRANCH_NOT_ALLOWED';
  end if;
  if opening_value < 0 then raise exception 'Opening cash cannot be negative'; end if;
  if jsonb_typeof(coalesce(p_opening_denominations, '{}'::jsonb)) <> 'object' then
    raise exception 'Opening denominations must be an object';
  end if;

  perform pg_advisory_xact_lock(hashtext('counter-open-' || normalized_branch || '-' || c.staff_id::text));

  select * into s
  from public.branch_counter_sessions
  where branch = normalized_branch
    and cashier_user_id = c.staff_id
    and status = 'open'
  order by opened_at desc
  limit 1
  for update;

  if s.id is not null then
    return to_jsonb(s) || jsonb_build_object('alreadyOpen', true, 'sourceRole', c.role);
  end if;

  display_value := case
    when c.role = 'receiver_snb' then 'SNB Order - ' || coalesce(nullif(c.display_name,''), c.username)
    else coalesce(nullif(c.display_name,''), c.username)
  end;

  insert into public.branch_counter_sessions(
    branch,
    business_date,
    cashier_user_id,
    cashier_username,
    cashier_display_name,
    app_session_id,
    device_info,
    opening_cash,
    opening_denominations,
    status
  ) values (
    normalized_branch,
    (now() at time zone 'Asia/Kolkata')::date,
    c.staff_id,
    c.username,
    display_value,
    c.app_session_id,
    c.device_info,
    opening_value,
    coalesce(p_opening_denominations, '{}'::jsonb),
    'open'
  )
  returning * into s;

  insert into public.branch_operation_records(
    branch, record_type, record_id, record_no, amount, status,
    actor, actor_user_id, counter_session_id, payload
  ) values (
    normalized_branch,
    'counter_opening',
    s.id::text,
    s.business_date::text,
    opening_value,
    'Opened',
    case when c.role = 'receiver_snb' then 'SNB Order - ' || c.username else c.username end,
    c.staff_id,
    s.id,
    jsonb_build_object(
      'counterSessionId', s.id,
      'businessDate', s.business_date,
      'openingCash', opening_value,
      'openingDenominations', s.opening_denominations,
      'cashierUsername', c.username,
      'cashierDisplayName', display_value,
      'sourceRole', c.role,
      'sourceLabel', case when c.role = 'receiver_snb' then 'SNB Order' else normalized_branch || ' Branch' end,
      'openedAt', s.opened_at
    )
  )
  on conflict(branch, record_type, record_id) do update
  set amount = excluded.amount,
      status = excluded.status,
      actor = excluded.actor,
      actor_user_id = excluded.actor_user_id,
      counter_session_id = excluded.counter_session_id,
      payload = excluded.payload,
      updated_at = now();

  return to_jsonb(s) || jsonb_build_object('alreadyOpen', false, 'sourceRole', c.role);
end;
$$;

create or replace function public.get_my_branch_counter_closure_snapshot_secure(
  p_branch text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c record;
  s public.branch_counter_sessions%rowtype;
  normalized_branch text := btrim(coalesce(p_branch, ''));
  advance_cash numeric := 0;
  advance_upi numeric := 0;
  advance_card numeric := 0;
  advance_bank numeric := 0;
  initial_advance numeric := 0;
  balance_advance numeric := 0;
  payment_count bigint := 0;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;

  if normalized_branch = 'SNB'
     and c.role not in ('receiver_snb','branch_snb','admin_snb','admin','owner') then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;
  if normalized_branch = 'VRSNB'
     and c.role not in ('receiver_vrsnb','branch_vrsnb','admin_vrsnb','admin','owner') then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;
  if normalized_branch not in ('SNB','VRSNB') then raise exception 'BRANCH_NOT_ALLOWED'; end if;

  select * into s
  from public.branch_counter_sessions
  where branch = normalized_branch
    and cashier_user_id = c.staff_id
    and status = 'open'
  order by opened_at desc
  limit 1;

  if s.id is null then
    return jsonb_build_object(
      'counterSession', null,
      'advanceCash', 0,
      'advanceUpi', 0,
      'advanceCard', 0,
      'advanceBank', 0,
      'advanceInitial', 0,
      'advanceBalance', 0,
      'advanceTotal', 0,
      'paymentCount', 0
    );
  end if;

  select
    coalesce(sum(amount) filter (where payment_mode = 'cash'), 0),
    coalesce(sum(amount) filter (where payment_mode = 'upi'), 0),
    coalesce(sum(amount) filter (where payment_mode = 'card'), 0),
    coalesce(sum(amount) filter (where payment_mode not in ('cash','upi','card')), 0),
    coalesce(sum(amount) filter (where payment_stage = 'advance'), 0),
    coalesce(sum(amount) filter (where payment_stage <> 'advance'), 0),
    count(*)
  into advance_cash, advance_upi, advance_card, advance_bank,
       initial_advance, balance_advance, payment_count
  from public.branch_advance_payments
  where branch = normalized_branch
    and counter_session_id = s.id;

  return jsonb_build_object(
    'counterSession', to_jsonb(s),
    'advanceCash', round(advance_cash, 2),
    'advanceUpi', round(advance_upi, 2),
    'advanceCard', round(advance_card, 2),
    'advanceBank', round(advance_bank, 2),
    'advanceInitial', round(initial_advance, 2),
    'advanceBalance', round(balance_advance, 2),
    'advanceTotal', round(initial_advance + balance_advance, 2),
    'paymentCount', payment_count,
    'sourceRole', c.role,
    'sourceLabel', case when c.role = 'receiver_snb' then 'SNB Order' else normalized_branch || ' Branch' end
  );
end;
$$;

create or replace function public.create_snb_order_advance_order_secure(
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
  r jsonb;
  oid uuid;
  actor text;
  bal numeric;
  counter_id uuid;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if c.role not in ('receiver_snb','branch_snb','admin_snb','admin','owner') then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;

  select id into counter_id
  from public.branch_counter_sessions
  where branch = 'SNB'
    and cashier_user_id = c.staff_id
    and status = 'open'
  order by opened_at desc
  limit 1
  for update;

  if counter_id is null then
    raise exception 'COUNTER_NOT_OPEN: Open the Daily Closure counter before taking an advance order.';
  end if;

  actor := coalesce(nullif(btrim(p_entered_by),''), 'SNB Order - ' || c.username);
  r := public.create_branch_advance_order_reserved(
    'SNB', p_customer_name, p_items, p_subtotal, p_advance_amount,
    p_advance_method, actor, p_delivery_date, p_notes
  );

  oid := (r->>'id')::uuid;
  bal := round(p_subtotal-p_advance_amount,2);

  update public.branch_advance_payments
  set collected_by = actor,
      remarks = 'SNB Order collected',
      counter_session_id = coalesce(counter_session_id, counter_id)
  where advance_order_id = oid
    and payment_stage = 'advance';

  update public.branch_sale_payments
  set collected_by = actor,
      collected_role = 'receiver_snb',
      remarks = 'SNB Order collected',
      counter_session_id = coalesce(counter_session_id, counter_id)
  where advance_order_id = oid
    and payment_purpose in ('advance_payment','advance_paid');

  insert into public.branch_operation_records(
    branch,record_type,record_id,record_no,amount,status,actor,actor_user_id,counter_session_id,payload
  ) values (
    'SNB','advance_order',oid::text,'ADV-'||upper(left(oid::text,8)),
    round(p_subtotal,2),'pending',actor,c.staff_id,counter_id,
    jsonb_build_object(
      'orderId',oid,
      'customerName',p_customer_name,
      'advanceAmount',round(p_advance_amount,2),
      'balanceAmount',bal,
      'collectionSource','SNB Order collected',
      'sourceRole','receiver_snb',
      'sourceLabel','SNB Order',
      'enteredBy',actor,
      'counterSessionId',counter_id
    )
  )
  on conflict(branch,record_type,record_id) do update
  set amount=excluded.amount,
      status=excluded.status,
      actor=excluded.actor,
      actor_user_id=excluded.actor_user_id,
      counter_session_id=excluded.counter_session_id,
      payload=excluded.payload,
      updated_at=now();

  return r || jsonb_build_object(
    'collectionSource','SNB Order collected',
    'counterSessionId',counter_id
  );
end;
$$;

do $$
declare
  function_sql text;
begin
  select pg_get_functiondef('public.finalize_branch_counter_closure_secure(jsonb)'::regprocedure)
  into function_sql;

  function_sql := replace(
    function_sql,
    $old$c.role not in ('branch_snb','branch_vrsnb','branch_hosur','admin_snb','admin_vrsnb','admin_hosur','admin','owner')$old$,
    $new$c.role not in ('receiver_snb','branch_snb','branch_vrsnb','branch_hosur','admin_snb','admin_vrsnb','admin_hosur','admin','owner')$new$
  );
  function_sql := replace(
    function_sql,
    $old$if c.role = 'branch_snb' and v_branch <> 'SNB' then raise exception 'ROLE_NOT_ALLOWED'; end if;$old$,
    $new$if c.role in ('receiver_snb','branch_snb') and v_branch <> 'SNB' then raise exception 'ROLE_NOT_ALLOWED'; end if;$new$
  );
  function_sql := replace(
    function_sql,
    $old$if c.role in ('branch_snb','branch_vrsnb','branch_hosur') and s.cashier_user_id <> c.staff_id then$old$,
    $new$if c.role in ('receiver_snb','branch_snb','branch_vrsnb','branch_hosur') and s.cashier_user_id <> c.staff_id then$new$
  );

  if position('receiver_snb' in function_sql) = 0 then
    raise exception 'Unable to add receiver_snb to closure RPC';
  end if;

  execute function_sql;
end;
$$;

revoke all on function public.get_my_branch_counter_session_secure(text) from public;
revoke all on function public.open_branch_counter_session_secure(text,numeric,jsonb) from public;
revoke all on function public.get_my_branch_counter_closure_snapshot_secure(text) from public;
revoke all on function public.create_snb_order_advance_order_secure(text,jsonb,numeric,numeric,text,date,text,text) from public;

grant execute on function public.get_my_branch_counter_session_secure(text) to anon,authenticated,service_role;
grant execute on function public.open_branch_counter_session_secure(text,numeric,jsonb) to anon,authenticated,service_role;
grant execute on function public.get_my_branch_counter_closure_snapshot_secure(text) to anon,authenticated,service_role;
grant execute on function public.create_snb_order_advance_order_secure(text,jsonb,numeric,numeric,text,date,text,text) to anon,authenticated,service_role;
grant execute on function public.finalize_branch_counter_closure_secure(jsonb) to anon,authenticated,service_role;

select pg_notify('pgrst','reload schema');
select pg_notify('pgrst','reload config');
