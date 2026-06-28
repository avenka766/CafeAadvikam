-- Repair the Admin invoice review workflow.
--
-- 1. Admin/owner invoice reads and reviews use the application's secure staff
--    session rather than relying on the Supabase Auth role.
-- 2. status and the legacy purchase_status column remain synchronized.
-- 3. Existing rows are backfilled so Owner/Admin reports agree.

create or replace function public.sync_store_invoice_status_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.status := coalesce(nullif(new.status, ''), nullif(new.purchase_status, ''), 'pending_review');
    new.purchase_status := new.status;
    return new;
  end if;

  if new.status is distinct from old.status then
    new.purchase_status := new.status;
  elsif new.purchase_status is distinct from old.purchase_status then
    new.status := new.purchase_status;
  end if;

  return new;
end
$$;

drop trigger if exists sync_store_invoice_status_columns on public.store_invoices;
create trigger sync_store_invoice_status_columns
before insert or update of status, purchase_status on public.store_invoices
for each row execute function public.sync_store_invoice_status_columns();

update public.store_invoices
set purchase_status = status
where purchase_status is distinct from status;

create index if not exists store_invoices_status_created_idx
  on public.store_invoices (status, created_at desc);

create or replace function public.list_store_invoices_secure()
returns setof public.store_invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
begin
  select * into strict v_actor
  from public.require_app_staff(array['admin', 'owner'], null);

  return query
  select invoice.*
  from public.store_invoices invoice
  order by invoice.created_at desc;
end
$$;

create or replace function public.review_store_invoice_secure(
  p_invoice_id uuid,
  p_status text,
  p_review_note text default null
)
returns public.store_invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_invoice public.store_invoices;
begin
  select * into strict v_actor
  from public.require_app_staff(array['admin', 'owner'], null);

  if p_status not in ('approved', 'rejected') then
    raise exception 'INVALID_INVOICE_STATUS' using errcode = '22023';
  end if;

  update public.store_invoices
  set status = p_status,
      purchase_status = p_status,
      reviewed_at = now(),
      review_note = nullif(btrim(coalesce(p_review_note, '')), '')
  where id = p_invoice_id
    and status = 'pending_review'
  returning * into v_invoice;

  if v_invoice.id is null then
    if exists (select 1 from public.store_invoices where id = p_invoice_id) then
      raise exception 'INVOICE_ALREADY_REVIEWED' using errcode = 'P0001';
    end if;
    raise exception 'INVOICE_NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_invoice;
end
$$;

revoke all on function public.list_store_invoices_secure() from public;
revoke all on function public.review_store_invoice_secure(uuid, text, text) from public;
grant execute on function public.list_store_invoices_secure() to anon, authenticated;
grant execute on function public.review_store_invoice_secure(uuid, text, text) to anon, authenticated;
