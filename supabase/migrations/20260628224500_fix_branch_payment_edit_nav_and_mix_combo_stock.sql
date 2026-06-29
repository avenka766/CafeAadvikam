-- Correct the SNB flexible-stock rule after the original migration matched any
-- category containing the word "mix". Only the exact "Mix & Combo" category
-- may bill through zero stock. "Namkeens & Mixtures" and every other category
-- continue to require available stock.
--
-- The Payment Mode Edit navigation correction is implemented in the frontend;
-- this migration is required only for the server-side stock rule.

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

grant execute on function public.complete_branch_checkout_canonical_v3(text,jsonb,jsonb,text,text,text,text,numeric,numeric,numeric,text,text,text,numeric) to anon, authenticated;
