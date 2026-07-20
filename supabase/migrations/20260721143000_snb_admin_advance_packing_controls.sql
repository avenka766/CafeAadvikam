-- Protected SNB corrections, advance cancellation/refunds, and packing rework loops.

alter table public.branch_waste_logs
  add column if not exists status text not null default 'Posted',
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by_user_id uuid references public.staff_users(id),
  add column if not exists edited_by_username text,
  add column if not exists edit_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by_user_id uuid references public.staff_users(id),
  add column if not exists cancelled_by_username text,
  add column if not exists cancellation_reason text;

alter table public.bakery_orders
  add column if not exists correction_request jsonb;

alter table public.cake_master_orders
  add column if not exists correction_reason text,
  add column if not exists correction_requested_by text,
  add column if not exists correction_requested_at timestamptz,
  add column if not exists correction_count integer not null default 0,
  add column if not exists cancelled_by text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text;

create or replace function public.edit_snb_waste_log_secure(
  p_log_id uuid,
  p_quantity numeric,
  p_reason text,
  p_verified_by text,
  p_edit_reason text,
  p_password text
)
returns public.branch_waste_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  w public.branch_waste_logs%rowtype;
  s public.branch_stock%rowtype;
  next_qty numeric;
  delta numeric;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if c.role not in ('admin_snb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if not exists (
    select 1 from public.staff_users u where u.id=c.staff_id
      and extensions.crypt(coalesce(p_password,''),coalesce(nullif(u.password_hash,''),u.password))=coalesce(nullif(u.password_hash,''),u.password)
  ) then raise exception 'INVALID_PASSWORD'; end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'Quantity must be greater than zero'; end if;
  if btrim(coalesce(p_reason,''))='' or btrim(coalesce(p_verified_by,''))='' or btrim(coalesce(p_edit_reason,''))='' then
    raise exception 'Reason, verifier, and edit reason are required';
  end if;

  select * into w from public.branch_waste_logs where id=p_log_id and branch='SNB' for update;
  if w.id is null then raise exception 'Stock movement not found'; end if;
  if w.status='Cancelled' then raise exception 'Cancelled stock movements cannot be edited'; end if;
  select * into s from public.branch_stock where branch='SNB'
    and ((w.item_barcode is not null and item_barcode=w.item_barcode)
      or (w.item_barcode is null and lower(btrim(item_name))=lower(btrim(w.item_name))))
    order by case when w.item_barcode is not null and item_barcode=w.item_barcode then 0 else 1 end, updated_at desc
    limit 1 for update;
  if s.id is null then raise exception 'Stock item not found'; end if;

  delta := round(w.quantity-p_quantity,3);
  next_qty := round(s.quantity+delta,3);
  if next_qty < coalesce(s.reserved_quantity,0) then
    raise exception 'The edited quantity would use reserved stock. Available unreserved stock is %', round(s.quantity-coalesce(s.reserved_quantity,0),3);
  end if;
  update public.branch_stock set quantity=next_qty,last_updated_at=now(),updated_at=now(),last_updated_by=c.username where id=s.id;
  insert into public.branch_stock_adjustments(branch,item_name,old_quantity,new_quantity,delta,reason,adjusted_by,reference_id,notes)
  values ('SNB',s.item_name,s.quantity,next_qty,delta,'Waste edit - '||w.log_type,c.username,w.id::text,p_edit_reason);

  update public.branch_waste_logs set quantity=round(p_quantity,3),reason=btrim(p_reason),verified_by=btrim(p_verified_by),
    edited_at=now(),edited_by_user_id=c.staff_id,edited_by_username=c.username,edit_reason=btrim(p_edit_reason)
  where id=w.id returning * into w;
  update public.branch_operation_records set amount=w.quantity,status='Edited',actor=c.username,
    payload=payload||jsonb_build_object('quantity',w.quantity,'reason',w.reason,'verifiedBy',w.verified_by,
      'status','Edited','editReason',w.edit_reason,'editedBy',c.username,'editedAt',w.edited_at),updated_at=now()
  where branch='SNB' and record_type='waste_log' and record_id=w.id::text;
  return w;
end;
$$;

create or replace function public.cancel_snb_waste_log_secure(
  p_log_id uuid,
  p_reason text,
  p_password text
)
returns public.branch_waste_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  w public.branch_waste_logs%rowtype;
  s public.branch_stock%rowtype;
  next_qty numeric;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if c.role not in ('admin_snb','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if not exists (
    select 1 from public.staff_users u where u.id=c.staff_id
      and extensions.crypt(coalesce(p_password,''),coalesce(nullif(u.password_hash,''),u.password))=coalesce(nullif(u.password_hash,''),u.password)
  ) then raise exception 'INVALID_PASSWORD'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'Cancellation reason is required'; end if;

  select * into w from public.branch_waste_logs where id=p_log_id and branch='SNB' for update;
  if w.id is null then raise exception 'Stock movement not found'; end if;
  if w.status='Cancelled' then return w; end if;
  select * into s from public.branch_stock where branch='SNB'
    and ((w.item_barcode is not null and item_barcode=w.item_barcode)
      or (w.item_barcode is null and lower(btrim(item_name))=lower(btrim(w.item_name))))
    order by case when w.item_barcode is not null and item_barcode=w.item_barcode then 0 else 1 end, updated_at desc
    limit 1 for update;
  if s.id is null then raise exception 'Stock item not found'; end if;
  next_qty:=round(s.quantity+w.quantity,3);
  update public.branch_stock set quantity=next_qty,last_updated_at=now(),updated_at=now(),last_updated_by=c.username where id=s.id;
  insert into public.branch_stock_adjustments(branch,item_name,old_quantity,new_quantity,delta,reason,adjusted_by,reference_id,notes)
  values ('SNB',s.item_name,s.quantity,next_qty,w.quantity,'Waste cancellation - '||w.log_type,c.username,w.id::text,p_reason);
  update public.branch_waste_logs set status='Cancelled',cancelled_at=now(),cancelled_by_user_id=c.staff_id,
    cancelled_by_username=c.username,cancellation_reason=btrim(p_reason)
  where id=w.id returning * into w;
  update public.branch_operation_records set status='Cancelled',actor=c.username,
    payload=payload||jsonb_build_object('status','Cancelled','cancellationReason',w.cancellation_reason,
      'cancelledBy',c.username,'cancelledAt',w.cancelled_at,'stockRestored',w.quantity),updated_at=now()
  where branch='SNB' and record_type='waste_log' and record_id=w.id::text;
  return w;
end;
$$;

create or replace function public.manage_branch_advance_cake_order_secure(
  p_branch text,
  p_source_order_id text,
  p_action text,
  p_details jsonb,
  p_reason text,
  p_password text,
  p_refund_mode text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  o public.branch_operation_records%rowtype;
  cake public.cake_master_orders%rowtype;
  actor text;
  action_value text:=lower(btrim(coalesce(p_action,'')));
  order_no text;
  paid numeric(12,2):=0;
  total_value numeric(12,2);
  refund_mode_value text:=lower(btrim(coalesce(p_refund_mode,'')));
  refund_no text;
  counter_id uuid;
  next_payload jsonb;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if (p_branch='SNB' and c.role not in ('branch_snb','admin_snb','admin','owner'))
    or (p_branch='VRSNB' and c.role not in ('branch_vrsnb','admin_vrsnb','admin','owner')) then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if not exists (
    select 1 from public.staff_users u where u.id=c.staff_id
      and extensions.crypt(coalesce(p_password,''),coalesce(nullif(u.password_hash,''),u.password))=coalesce(nullif(u.password_hash,''),u.password)
  ) then raise exception 'INVALID_PASSWORD'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'Reason is required'; end if;
  if action_value not in ('edit','cancel') then raise exception 'Invalid action'; end if;

  select * into o from public.branch_operation_records
  where branch=p_branch and record_type='advance_order' and record_id=p_source_order_id for update;
  if o.id is null then raise exception 'Advance order not found'; end if;
  if lower(coalesce(o.status,'')) in ('paid in full','cancelled') then raise exception 'Completed or cancelled orders cannot be changed'; end if;
  select * into cake from public.cake_master_orders
  where branch=p_branch and source_order_id=p_source_order_id for update;
  if cake.id is not null and cake.status<>'New' then
    raise exception 'Cake Master has already accepted this order. It can no longer be edited or cancelled';
  end if;

  actor:=coalesce(c.display_name,c.username,'Staff');
  order_no:=coalesce(o.record_no,o.payload->>'orderNo');
  select coalesce(sum(case when payment_stage in ('advance','balance') then amount when payment_stage='refund' then -amount else 0 end),0)
  into paid from public.branch_advance_payments where branch=p_branch and order_no=order_no;
  paid:=greatest(paid,coalesce(nullif(o.payload->>'advanceAmount','')::numeric,0));

  if action_value='edit' then
    total_value:=round(coalesce(nullif(p_details->>'orderValue','')::numeric,nullif(o.payload->>'orderValue','')::numeric,0),2);
    if total_value<=0 or total_value<paid then raise exception 'Edited order value cannot be below the amount already paid'; end if;
    next_payload:=o.payload||jsonb_build_object(
      'customerName',coalesce(nullif(p_details->>'customerName',''),o.payload->>'customerName'),
      'mobile',coalesce(nullif(p_details->>'mobile',''),o.payload->>'mobile'),
      'deliveryDate',coalesce(nullif(p_details->>'deliveryDate',''),o.payload->>'deliveryDate'),
      'deliveryTime',coalesce(nullif(p_details->>'deliveryTime',''),o.payload->>'deliveryTime'),
      'cakeKg',coalesce(nullif(p_details->>'cakeKg',''),o.payload->>'cakeKg'),
      'items',coalesce(p_details->'items',o.payload->'items'),
      'flavor',coalesce(nullif(p_details->>'flavor',''),o.payload->>'flavor'),
      'shape',coalesce(nullif(p_details->>'shape',''),o.payload->>'shape'),
      'creamType',coalesce(nullif(p_details->>'creamType',''),o.payload->>'creamType'),
      'messageOnCake',coalesce(p_details->>'messageOnCake',o.payload->>'messageOnCake'),
      'designNotes',coalesce(p_details->>'designNotes',o.payload->>'designNotes'),
      'orderValue',total_value,'balanceAmount',round(total_value-paid,2),
      'lastEditReason',btrim(p_reason),'lastEditedBy',actor,'lastEditedAt',now()
    );
    update public.branch_operation_records set payload=next_payload,amount=total_value,actor=actor,status='Edited',updated_at=now() where id=o.id;
    if cake.id is not null then
      update public.cake_master_orders set
        customer_name=next_payload->>'customerName',mobile=next_payload->>'mobile',
        delivery_date=nullif(next_payload->>'deliveryDate','')::date,delivery_time=next_payload->>'deliveryTime',
        cake_kg=next_payload->>'cakeKg',quantity=nullif(next_payload->>'cakeKg','')::numeric,
        flavor=next_payload->>'flavor',shape=next_payload->>'shape',cream_type=next_payload->>'creamType',
        message_on_cake=next_payload->>'messageOnCake',design_notes=next_payload->>'designNotes',
        order_value=total_value,balance_amount=round(total_value-paid,2),updated_at=now()
      where id=cake.id;
    end if;
    return jsonb_build_object('ok',true,'action','edit','payload',next_payload);
  end if;

  if paid>0 and refund_mode_value not in ('cash','upi','card') then raise exception 'Select Cash, UPI, or Card for the refund'; end if;
  counter_id:=public.find_open_counter_session(p_branch,c.staff_id);
  if paid>0 and counter_id is null then raise exception 'Open the cashier counter before refunding this advance'; end if;
  refund_no:=p_branch||'-ADV-CANCEL-'||upper(left(replace(gen_random_uuid()::text,'-',''),10));
  if paid>0 then
    insert into public.branch_advance_payments(branch,order_no,payment_mode,amount,payment_stage,collected_by,remarks,collector_user_id,collector_username,counter_session_id)
    values(p_branch,order_no,refund_mode_value,paid,'refund',actor,'Cancelled advance order: '||p_reason,c.staff_id,c.username,counter_id);
    insert into public.branch_sale_payments(branch,bill_no,payment_mode,amount,payment_purpose,remarks,collected_by,collected_role,cashier_user_id,cashier_username,counter_session_id)
    values(p_branch,order_no,refund_mode_value,paid,'refund','Cancelled advance order: '||p_reason,actor,c.role,c.staff_id,c.username,counter_id);
    insert into public.branch_return_records(branch,bill_no,return_no,amount,payment_mode,returned_by,reason,items,cashier_user_id,cashier_username,counter_session_id)
    values(p_branch,order_no,refund_no,paid,refund_mode_value,actor,'Advance order cancelled: '||p_reason,coalesce(o.payload->'items','[]'::jsonb),c.staff_id,c.username,counter_id);
  end if;
  next_payload:=o.payload||jsonb_build_object('status','Cancelled','balanceAmount',0,'cancellationReason',btrim(p_reason),
    'cancelledBy',actor,'cancelledAt',now(),'refundAmount',paid,'refundMode',nullif(refund_mode_value,''),'refundNo',refund_no);
  update public.branch_operation_records set payload=next_payload,status='Cancelled',actor=actor,updated_at=now() where id=o.id;
  if cake.id is not null then update public.cake_master_orders set status='Cancelled',cancelled_by=actor,cancelled_at=now(),cancellation_reason=btrim(p_reason),updated_at=now() where id=cake.id; end if;
  insert into public.branch_operation_records(branch,record_type,record_id,record_no,amount,status,actor,payload)
  values(p_branch,'notification',gen_random_uuid()::text,order_no,paid,'Unread',actor,
    jsonb_build_object('branch',p_branch,'type','Advance Order','status','Unread','title','Advance cake order '||order_no||' cancelled',
      'details',p_reason||case when paid>0 then ' · Refund '||paid||' via '||upper(refund_mode_value) else '' end,'raisedBy',actor,'createdAt',now()));
  return jsonb_build_object('ok',true,'action','cancel','payload',next_payload,'refundAmount',paid,'refundNo',refund_no);
end;
$$;

create or replace function public.return_bakery_order_for_correction_secure(
  p_order_id uuid,
  p_item_ids jsonb,
  p_reason text
)
returns public.bakery_orders
language plpgsql
security definer
set search_path = public
as $$
declare c record; o public.bakery_orders%rowtype; returned jsonb; actor text;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if c.role not in ('packing','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'Correction reason is required'; end if;
  if jsonb_typeof(coalesce(p_item_ids,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_item_ids,'[]'::jsonb))=0 then raise exception 'Select at least one item'; end if;
  select * into o from public.bakery_orders where id=p_order_id for update;
  if o.id is null then raise exception 'Packing order not found'; end if;
  if o.status not in ('packed','partially_packed') then raise exception 'Only orders waiting at Packing can be returned'; end if;
  select coalesce(jsonb_agg(x),'[]'::jsonb) into returned from jsonb_array_elements(coalesce(o.prepared_items,'[]'::jsonb)) x where (x->>'itemId') in (select jsonb_array_elements_text(p_item_ids));
  if jsonb_array_length(returned)=0 then raise exception 'Selected prepared items were not found'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(o.dispatch_log,'[]'::jsonb)) d where d->>'itemName' in (select x->>'itemName' from jsonb_array_elements(returned) x)) then
    raise exception 'Already dispatched items cannot be returned to Baker';
  end if;
  actor:=coalesce(c.display_name,c.username,'Packing');
  update public.bakery_orders set
    prepared_items=(select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(coalesce(o.prepared_items,'[]'::jsonb)) x where not ((x->>'itemId') in (select jsonb_array_elements_text(p_item_ids)))),
    status='correction_required',correction_request=jsonb_build_object('items',returned,'reason',btrim(p_reason),'requestedBy',actor,'requestedAt',now()),sent_to_packing_at=null
  where id=o.id returning * into o;
  return o;
end;
$$;

create or replace function public.return_cake_order_for_correction_secure(p_id uuid,p_reason text)
returns public.cake_master_orders
language plpgsql
security definer
set search_path = public
as $$
declare c record; o public.cake_master_orders%rowtype; actor text;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if c.role not in ('packing','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'Correction reason is required'; end if;
  select * into o from public.cake_master_orders where id=p_id for update;
  if o.id is null then raise exception 'Cake order not found'; end if;
  if o.status not in ('Ready for Packing','Packed') then raise exception 'Only cakes waiting at Packing can be returned'; end if;
  actor:=coalesce(c.display_name,c.username,'Packing');
  update public.cake_master_orders set status='Correction Required',correction_reason=btrim(p_reason),
    correction_requested_by=actor,correction_requested_at=now(),correction_count=coalesce(correction_count,0)+1,updated_at=now()
  where id=o.id returning * into o;
  return o;
end;
$$;

-- Preserve the production status function while adding correction/cancellation transitions.
create or replace function public.update_cake_master_order_status(p_id uuid,p_new_status text,p_actor text,p_prepared_quantity numeric default null)
returns public.cake_master_orders
language plpgsql
security definer
set search_path = public
as $$
declare c record; row_out public.cake_master_orders%rowtype; actor_name text; notif_title text; new_order_value numeric; new_balance numeric;
begin
  select * into c from public.current_app_session_context(); if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  actor_name:=coalesce(nullif(trim(p_actor),''),c.username,'Staff');
  select * into row_out from public.cake_master_orders where id=p_id for update; if row_out.id is null then raise exception 'Cake order not found'; end if;
  if row_out.status in ('Cancelled','Dispatched') then raise exception 'Cancelled or dispatched orders cannot be changed'; end if;
  if p_new_status in ('Accepted','Baking','Ready for Packing') then
    if c.role not in ('cake_master','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  elsif p_new_status in ('Packed','Dispatched') then
    if c.role not in ('packing','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  else raise exception 'Invalid status %',p_new_status; end if;
  if p_new_status='Ready for Packing' and row_out.status not in ('Baking','Correction Required') then raise exception 'Cake must be with Cake Master before sending to Packing'; end if;
  if p_new_status='Packed' and row_out.status<>'Ready for Packing' then raise exception 'Cake is not ready for packing'; end if;
  if p_new_status='Dispatched' and row_out.status not in ('Ready for Packing','Packed') then raise exception 'Cake is not ready for dispatch'; end if;
  if p_new_status='Ready for Packing' then
    if coalesce(p_prepared_quantity,0)<=0 then raise exception 'Prepared quantity must be greater than zero'; end if;
    new_order_value:=round(p_prepared_quantity*coalesce(row_out.rate_per_unit,0),2); new_balance:=round(new_order_value-coalesce(row_out.advance_amount,0),2);
  else new_order_value:=row_out.order_value; new_balance:=row_out.balance_amount; end if;
  update public.cake_master_orders set status=p_new_status,
    accepted_by=case when p_new_status in ('Accepted','Baking') and accepted_by is null then actor_name else accepted_by end,
    accepted_at=case when p_new_status in ('Accepted','Baking') and accepted_at is null then now() else accepted_at end,
    baking_started_by=case when p_new_status='Baking' then actor_name else baking_started_by end,
    baking_started_at=case when p_new_status='Baking' then now() else baking_started_at end,
    sent_to_packing_by=case when p_new_status='Ready for Packing' then actor_name else sent_to_packing_by end,
    sent_to_packing_at=case when p_new_status='Ready for Packing' then now() else sent_to_packing_at end,
    prepared_quantity=case when p_new_status='Ready for Packing' then p_prepared_quantity else prepared_quantity end,
    order_value=new_order_value,balance_amount=new_balance,
    correction_reason=case when p_new_status='Ready for Packing' then null else correction_reason end,
    packed_by=case when p_new_status='Packed' then actor_name else packed_by end,packed_at=case when p_new_status='Packed' then now() else packed_at end,
    dispatched_by=case when p_new_status='Dispatched' then actor_name else dispatched_by end,dispatched_at=case when p_new_status='Dispatched' then now() else dispatched_at end,updated_at=now()
  where id=p_id returning * into row_out;
  notif_title:=case p_new_status when 'Baking' then format('Cake order %s accepted and now being baked',row_out.order_no)
    when 'Ready for Packing' then format('Cake order %s sent to Packing — prepared %s',row_out.order_no,p_prepared_quantity)
    when 'Packed' then format('Cake order %s packed',row_out.order_no) when 'Dispatched' then format('Cake order %s dispatched to your branch',row_out.order_no)
    else format('Cake order %s updated',row_out.order_no) end;
  insert into public.branch_operation_records(branch,record_type,record_id,record_no,actor,status,payload)
  values(row_out.branch,'notification',gen_random_uuid()::text,row_out.order_no,actor_name,'Unread',jsonb_build_object('branch',row_out.branch,'type','Advance Order','status','Unread','title',notif_title,'details',format('Slip %s · Order %s',coalesce(row_out.slip_number,'-'),row_out.order_no),'raisedBy',actor_name,'createdAt',now()));
  update public.branch_operation_records set payload=payload||jsonb_build_object('storeStatus',case row_out.status when 'Ready for Packing' then 'packing' when 'Packed' then 'packing' when 'Dispatched' then 'dispatched' when 'Baking' then 'baking' else 'store' end)
    ||case when p_new_status='Ready for Packing' then jsonb_build_object('orderValue',new_order_value,'balanceAmount',new_balance,'cakeKg',p_prepared_quantity::text,'preparedQuantity',p_prepared_quantity) else '{}'::jsonb end,updated_at=now()
  where branch=row_out.branch and record_type='advance_order' and record_id=row_out.source_order_id;
  return row_out;
end;
$$;

revoke all on function public.edit_snb_waste_log_secure(uuid,numeric,text,text,text,text) from public;
revoke all on function public.cancel_snb_waste_log_secure(uuid,text,text) from public;
revoke all on function public.manage_branch_advance_cake_order_secure(text,text,text,jsonb,text,text,text) from public;
revoke all on function public.return_bakery_order_for_correction_secure(uuid,jsonb,text) from public;
revoke all on function public.return_cake_order_for_correction_secure(uuid,text) from public;
revoke all on function public.update_cake_master_order_status(uuid,text,text,numeric) from public;
grant execute on function public.edit_snb_waste_log_secure(uuid,numeric,text,text,text,text) to anon,authenticated;
grant execute on function public.cancel_snb_waste_log_secure(uuid,text,text) to anon,authenticated;
grant execute on function public.manage_branch_advance_cake_order_secure(text,text,text,jsonb,text,text,text) to anon,authenticated;
grant execute on function public.return_bakery_order_for_correction_secure(uuid,jsonb,text) to anon,authenticated;
grant execute on function public.return_cake_order_for_correction_secure(uuid,text) to anon,authenticated;
grant execute on function public.update_cake_master_order_status(uuid,text,text,numeric) to anon,authenticated;

notify pgrst,'reload schema';
