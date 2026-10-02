-- Planner > Sales > Invoice: allow staff to correct a saved GST tax invoice.
-- gst_tax_invoices only has a SELECT policy (writes go through SECURITY DEFINER
-- RPCs), so edits need their own RPC. The invoice number is deliberately
-- immutable (GST numbering must stay gap-free and unique); everything else on
-- the invoice can be corrected.
create or replace function public.update_gst_tax_invoice_secure(
  p_id uuid,
  p_invoice_date date,
  p_buyer_name text,
  p_buyer_gstin text,
  p_buyer_address text,
  p_buyer_state_name text,
  p_buyer_state_code text,
  p_consignee_name text,
  p_consignee_address text,
  p_consignee_gstin text,
  p_items jsonb,
  p_taxable_value numeric,
  p_cgst_amount numeric,
  p_sgst_amount numeric,
  p_igst_amount numeric,
  p_round_off numeric,
  p_total numeric,
  p_supply_type text,
  p_reference_no text,
  p_reference_date date,
  p_remarks text
) returns public.gst_tax_invoices
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a record;
  v_row public.gst_tax_invoices;
begin
  select * into strict a from public.require_app_staff();

  if p_buyer_name is null or length(trim(p_buyer_name)) = 0 then
    raise exception 'Buyer name is required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one item line is required';
  end if;

  update public.gst_tax_invoices set
    invoice_date = p_invoice_date,
    buyer_name = trim(p_buyer_name),
    buyer_gstin = nullif(trim(p_buyer_gstin), ''),
    buyer_address = nullif(trim(p_buyer_address), ''),
    buyer_state_name = nullif(trim(p_buyer_state_name), ''),
    buyer_state_code = nullif(trim(p_buyer_state_code), ''),
    consignee_name = nullif(trim(p_consignee_name), ''),
    consignee_address = nullif(trim(p_consignee_address), ''),
    consignee_gstin = nullif(trim(p_consignee_gstin), ''),
    items = p_items,
    taxable_value = coalesce(p_taxable_value, 0),
    cgst_amount = coalesce(p_cgst_amount, 0),
    sgst_amount = coalesce(p_sgst_amount, 0),
    igst_amount = coalesce(p_igst_amount, 0),
    round_off = coalesce(p_round_off, 0),
    total = coalesce(p_total, 0),
    supply_type = coalesce(nullif(p_supply_type, ''), 'intra'),
    reference_no = nullif(trim(p_reference_no), ''),
    reference_date = p_reference_date,
    remarks = nullif(trim(p_remarks), '')
  where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'Invoice not found — it may have been removed.';
  end if;

  return v_row;
end;
$$;

revoke all on function public.update_gst_tax_invoice_secure(uuid,date,text,text,text,text,text,text,text,text,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,text,text,date,text) from public;
-- Staff sign in through the app's own session (not Supabase Auth), so calls
-- arrive as anon; require_app_staff() inside the function enforces the real
-- staff check, same as save_gst_tax_invoice_secure.
grant execute on function public.update_gst_tax_invoice_secure(uuid,date,text,text,text,text,text,text,text,text,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,text,text,date,text) to anon, authenticated;
