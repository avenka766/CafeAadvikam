-- Older advance cake orders stored only their custom flavour description.
-- Link them to the reusable Birthday Cakes stock row so they can be closed.

update public.branch_operation_records
set payload = jsonb_set(
      payload,
      '{items,0,barcode}',
      to_jsonb(case payload->>'cakeTypeId'
        when 'butter-birthday' then 1163
        when 'butter-premium' then 1164
        when 'butter-fondant' then 1162
        when 'fresh-pastry' then 1166
        when 'fresh-flavour-pastry' then 1167
        when 'fresh-prime' then 1168
        when 'fresh-fondant' then 1169
      end),
      true
    ),
    updated_at = now()
where record_type = 'advance_order'
  and branch in ('SNB','Hosur')
  and jsonb_typeof(payload->'items') = 'array'
  and jsonb_array_length(payload->'items') > 0
  and nullif(payload->'items'->0->>'barcode','') is null
  and payload->>'cakeTypeId' in (
    'butter-birthday','butter-premium','butter-fondant','fresh-pastry',
    'fresh-flavour-pastry','fresh-prime','fresh-fondant'
  );

notify pgrst, 'reload schema';
