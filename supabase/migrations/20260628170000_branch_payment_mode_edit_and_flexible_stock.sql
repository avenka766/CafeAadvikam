-- Branch payment-mode corrections and SNB flexible Mix/Combo checkout.
-- Payment corrections are intentionally limited to a single Cash/UPI/Card payment row.

create extension if not exists pgcrypto;

create table if not exists public.branch_payment_mode_edits (
  id uuid primary key default gen_random_uuid(),
  branch text not null,
  bill_id uuid not null,
  bill_no text not null,
  old_mode text not null check (old_mode in ('cash','upi','card')),
  new_mode text not null check (new_mode in ('cash','upi','card')),
  amount numeric(14,2) not null check (amount >= 0),
  changed_by text not null,
  changed_at timestamptz not null default now()
);

create index if not exists branch_payment_mode_edits_bill_idx
  on public.branch_payment_mode_edits(branch, bill_id, changed_at desc);

alter table public.branch_payment_mode_edits enable row level security;

drop policy if exists "branch payment edits read" on public.branch_payment_mode_edits;
create policy "branch payment edits read"
  on public.branch_payment_mode_edits for select
  to anon, authenticated
  using (true);

create or replace function public.edit_branch_bill_payment_mode(
  p_branch text,
  p_bill_id uuid,
  p_new_mode text,
  p_changed_by text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill_no text;
  v_bill_type text;
  v_status text;
  v_old_mode text;
  v_payment_count integer;
  v_mode_count integer;
  v_amount numeric;
begin
  p_new_mode := lower(trim(coalesce(p_new_mode, '')));
  if p_new_mode not in ('cash','upi','card') then
    raise exception 'Payment mode must be cash, upi or card';
  end if;

  select bill_no, coalesce(bill_type, 'counter'), coalesce(status, '')
    into v_bill_no, v_bill_type, v_status
  from public.branch_bill_headers
  where id = p_bill_id and branch = p_branch
  for update;

  if not found then raise exception 'Bill not found'; end if;
  if lower(v_bill_type) = 'credit' then raise exception 'Credit bills cannot be changed in Payment Mode Edit'; end if;
  if lower(v_status) = 'returned' then raise exception 'Returned bills cannot be changed'; end if;

  select
    count(*) filter (where coalesce(amount,0) > 0),
    count(distinct lower(payment_mode)) filter (where coalesce(amount,0) > 0),
    min(lower(payment_mode)) filter (where coalesce(amount,0) > 0),
    coalesce(sum(amount) filter (where coalesce(amount,0) > 0), 0)
  into v_payment_count, v_mode_count, v_old_mode, v_amount
  from public.branch_sale_payments
  where bill_id = p_bill_id;

  if v_payment_count <> 1 or v_mode_count <> 1 or v_old_mode not in ('cash','upi','card') then
    raise exception 'Only single-mode Cash, UPI or Card bills can be corrected';
  end if;

  if v_old_mode = p_new_mode then
    return jsonb_build_object(
      'billNo', v_bill_no,
      'oldMode', v_old_mode,
      'newMode', p_new_mode,
      'amount', v_amount,
      'changed', false
    );
  end if;

  update public.branch_sale_payments
  set payment_mode = p_new_mode
  where bill_id = p_bill_id and coalesce(amount,0) > 0;

  -- Some installations also retain a denormalized mode on the header. Keep it
  -- consistent when that optional column exists without making it a dependency.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'branch_bill_headers' and column_name = 'payment_mode'
  ) then
    execute 'update public.branch_bill_headers set payment_mode = $1 where id = $2'
      using p_new_mode, p_bill_id;
  end if;

  insert into public.branch_payment_mode_edits(
    branch, bill_id, bill_no, old_mode, new_mode, amount, changed_by
  ) values (
    p_branch, p_bill_id, v_bill_no, v_old_mode, p_new_mode, round(v_amount,2),
    coalesce(nullif(trim(p_changed_by),''), 'Branch Staff')
  );

  return jsonb_build_object(
    'billNo', v_bill_no,
    'oldMode', v_old_mode,
    'newMode', p_new_mode,
    'amount', v_amount,
    'changed', true
  );
end $$;

-- Version 3 preserves the canonical atomic checkout while allowing only the
-- exact SNB catalogue category "Mix & Combo" to sell through zero.
-- If available stock is below the requested quantity, it is temporarily topped
-- up inside the same transaction; the atomic checkout then deducts the sale and
-- leaves stock at zero, never negative.
create or replace function public.complete_branch_checkout_canonical_v3(
  p_branch text,
  p_items jsonb,
  p_payments jsonb,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_salesperson text default null,
  p_biller text default null,
  p_discount numeric default 0,
  p_tax numeric default 0,
  p_round_off numeric default 0,
  p_payment_type text default 'counter',
  p_due_date text default null,
  p_notes text default null,
  p_discount_percent numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_canonical jsonb;
  v_result jsonb;
  v_line jsonb;
  v_barcode bigint;
  v_quantity numeric;
  v_available numeric;
  v_category text;
begin
  if p_branch not in ('SNB','VRSNB','Hosur') then raise exception 'Invalid branch'; end if;
  if coalesce(p_discount_percent,0) < 0 or coalesce(p_discount_percent,0) > 100 then
    raise exception 'Invalid discount percent';
  end if;

  v_canonical := public.canonicalize_branch_sale_items(p_branch, p_items);

  if p_branch = 'SNB' then
    for v_line in select value from jsonb_array_elements(v_canonical)
    loop
      v_barcode := nullif(v_line->>'barcode','')::bigint;
      v_quantity := nullif(v_line->>'quantity','')::numeric;
      select category into v_category
      from public.branch_items
      where branch = 'SNB' and barcode = v_barcode and active = true;

      if lower(regexp_replace(trim(coalesce(v_category,'')), '\s+', ' ', 'g'))
         in ('mix & combo', 'mix and combo') then
        perform pg_advisory_xact_lock(hashtext('branch-stock-SNB-' || v_barcode::text));
        select coalesce(quantity,0) into v_available
        from public.branch_stock
        where branch = 'SNB' and item_barcode = v_barcode
        limit 1;
        v_available := coalesce(v_available,0);
        if v_available < v_quantity then
          perform public.increment_branch_stock_by_barcode('SNB', v_barcode, v_quantity - v_available);
        end if;
      end if;
    end loop;
  end if;

  begin
    execute $call$
      select to_jsonb(public.complete_branch_checkout_canonical_v2(
        p_branch => $1,
        p_items => $2,
        p_payments => $3,
        p_customer_name => $4,
        p_customer_phone => $5,
        p_salesperson => $6,
        p_biller => $7,
        p_discount => $8,
        p_tax => $9,
        p_round_off => $10,
        p_payment_type => $11,
        p_due_date => $12,
        p_notes => $13,
        p_discount_percent => $14
      ))
    $call$
    using p_branch, p_items, p_payments, p_customer_name, p_customer_phone,
          p_salesperson, p_biller, coalesce(p_discount,0), coalesce(p_tax,0),
          coalesce(p_round_off,0), p_payment_type, p_due_date, p_notes,
          coalesce(p_discount_percent,0)
    into v_result;
  exception when undefined_function then
    v_result := public.complete_branch_checkout_canonical(
      p_branch, p_items, p_payments, p_customer_name, p_customer_phone,
      p_salesperson, p_biller, coalesce(p_discount,0), coalesce(p_tax,0),
      coalesce(p_round_off,0), p_payment_type, p_due_date, p_notes
    );
  end;

  return v_result;
end $$;

grant select on public.branch_payment_mode_edits to anon, authenticated;
grant execute on function public.edit_branch_bill_payment_mode(text,uuid,text,text) to anon, authenticated;
grant execute on function public.complete_branch_checkout_canonical_v3(text,jsonb,jsonb,text,text,text,text,numeric,numeric,numeric,text,text,text,numeric) to anon, authenticated;
