-- Permit receiver_snb to use the same stock sync and purchase workflow snapshot as SNB Admin.

do $$
declare
  function_sql text;
begin
  select pg_get_functiondef(
    'public.snb_sync_purchase_invoice_to_stock(uuid,text)'::regprocedure
  ) into function_sql;

  function_sql := replace(
    function_sql,
    'c.role not in (''admin_snb'', ''admin'', ''owner'')',
    'c.role not in (''receiver_snb'', ''admin_snb'', ''admin'', ''owner'')'
  );
  function_sql := replace(
    function_sql,
    'c.role not in (''admin_snb'',''admin'',''owner'')',
    'c.role not in (''receiver_snb'',''admin_snb'',''admin'',''owner'')'
  );

  execute function_sql;
end;
$$;

do $$
declare
  function_sql text;
begin
  select pg_get_functiondef(
    'public.get_snb_purchase_workflow_data(date,date)'::regprocedure
  ) into function_sql;

  function_sql := replace(
    function_sql,
    'c.role not in (''admin_snb'', ''admin'', ''owner'')',
    'c.role not in (''receiver_snb'', ''admin_snb'', ''admin'', ''owner'')'
  );
  function_sql := replace(
    function_sql,
    'c.role not in (''admin_snb'',''admin'',''owner'')',
    'c.role not in (''receiver_snb'',''admin_snb'',''admin'',''owner'')'
  );

  execute function_sql;
end;
$$;

grant execute on function public.snb_sync_purchase_invoice_to_stock(uuid,text)
  to anon, authenticated, service_role;
grant execute on function public.get_snb_purchase_workflow_data(date,date)
  to anon, authenticated, service_role;
select pg_notify('pgrst','reload schema');
select pg_notify('pgrst','reload config');
