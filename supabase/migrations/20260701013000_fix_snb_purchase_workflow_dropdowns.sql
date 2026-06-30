-- Restore SNB Admin purchase-return and supplier-payment selectors.
--
-- The dashboard previously depended on several independently queried tables/views.
-- A missing view grant or one RLS mismatch silently produced empty dropdowns even
-- when purchase invoices existed.  This role-checked snapshot gives the client a
-- single reliable read path while retaining the direct-query fallbacks.

create or replace function public.get_snb_purchase_workflow_data(
  p_from_date date,
  p_to_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  from_value date := coalesce(p_from_date, current_date - 31);
  to_value date := coalesce(p_to_date, current_date);
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if c.role not in ('admin_snb', 'admin', 'owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if from_value > to_value then raise exception 'Invalid report date range'; end if;

  return jsonb_build_object(
    'purchaseInvoices', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.created_at desc)
      from public.snb_purchase_invoices i
    ), '[]'::jsonb),
    'supplierOutstanding', coalesce((
      select jsonb_agg(
        to_jsonb(i) || jsonb_build_object('purchase_invoice_id', i.id)
        order by i.created_at desc
      )
      from public.snb_purchase_invoices i
    ), '[]'::jsonb),
    'supplierPayments', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.payment_date desc, p.created_at desc)
      from public.snb_supplier_payments p
      where p.payment_date::date between from_value and to_value
    ), '[]'::jsonb),
    'purchaseReturns', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.return_date desc, r.created_at desc)
      from public.snb_purchase_returns r
      where r.return_date::date between from_value and to_value
    ), '[]'::jsonb),
    'purchaseReturnItems', coalesce((
      select jsonb_agg(to_jsonb(ri) order by ri.created_at desc)
      from public.snb_purchase_return_items ri
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_snb_purchase_workflow_data(date, date) from public;
grant execute on function public.get_snb_purchase_workflow_data(date, date)
  to anon, authenticated, service_role;

-- Keep direct reads functional as a secondary path.  RLS still validates the
-- signed application session, so granting SELECT does not expose these ledgers.
alter table public.snb_purchase_invoices enable row level security;
alter table public.snb_purchase_invoice_items enable row level security;
alter table public.snb_supplier_payments enable row level security;
alter table public.snb_purchase_returns enable row level security;
alter table public.snb_purchase_return_items enable row level security;

drop policy if exists snb_admin_purchase_invoice_read_v2 on public.snb_purchase_invoices;
create policy snb_admin_purchase_invoice_read_v2
on public.snb_purchase_invoices for select
using (
  exists (
    select 1 from public.current_app_session_context() c
    where c.role in ('admin_snb', 'admin', 'owner')
  )
);

drop policy if exists snb_admin_purchase_invoice_item_read_v2 on public.snb_purchase_invoice_items;
create policy snb_admin_purchase_invoice_item_read_v2
on public.snb_purchase_invoice_items for select
using (
  exists (
    select 1 from public.current_app_session_context() c
    where c.role in ('admin_snb', 'admin', 'owner')
  )
);

drop policy if exists snb_admin_supplier_payment_read_v2 on public.snb_supplier_payments;
create policy snb_admin_supplier_payment_read_v2
on public.snb_supplier_payments for select
using (
  exists (
    select 1 from public.current_app_session_context() c
    where c.role in ('admin_snb', 'admin', 'owner')
  )
);

drop policy if exists snb_admin_purchase_return_read_v2 on public.snb_purchase_returns;
create policy snb_admin_purchase_return_read_v2
on public.snb_purchase_returns for select
using (
  exists (
    select 1 from public.current_app_session_context() c
    where c.role in ('admin_snb', 'admin', 'owner')
  )
);

drop policy if exists snb_admin_purchase_return_item_read_v2 on public.snb_purchase_return_items;
create policy snb_admin_purchase_return_item_read_v2
on public.snb_purchase_return_items for select
using (
  exists (
    select 1 from public.current_app_session_context() c
    where c.role in ('admin_snb', 'admin', 'owner')
  )
);

grant select on public.snb_purchase_invoices to anon, authenticated, service_role;
grant select on public.snb_purchase_invoice_items to anon, authenticated, service_role;
grant select on public.snb_supplier_payments to anon, authenticated, service_role;
grant select on public.snb_purchase_returns to anon, authenticated, service_role;
grant select on public.snb_purchase_return_items to anon, authenticated, service_role;

do $$
begin
  if to_regclass('public.snb_supplier_outstanding_report') is not null then
    execute 'grant select on public.snb_supplier_outstanding_report to anon, authenticated, service_role';
  end if;
end;
$$;
