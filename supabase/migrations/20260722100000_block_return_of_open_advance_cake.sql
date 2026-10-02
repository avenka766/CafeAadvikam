-- SNB-ADV-375 (Oct 2026): staff requested a Return of the dispatched cake that
-- belonged to a still-open customer advance order, the Planner confirmed it,
-- and the cake went back to Packing's closing stock. Returns never credit
-- branch stock, so the advance order could no longer be closed ("requires 5 kg,
-- only 0 is in stock"). A cake linked to an open advance order must be closed
-- (delivered) or the order cancelled first — never returned from Incoming.
create or replace function public.request_packing_transfer_in_return_secure(p_incoming_id uuid, p_reason text)
returns public.packing_transfer_in
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  a record;
  inc public.branch_incoming;
  r public.packing_transfer_in;
  v_admin_role text;
  v_reason text := coalesce(nullif(btrim(p_reason), ''), 'Returned by branch');
begin
  select * into strict a from public.require_app_staff(
    array['receiver_snb','branch_snb','admin_snb','receiver_vrsnb','branch_vrsnb','admin_vrsnb','admin','owner']
  );

  select * into inc from public.branch_incoming where id = p_incoming_id for update;
  if not found then raise exception 'Incoming stock not found'; end if;
  if inc.branch not in ('SNB','VRSNB') then raise exception 'Returns are only supported for SNB and VRSNB'; end if;

  if inc.branch = 'SNB' and a.role not in ('receiver_snb','branch_snb','admin_snb','admin','owner') then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;
  if inc.branch = 'VRSNB' and a.role not in ('receiver_vrsnb','branch_vrsnb','admin_vrsnb','admin','owner') then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;

  if coalesce(inc.confirmed, false) then raise exception 'This item is already confirmed and cannot be returned'; end if;
  if coalesce(inc.disputed, false) then raise exception 'This item is disputed — resolve the dispute first, or return it after admin review'; end if;
  if coalesce(inc.return_requested, false) then raise exception 'A return has already been requested for this item'; end if;

  if inc.advance_order_no is not null and exists (
    select 1 from public.branch_operation_records o
    where o.branch = inc.branch
      and o.record_type = 'advance_order'
      and o.record_no = inc.advance_order_no
      and o.status not in ('Paid In Full', 'Cancelled')
  ) then
    raise exception 'This cake belongs to open advance order %. It cannot be returned — confirm it into stock and close the order, or cancel the advance order first.', inc.advance_order_no;
  end if;

  insert into public.packing_transfer_in(
    source_branch, transfer_reference, item_name, expected_quantity, received_quantity, unit,
    remarks, received_by_id, received_by, status,
    requested_by_id, requested_by, requested_at, source_incoming_id, request_reason, idempotency_key
  ) values (
    inc.branch, coalesce(inc.dispatch_id, 'INC-' || inc.id::text), inc.item_name, inc.quantity, inc.quantity, inc.unit,
    v_reason, a.id, a.display_name, 'pending',
    a.id, a.display_name, now(), inc.id, v_reason, 'return-request:' || inc.id::text
  )
  on conflict (idempotency_key) where status <> 'reversed' do update set idempotency_key = excluded.idempotency_key
  returning * into r;

  update public.branch_incoming
  set return_requested = true, return_requested_at = now(), return_requested_by = a.display_name, transfer_in_return_id = r.id
  where id = p_incoming_id;

  v_admin_role := case inc.branch when 'SNB' then 'admin_snb' when 'VRSNB' then 'admin_vrsnb' else 'admin' end;

  insert into public.admin_notifications (type, title, body, ref_id, ref_label, meta, recipient_role)
  select 'stock_return',
         'Stock return requested — ' || inc.branch,
         a.display_name || ' requested a return of ' || inc.quantity || ' ' || inc.unit || ' of ' || inc.item_name ||
           ' to Packing. Reason: ' || v_reason || '. Awaiting Planner confirmation.',
         r.id::text,
         inc.branch || ' · ' || inc.item_name,
         jsonb_build_object('branch', inc.branch, 'itemName', inc.item_name, 'quantity', inc.quantity,
                             'unit', inc.unit, 'reason', v_reason, 'requestedBy', a.display_name, 'transferId', r.id),
         role
  from unnest(array[v_admin_role, 'owner', 'planner']) as role;

  perform public.emit_business_event(
    inc.branch, 'warning', 'STOCK_RETURN_REQUESTED', 'packing_transfer_in', r.id::text,
    null, to_jsonb(r), v_reason, null, null
  );

  return r;
end;
$function$;
