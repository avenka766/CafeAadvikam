-- Adds a verified UPI settlement audit to SNB and VRSNB cashier closures.
-- upi_total / upi_sales remain the system-calculated values.
-- actual_upi / counted_upi store the amount verified by the cashier.

alter table if exists public.branch_daily_closures
  add column if not exists actual_upi numeric(14,2) not null default 0,
  add column if not exists upi_difference numeric(14,2) not null default 0,
  add column if not exists upi_notes text;

alter table if exists public.branch_counter_sessions
  add column if not exists counted_upi numeric(14,2),
  add column if not exists upi_difference numeric(14,2),
  add column if not exists upi_notes text;

comment on column public.branch_daily_closures.actual_upi is
  'UPI amount manually verified by the cashier from the UPI app or settlement report.';
comment on column public.branch_daily_closures.upi_difference is
  'Verified UPI amount minus the system UPI total.';
comment on column public.branch_daily_closures.upi_notes is
  'Required audit explanation when the verified UPI amount differs from the system total.';

comment on column public.branch_counter_sessions.counted_upi is
  'UPI amount manually verified while finalizing the counter session.';
comment on column public.branch_counter_sessions.upi_difference is
  'Verified UPI amount minus the session UPI sales total.';
comment on column public.branch_counter_sessions.upi_notes is
  'UPI settlement audit remarks for the finalized counter session.';

notify pgrst, 'reload schema';
