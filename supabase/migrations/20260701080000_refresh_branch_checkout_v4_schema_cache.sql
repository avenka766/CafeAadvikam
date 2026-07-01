-- Keep the branch checkout RPC visible to PostgREST after deployments that add
-- or replace the v4 wrapper. The wrapper itself is installed by
-- 20260701033000_restore_snb_mix_combo_flexible_stock.sql.

grant execute on function public.complete_branch_checkout_canonical_v4(
  text, jsonb, jsonb, text, text, text, text,
  numeric, numeric, numeric, text, text, text, numeric
) to anon, authenticated, service_role;

comment on function public.complete_branch_checkout_canonical_v4(
  text, jsonb, jsonb, text, text, text, text,
  numeric, numeric, numeric, text, text, text, numeric
) is 'Branch checkout v4 with discount support and SNB Mix & Combo handling.';

select pg_notify('pgrst', 'reload schema');
select pg_notify('pgrst', 'reload config');
