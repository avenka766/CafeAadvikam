-- Allow the Hosur cashier counter to be reopened after a same-day closure.
-- Billing remains locked whenever hosur_counter_sessions.status = 'closed'.
-- Reclosing updates the same daily closure record and increments its version.

create or replace function public.open_hosur_counter_secure(
  p_business_date date,
  p_opening_cash numeric
)
returns public.hosur_counter_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  s public.hosur_counter_sessions;
begin
  select * into strict a
  from public.require_app_staff(array['branch_hosur','admin','owner'], 'Hosur');

  if p_opening_cash < 0 then
    raise exception 'Opening cash cannot be negative';
  end if;

  insert into public.hosur_counter_sessions(
    business_date,
    opening_cash,
    opened_by_id,
    opened_by
  )
  values (
    p_business_date,
    p_opening_cash,
    a.id,
    a.display_name
  )
  on conflict (business_date) do nothing;

  select * into strict s
  from public.hosur_counter_sessions
  where business_date = p_business_date
  for update;

  if s.status = 'open' then
    return s;
  end if;

  -- A same-day reopen keeps the original opening float. All day totals are
  -- cumulative, so replacing it with the previous closing cash would double
  -- count earlier cash sales during the next closure.
  update public.hosur_counter_sessions
  set status = 'open',
      opened_by_id = a.id,
      opened_by = a.display_name,
      opened_at = now(),
      closed_by_id = null,
      closed_by = null,
      closed_at = null,
      counted_cash = null,
      expected_cash = null,
      difference = null,
      closure_id = null,
      remarks = null,
      updated_at = now()
  where id = s.id
  returning * into s;

  update public.hosur_daily_closures
  set status = 'reopened',
      locked_at = null,
      updated_at = now(),
      version = version + 1
  where closure_date = p_business_date;

  perform public.emit_business_event(
    'Hosur',
    'info',
    'COUNTER_REOPENED',
    'hosur_counter_session',
    s.id::text,
    null,
    to_jsonb(s),
    null,
    'Hosur counter reopened',
    p_business_date::text
  );

  return s;
end;
$$;

create or replace function public.close_hosur_counter_secure(
  p_business_date date,
  p_counted_cash numeric,
  p_remarks text,
  p_cash_sales numeric,
  p_cash_collections numeric,
  p_upi_total numeric,
  p_card_total numeric,
  p_bank_total numeric,
  p_mixed_total numeric,
  p_gross_sales numeric,
  p_credit_given numeric,
  p_total_collection numeric,
  p_expected_cash numeric,
  p_bills_count integer,
  p_orders_count integer,
  p_disputes_count integer,
  p_whatsapp_failed integer
)
returns public.hosur_daily_closures
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  s public.hosur_counter_sessions;
  c public.hosur_daily_closures;
begin
  select * into strict a
  from public.require_app_staff(array['branch_hosur','admin','owner'], 'Hosur');

  select * into strict s
  from public.hosur_counter_sessions
  where business_date = p_business_date
  for update;

  if s.status <> 'open' then
    raise exception 'Counter is not open';
  end if;

  if p_counted_cash < 0 then
    raise exception 'Counted cash cannot be negative';
  end if;

  if round(p_counted_cash, 2) <> round(p_expected_cash, 2) then
    raise exception 'Counted cash must exactly match expected cash';
  end if;

  insert into public.hosur_daily_closures(
    closure_date,
    opening_cash,
    cash_sales,
    cash_collections,
    upi_total,
    card_total,
    bank_total,
    mixed_total,
    gross_sales,
    credit_given,
    total_collection,
    expected_cash,
    counted_cash,
    difference,
    bills_count,
    orders_count,
    disputes_count,
    whatsapp_failed,
    remarks,
    closed_by,
    closed_at,
    updated_at,
    status,
    version,
    locked_at,
    opened_by_user_id,
    closed_by_user_id,
    cash_total
  )
  values (
    p_business_date,
    s.opening_cash,
    p_cash_sales,
    p_cash_collections,
    p_upi_total,
    p_card_total,
    p_bank_total,
    p_mixed_total,
    p_gross_sales,
    p_credit_given,
    p_total_collection,
    p_expected_cash,
    p_counted_cash,
    0,
    p_bills_count,
    p_orders_count,
    p_disputes_count,
    p_whatsapp_failed,
    nullif(trim(p_remarks), ''),
    a.display_name,
    now(),
    now(),
    'closed',
    1,
    now(),
    s.opened_by_id,
    a.id,
    p_cash_sales + p_cash_collections
  )
  on conflict (closure_date) do update
  set opening_cash = excluded.opening_cash,
      cash_sales = excluded.cash_sales,
      cash_collections = excluded.cash_collections,
      upi_total = excluded.upi_total,
      card_total = excluded.card_total,
      bank_total = excluded.bank_total,
      mixed_total = excluded.mixed_total,
      gross_sales = excluded.gross_sales,
      credit_given = excluded.credit_given,
      total_collection = excluded.total_collection,
      expected_cash = excluded.expected_cash,
      counted_cash = excluded.counted_cash,
      difference = 0,
      bills_count = excluded.bills_count,
      orders_count = excluded.orders_count,
      disputes_count = excluded.disputes_count,
      whatsapp_failed = excluded.whatsapp_failed,
      remarks = excluded.remarks,
      closed_by = excluded.closed_by,
      closed_at = excluded.closed_at,
      updated_at = now(),
      status = 'closed',
      version = public.hosur_daily_closures.version + 1,
      locked_at = now(),
      opened_by_user_id = excluded.opened_by_user_id,
      closed_by_user_id = excluded.closed_by_user_id,
      cash_total = excluded.cash_total
  returning * into c;

  update public.hosur_counter_sessions
  set status = 'closed',
      closed_by_id = a.id,
      closed_by = a.display_name,
      closed_at = now(),
      counted_cash = p_counted_cash,
      expected_cash = p_expected_cash,
      difference = 0,
      closure_id = c.id,
      remarks = nullif(trim(p_remarks), ''),
      updated_at = now()
  where id = s.id;

  perform public.emit_business_event(
    'Hosur',
    'info',
    'COUNTER_CLOSED',
    'hosur_daily_closure',
    c.id::text,
    null,
    to_jsonb(c),
    p_remarks,
    'Hosur closure completed',
    p_business_date::text
  );

  return c;
end;
$$;
