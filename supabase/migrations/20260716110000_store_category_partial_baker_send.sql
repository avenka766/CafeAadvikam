-- Let Store send selected order lines to Baker without losing the remaining
-- lines. A request id makes retries idempotent.

alter table public.bakery_orders
  add column if not exists store_send_request_id text,
  add column if not exists store_source_order_number integer;

create unique index if not exists bakery_orders_store_send_request_id_key
  on public.bakery_orders (store_send_request_id)
  where store_send_request_id is not null;

create or replace function public.send_selected_bakery_items_to_baker(
  p_order_id uuid,
  p_selected_indexes jsonb,
  p_request_id text,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  source_order public.bakery_orders%rowtype;
  prior_order public.bakery_orders%rowtype;
  selected_indexes integer[];
  selected_items jsonb;
  remaining_items jsonb;
  sent_order public.bakery_orders%rowtype;
  actor_value text;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if c.role not in ('store','admin','owner') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if p_order_id is null then raise exception 'Order is required'; end if;
  if btrim(coalesce(p_request_id,'')) = '' then raise exception 'Send request id is required'; end if;
  if jsonb_typeof(coalesce(p_selected_indexes,'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_selected_indexes) = 0 then
    raise exception 'Select at least one item';
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_selected_indexes) entry(value)
    where entry.value !~ '^\d+$'
  ) then raise exception 'Invalid item selection'; end if;

  select * into prior_order
  from public.bakery_orders
  where store_send_request_id = btrim(p_request_id)
  limit 1;
  if found then
    return jsonb_build_object(
      'ok',true,'duplicate',true,'sentOrderId',prior_order.id,
      'sentOrderNumber',prior_order.order_number,
      'sourceOrderNumber',coalesce(prior_order.store_source_order_number,prior_order.order_number),
      'selectedCount',jsonb_array_length(prior_order.items),
      'remainingCount',0
    );
  end if;

  select * into source_order
  from public.bakery_orders
  where id = p_order_id
  for update;
  if not found then raise exception 'Bakery order was not found'; end if;
  if source_order.status <> 'processing' then
    raise exception 'Accept the Store order before sending items to Baker';
  end if;

  select array_agg(distinct entry.value::integer order by entry.value::integer)
    into selected_indexes
  from jsonb_array_elements_text(p_selected_indexes) entry(value);
  if exists (
    select 1 from unnest(selected_indexes) selected_index
    where selected_index < 0 or selected_index >= jsonb_array_length(source_order.items)
  ) then raise exception 'The order changed. Review the item selection and try again'; end if;

  select
    coalesce(jsonb_agg(item.value order by item.ordinality)
      filter (where (item.ordinality - 1)::integer = any(selected_indexes)),'[]'::jsonb),
    coalesce(jsonb_agg(item.value order by item.ordinality)
      filter (where not ((item.ordinality - 1)::integer = any(selected_indexes))),'[]'::jsonb)
    into selected_items, remaining_items
  from jsonb_array_elements(source_order.items) with ordinality item(value,ordinality);

  if jsonb_array_length(selected_items) = 0 then raise exception 'Select at least one item'; end if;
  actor_value := coalesce(nullif(btrim(p_actor),''),c.username,'Store');

  if jsonb_array_length(remaining_items) = 0 then
    update public.bakery_orders
    set status = 'baking',
        store_send_request_id = btrim(p_request_id),
        store_source_order_number = coalesce(store_source_order_number,order_number)
    where id = source_order.id
    returning * into sent_order;
  else
    insert into public.bakery_orders(
      items,status,created_by,created_at,expected_output,materials_calculated_at,
      prepared_items,sent_to_packing_at,dispatch_log,target_branch,notes,removed_items,
      staged_items,store_send_request_id,store_source_order_number
    ) values (
      selected_items,'baking',actor_value,now(),null,now(),'[]'::jsonb,null,
      '[]'::jsonb,source_order.target_branch,
      concat_ws(' | ',nullif(source_order.notes,''),'Store batch from order #' || source_order.order_number),
      '[]'::jsonb,'[]'::jsonb,btrim(p_request_id),source_order.order_number
    ) returning * into sent_order;

    update public.bakery_orders
    set items = remaining_items,
        expected_output = null,
        materials_calculated_at = null
    where id = source_order.id;
  end if;

  return jsonb_build_object(
    'ok',true,'duplicate',false,'sentOrderId',sent_order.id,
    'sentOrderNumber',sent_order.order_number,'sourceOrderId',source_order.id,
    'sourceOrderNumber',source_order.order_number,
    'selectedCount',jsonb_array_length(selected_items),
    'remainingCount',jsonb_array_length(remaining_items)
  );
end;
$$;

revoke all on function public.send_selected_bakery_items_to_baker(uuid,jsonb,text,text) from public;
grant execute on function public.send_selected_bakery_items_to_baker(uuid,jsonb,text,text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
