-- Permit receiver_snb to use the existing audited revision RPC and attribute edits to SNB Order.

do $$
declare
  function_sql text;
begin
  select pg_get_functiondef(
    'public.save_snb_purchase_invoice_revision_secure(uuid,text,text,date,jsonb,text,text,text)'::regprocedure
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
  function_sql := replace(
    function_sql,
    'c.username',
    '(case when c.role = ''receiver_snb'' then ''SNB Order - '' || c.username else c.username end)'
  );

  execute function_sql;
end;
$$;

grant execute on function public.save_snb_purchase_invoice_revision_secure(
  uuid,text,text,date,jsonb,text,text,text
) to anon, authenticated, service_role;
select pg_notify('pgrst','reload schema');
