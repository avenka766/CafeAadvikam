-- BUG FIX (2026-08-18): the audit script (test:audit) has required every
-- SNB reporting view to be security_invoker for a while now, and the live
-- database already has security_invoker = true set on all 22 of these views
-- (verified directly against the database before writing this file) -- the
-- actual security posture has been correct. What was missing was this
-- migration file itself: with no committed record of this setting, a fresh
-- database rebuilt from migrations alone would silently lose this
-- protection, and the audit had nothing to check against in the repo. This
-- file is a no-op against the current database (every ALTER below just
-- re-asserts what's already true) and exists purely to close that gap.

alter view public.snb_bill_item_detail set (security_invoker = true);
alter view public.snb_bill_item_category_detail set (security_invoker = true);
alter view public.snb_supplier_outstanding_report set (security_invoker = true);
alter view public.snb_cashier_session_report set (security_invoker = true);
alter view public.snb_daily_branch_report set (security_invoker = true);
alter view public.snb_session_bill_totals set (security_invoker = true);
alter view public.snb_session_advance_total set (security_invoker = true);
alter view public.snb_cash_operation_rows set (security_invoker = true);
alter view public.snb_counter_calculated_totals set (security_invoker = true);
alter view public.snb_item_wise_sales_report set (security_invoker = true);
alter view public.snb_category_wise_sales_report set (security_invoker = true);
alter view public.snb_session_pos_payments set (security_invoker = true);
alter view public.snb_session_advance_cash set (security_invoker = true);
alter view public.snb_counter_sales_totals set (security_invoker = true);
alter view public.snb_cashier_bill_report set (security_invoker = true);
alter view public.snb_item_category_map set (security_invoker = true);
alter view public.snb_bill_discount_report set (security_invoker = true);
alter view public.snb_session_credit_collections set (security_invoker = true);
alter view public.snb_counter_collection_totals set (security_invoker = true);
alter view public.snb_salesperson_bill_report set (security_invoker = true);
alter view public.snb_daily_counter_summary set (security_invoker = true);
alter view public.snb_session_return_totals set (security_invoker = true);
