-- Relink legacy SNB Order advances that were stored under the generated UUID
-- before the visible SNB-ADV number was passed into the secure create RPC.

with candidate_matches as (
  select
    payment.id as payment_id,
    operation.record_no,
    count(*) over (partition by payment.id) as candidate_count,
    row_number() over (
      partition by payment.id
      order by abs(extract(epoch from (operation.created_at - advance_order.created_at)))
    ) as candidate_rank
  from public.branch_advance_payments payment
  join public.branch_advance_orders advance_order
    on advance_order.id = payment.advance_order_id
   and advance_order.branch = payment.branch
  join public.branch_operation_records operation
    on operation.branch = payment.branch
   and operation.record_type = 'advance_order'
   and operation.record_no like 'SNB-ADV-%'
   and operation.payload->>'customerName' = advance_order.customer_name
   and round(coalesce((operation.payload->>'orderValue')::numeric, 0), 2) = round(advance_order.subtotal, 2)
   and round(coalesce((operation.payload->>'advanceAmount')::numeric, 0), 2) = round(payment.amount, 2)
   and abs(extract(epoch from (operation.created_at - advance_order.created_at))) <= 5
  where payment.branch = 'SNB'
    and payment.payment_stage = 'advance'
    and payment.order_no = payment.advance_order_id::text
), unique_matches as (
  select payment_id, record_no
  from candidate_matches
  where candidate_count = 1 and candidate_rank = 1
)
update public.branch_advance_payments payment
set order_no = matched.record_no
from unique_matches matched
where payment.id = matched.payment_id;

notify pgrst, 'reload schema';
