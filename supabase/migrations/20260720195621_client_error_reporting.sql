create table if not exists public.client_error_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  staff_id uuid not null references public.staff_users(id),
  route text not null default '/',
  module text not null default 'Web application',
  severity text not null default 'error' check (severity in ('warning', 'error', 'fatal')),
  error_code text,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  online boolean not null default true,
  app_version text
);

alter table public.client_error_events enable row level security;
revoke all on table public.client_error_events from anon, authenticated;

create index if not exists client_error_events_staff_time_idx
  on public.client_error_events(staff_id, occurred_at desc);

create or replace function public.report_client_error_secure(
  p_route text,
  p_module text,
  p_severity text,
  p_error_code text,
  p_message text,
  p_details jsonb default '{}'::jsonb,
  p_online boolean default true,
  p_app_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  event_id uuid;
  safe_details jsonb;
begin
  select * into c from public.current_app_session_context();
  if c.staff_id is null then
    raise exception 'SESSION_REQUIRED';
  end if;

  -- A broken screen can emit the same error repeatedly. Keep enough reports
  -- for diagnosis without allowing a client loop to grow the table forever.
  if (
    select count(*)
    from public.client_error_events
    where staff_id = c.staff_id
      and occurred_at >= now() - interval '1 minute'
  ) >= 20 then
    return null;
  end if;

  safe_details := case
    when p_details is null then '{}'::jsonb
    when jsonb_typeof(p_details) <> 'object' then jsonb_build_object('summary', left(p_details::text, 8000))
    when pg_column_size(p_details) > 12000 then jsonb_build_object('summary', left(p_details::text, 8000), 'truncated', true)
    else p_details
  end;

  insert into public.client_error_events(
    staff_id, route, module, severity, error_code, message,
    details, online, app_version
  ) values (
    c.staff_id,
    left(coalesce(nullif(btrim(p_route), ''), '/'), 300),
    left(coalesce(nullif(btrim(p_module), ''), 'Web application'), 120),
    case when lower(p_severity) in ('warning', 'error', 'fatal') then lower(p_severity) else 'error' end,
    nullif(left(btrim(coalesce(p_error_code, '')), 120), ''),
    left(coalesce(nullif(btrim(p_message), ''), 'Unknown application error'), 1200),
    safe_details,
    coalesce(p_online, true),
    nullif(left(btrim(coalesce(p_app_version, '')), 80), '')
  ) returning id into event_id;

  return event_id;
end;
$$;

revoke all on function public.report_client_error_secure(text,text,text,text,text,jsonb,boolean,text) from public;
grant execute on function public.report_client_error_secure(text,text,text,text,text,jsonb,boolean,text) to anon, authenticated;
