-- Repair branch item/stock links created by the earlier uppercase-normalization bug.
-- Safe to run on both Test and Aadivikam1.

create or replace function public.normalize_branch_item_name(p_name text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '', 'g')
$$;

create table if not exists public.branch_link_repair_log (
  id uuid primary key default gen_random_uuid(),
  repaired_at timestamptz not null default now(),
  table_name text not null,
  row_id text not null,
  branch text not null,
  item_name text not null,
  old_item_barcode bigint,
  new_item_barcode bigint,
  reason text not null
);

alter table public.branch_link_repair_log
  alter column row_id type text using row_id::text;

-- Resolve every stock row using its correctly normalized name. A unique existing
-- barcode is retained only when the name cannot be resolved. A duplicated,
-- unresolvable barcode is cleared instead of being allowed to point at many items.
create temporary table _branch_stock_resolution on commit drop as
with base as (
  select
    bs.id,
    bs.branch,
    bs.item_name,
    bs.item_barcode,
    case when bs.branch = 'Hosur' then 'SNB' else bs.branch end as catalog_branch,
    public.normalize_branch_item_name(bs.item_name) as item_key,
    count(*) over (partition by bs.branch, bs.item_barcode) as current_link_count
  from public.branch_stock bs
), resolved as (
  select
    b.*,
    (
      select bi.barcode
      from public.branch_items bi
      where bi.branch = b.catalog_branch
        and public.normalize_branch_item_name(bi.name) = b.item_key
      limit 1
    ) as name_match_barcode,
    exists (
      select 1
      from public.branch_items bi
      where bi.branch = b.catalog_branch
        and bi.barcode = b.item_barcode
    ) as current_barcode_exists
  from base b
)
select
  id,
  branch,
  item_name,
  item_barcode as old_item_barcode,
  case
    when name_match_barcode is not null then name_match_barcode
    when current_barcode_exists and current_link_count = 1 then item_barcode
    else null
  end as new_item_barcode,
  case
    when name_match_barcode is not null and name_match_barcode is distinct from item_barcode
      then 'relinked-by-normalized-name'
    when name_match_barcode is null and current_barcode_exists and current_link_count = 1
      then 'kept-unique-existing-link'
    when item_barcode is not null
      then 'cleared-ambiguous-link'
    else 'left-unlinked'
  end as reason
from resolved;

insert into public.branch_link_repair_log(
  table_name, row_id, branch, item_name, old_item_barcode, new_item_barcode, reason
)
select
  'branch_stock', id::text, branch, item_name, old_item_barcode, new_item_barcode, reason
from _branch_stock_resolution
where old_item_barcode is distinct from new_item_barcode;

update public.branch_stock bs
set item_barcode = r.new_item_barcode
from _branch_stock_resolution r
where bs.id = r.id
  and bs.item_barcode is distinct from r.new_item_barcode;

-- Merge case-variant/legacy duplicates that now resolve to the same canonical item.
create temporary table _branch_stock_merge on commit drop as
select
  bs.branch,
  bs.item_barcode,
  (array_agg(
    bs.id
    order by
      (bs.item_name = bi.name) desc,
      (bs.quantity <> 0) desc,
      bs.updated_at desc,
      bs.id::text
  ))[1]::text as survivor_id,
  round(sum(bs.quantity)::numeric, 3) as quantity,
  round(sum(coalesce(bs.reserved_quantity, 0))::numeric, 3) as reserved_quantity,
  max(bs.min_threshold) as min_threshold,
  max(bs.updated_at) as updated_at,
  max(bs.last_updated_at) as last_updated_at
from public.branch_stock bs
join public.branch_items bi
  on bi.branch = case when bs.branch = 'Hosur' then 'SNB' else bs.branch end
 and bi.barcode = bs.item_barcode
where bs.item_barcode is not null
group by bs.branch, bs.item_barcode
having count(*) > 1;

update public.branch_stock bs
set quantity = m.quantity,
    reserved_quantity = m.reserved_quantity,
    min_threshold = m.min_threshold,
    updated_at = coalesce(m.updated_at, bs.updated_at),
    last_updated_at = coalesce(m.last_updated_at, bs.last_updated_at)
from _branch_stock_merge m
where bs.id::text = m.survivor_id;

delete from public.branch_stock bs
using _branch_stock_merge m
where bs.branch = m.branch
  and bs.item_barcode = m.item_barcode
  and bs.id::text <> m.survivor_id;

update public.branch_stock bs
set item_name = bi.name,
    unit = case when bi.uom = 'Kgs' then 'kg' else 'pcs' end
from public.branch_items bi
where bi.branch = case when bs.branch = 'Hosur' then 'SNB' else bs.branch end
  and bi.barcode = bs.item_barcode
  and (
    bs.item_name is distinct from bi.name
    or bs.unit is distinct from case when bi.uom = 'Kgs' then 'kg' else 'pcs' end
  );

-- Threshold rows were backfilled by the same faulty expression. Repair and merge them.
create temporary table _branch_threshold_resolution on commit drop as
with base as (
  select
    bt.id,
    bt.branch,
    bt.item_name,
    bt.item_barcode,
    case when bt.branch = 'Hosur' then 'SNB' else bt.branch end as catalog_branch,
    public.normalize_branch_item_name(bt.item_name) as item_key,
    count(*) over (partition by bt.branch, bt.item_barcode) as current_link_count
  from public.branch_thresholds bt
), resolved as (
  select
    b.*,
    (
      select bi.barcode
      from public.branch_items bi
      where bi.branch = b.catalog_branch
        and public.normalize_branch_item_name(bi.name) = b.item_key
      limit 1
    ) as name_match_barcode,
    exists (
      select 1
      from public.branch_items bi
      where bi.branch = b.catalog_branch
        and bi.barcode = b.item_barcode
    ) as current_barcode_exists
  from base b
)
select
  id,
  branch,
  item_name,
  item_barcode as old_item_barcode,
  case
    when name_match_barcode is not null then name_match_barcode
    when current_barcode_exists and current_link_count = 1 then item_barcode
    else null
  end as new_item_barcode,
  case
    when name_match_barcode is not null and name_match_barcode is distinct from item_barcode
      then 'relinked-by-normalized-name'
    when name_match_barcode is null and current_barcode_exists and current_link_count = 1
      then 'kept-unique-existing-link'
    when item_barcode is not null
      then 'cleared-ambiguous-link'
    else 'left-unlinked'
  end as reason
from resolved;

insert into public.branch_link_repair_log(
  table_name, row_id, branch, item_name, old_item_barcode, new_item_barcode, reason
)
select
  'branch_thresholds', id::text, branch, item_name, old_item_barcode, new_item_barcode, reason
from _branch_threshold_resolution
where old_item_barcode is distinct from new_item_barcode;

update public.branch_thresholds bt
set item_barcode = r.new_item_barcode
from _branch_threshold_resolution r
where bt.id = r.id
  and bt.item_barcode is distinct from r.new_item_barcode;

create temporary table _branch_threshold_merge on commit drop as
select
  bt.branch,
  bt.item_barcode,
  (array_agg(
    bt.id
    order by
      (bt.item_name = bi.name) desc,
      bt.id::text
  ))[1]::text as survivor_id,
  max(bt.threshold) as threshold
from public.branch_thresholds bt
join public.branch_items bi
  on bi.branch = case when bt.branch = 'Hosur' then 'SNB' else bt.branch end
 and bi.barcode = bt.item_barcode
where bt.item_barcode is not null
group by bt.branch, bt.item_barcode
having count(*) > 1;

update public.branch_thresholds bt
set threshold = m.threshold
from _branch_threshold_merge m
where bt.id::text = m.survivor_id;

delete from public.branch_thresholds bt
using _branch_threshold_merge m
where bt.branch = m.branch
  and bt.item_barcode = m.item_barcode
  and bt.id::text <> m.survivor_id;

update public.branch_thresholds bt
set item_name = bi.name
from public.branch_items bi
where bi.branch = case when bt.branch = 'Hosur' then 'SNB' else bt.branch end
  and bi.barcode = bt.item_barcode
  and bt.item_name is distinct from bi.name;

-- Correct historical barcode backfills where an unambiguous normalized name exists.
update public.branch_sales row_data
set item_barcode = bi.barcode
from public.branch_items bi
where bi.branch = case when row_data.branch = 'Hosur' then 'SNB' else row_data.branch end
  and public.normalize_branch_item_name(bi.name) = public.normalize_branch_item_name(row_data.item_name)
  and row_data.item_barcode is distinct from bi.barcode;

update public.branch_incoming row_data
set item_barcode = bi.barcode
from public.branch_items bi
where bi.branch = case when row_data.branch = 'Hosur' then 'SNB' else row_data.branch end
  and public.normalize_branch_item_name(bi.name) = public.normalize_branch_item_name(row_data.item_name)
  and row_data.item_barcode is distinct from bi.barcode;

update public.branch_stock_mismatches row_data
set item_barcode = bi.barcode
from public.branch_items bi
where bi.branch = case when row_data.branch = 'Hosur' then 'SNB' else row_data.branch end
  and public.normalize_branch_item_name(bi.name) = public.normalize_branch_item_name(row_data.item_name)
  and row_data.item_barcode is distinct from bi.barcode;

-- Enforce one operational stock/threshold row per branch and canonical barcode.
create unique index if not exists branch_stock_branch_barcode_unique
  on public.branch_stock(branch, item_barcode)
  where item_barcode is not null;

create unique index if not exists branch_thresholds_branch_barcode_unique
  on public.branch_thresholds(branch, item_barcode)
  where item_barcode is not null;

create or replace function public.ensure_branch_stock_link(
  p_branch text,
  p_barcode bigint,
  p_legacy_name text default null
)
returns public.branch_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalog_branch text := case when p_branch = 'Hosur' then 'SNB' else p_branch end;
  v_item public.branch_items;
  v_survivor text;
  v_quantity numeric;
  v_reserved numeric;
  v_min_threshold integer;
  v_row public.branch_stock;
begin
  select * into v_item
  from public.branch_items
  where branch = v_catalog_branch and barcode = p_barcode;
  if not found then raise exception 'Item not found'; end if;

  perform pg_advisory_xact_lock(hashtext('branch-stock-link-' || p_branch || '-' || p_barcode::text));

  select
    (array_agg(
      id
      order by
        (item_barcode = p_barcode) desc,
        (item_name = v_item.name) desc,
        (quantity <> 0) desc,
        id::text
    ))[1]::text,
    round(sum(quantity)::numeric, 3),
    round(sum(coalesce(reserved_quantity, 0))::numeric, 3),
    max(min_threshold)
  into v_survivor, v_quantity, v_reserved, v_min_threshold
  from public.branch_stock
  where branch = p_branch
    and (
      item_barcode = p_barcode
      or (
        item_barcode is null
        and (
          public.normalize_branch_item_name(item_name) = public.normalize_branch_item_name(v_item.name)
          or (
            nullif(public.normalize_branch_item_name(p_legacy_name), '') is not null
            and public.normalize_branch_item_name(item_name) = public.normalize_branch_item_name(p_legacy_name)
          )
        )
      )
    );

  if v_survivor is null then
    insert into public.branch_stock(
      branch, item_name, item_barcode, quantity, unit, min_threshold, reserved_quantity
    ) values (
      p_branch,
      v_item.name,
      p_barcode,
      0,
      case when v_item.uom = 'Kgs' then 'kg' else 'pcs' end,
      case when v_item.uom = 'Kgs' then 2 else 10 end,
      0
    )
    returning * into v_row;
    return v_row;
  end if;

  delete from public.branch_stock
  where branch = p_branch
    and id::text <> v_survivor
    and (
      item_barcode = p_barcode
      or (
        item_barcode is null
        and (
          public.normalize_branch_item_name(item_name) = public.normalize_branch_item_name(v_item.name)
          or (
            nullif(public.normalize_branch_item_name(p_legacy_name), '') is not null
            and public.normalize_branch_item_name(item_name) = public.normalize_branch_item_name(p_legacy_name)
          )
        )
      )
    );

  update public.branch_stock
  set item_name = v_item.name,
      item_barcode = p_barcode,
      quantity = coalesce(v_quantity, 0),
      reserved_quantity = coalesce(v_reserved, 0),
      min_threshold = coalesce(v_min_threshold, case when v_item.uom = 'Kgs' then 2 else 10 end),
      unit = case when v_item.uom = 'Kgs' then 'kg' else 'pcs' end
  where id::text = v_survivor
  returning * into v_row;

  return v_row;
end
$$;

create or replace function public.ensure_branch_threshold_link(
  p_branch text,
  p_barcode bigint,
  p_legacy_name text default null
)
returns public.branch_thresholds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalog_branch text := case when p_branch = 'Hosur' then 'SNB' else p_branch end;
  v_item public.branch_items;
  v_survivor text;
  v_threshold integer;
  v_row public.branch_thresholds;
begin
  select * into v_item
  from public.branch_items
  where branch = v_catalog_branch and barcode = p_barcode;
  if not found then raise exception 'Item not found'; end if;

  perform pg_advisory_xact_lock(hashtext('branch-threshold-link-' || p_branch || '-' || p_barcode::text));

  select
    (array_agg(
      id
      order by
        (item_barcode = p_barcode) desc,
        (item_name = v_item.name) desc,
        id::text
    ))[1]::text,
    max(threshold)
  into v_survivor, v_threshold
  from public.branch_thresholds
  where branch = p_branch
    and (
      item_barcode = p_barcode
      or (
        item_barcode is null
        and (
          public.normalize_branch_item_name(item_name) = public.normalize_branch_item_name(v_item.name)
          or (
            nullif(public.normalize_branch_item_name(p_legacy_name), '') is not null
            and public.normalize_branch_item_name(item_name) = public.normalize_branch_item_name(p_legacy_name)
          )
        )
      )
    );

  if v_survivor is null then
    return null;
  end if;

  delete from public.branch_thresholds
  where branch = p_branch
    and id::text <> v_survivor
    and (
      item_barcode = p_barcode
      or (
        item_barcode is null
        and (
          public.normalize_branch_item_name(item_name) = public.normalize_branch_item_name(v_item.name)
          or (
            nullif(public.normalize_branch_item_name(p_legacy_name), '') is not null
            and public.normalize_branch_item_name(item_name) = public.normalize_branch_item_name(p_legacy_name)
          )
        )
      )
    );

  update public.branch_thresholds
  set item_name = v_item.name,
      item_barcode = p_barcode,
      threshold = coalesce(v_threshold, threshold)
  where id::text = v_survivor
  returning * into v_row;

  return v_row;
end
$$;

create or replace function public.update_branch_item(
  p_branch text,
  p_barcode bigint,
  p_name text,
  p_price numeric,
  p_uom text,
  p_category text,
  p_active boolean,
  p_updated_by text default ''
)
returns public.branch_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.branch_items;
  v_new public.branch_items;
begin
  select * into v_old
  from public.branch_items
  where branch = p_branch and barcode = p_barcode
  for update;
  if not found then raise exception 'Item not found'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Item name is required'; end if;
  if p_price is null or p_price <= 0 then raise exception 'Price must be greater than zero'; end if;
  if p_uom not in ('Nos','Kgs') then raise exception 'Invalid unit'; end if;

  update public.branch_items
  set name = trim(p_name),
      price = p_price,
      uom = p_uom,
      category = trim(p_category),
      active = coalesce(p_active, true),
      updated_by = coalesce(p_updated_by, '')
  where branch = p_branch and barcode = p_barcode
  returning * into v_new;

  insert into public.branch_item_changes(
    branch, barcode, old_name, new_name, old_price, new_price,
    old_uom, new_uom, old_category, new_category, changed_by
  ) values (
    p_branch, p_barcode, v_old.name, v_new.name, v_old.price, v_new.price,
    v_old.uom, v_new.uom, v_old.category, v_new.category, coalesce(p_updated_by, '')
  );

  perform public.ensure_branch_stock_link(p_branch, p_barcode, v_old.name);
  perform public.ensure_branch_threshold_link(p_branch, p_barcode, v_old.name);

  return v_new;
end
$$;

create or replace function public.decrement_branch_stock_by_barcode_strict(
  p_branch text,
  p_barcode bigint,
  p_qty numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_qty numeric;
  v_stock public.branch_stock;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;

  v_stock := public.ensure_branch_stock_link(p_branch, p_barcode, null);

  update public.branch_stock
  set quantity = round((quantity - p_qty)::numeric, 3)
  where id = v_stock.id and quantity >= p_qty
  returning quantity into v_new_qty;

  return v_new_qty;
end
$$;

create or replace function public.increment_branch_stock_by_barcode(
  p_branch text,
  p_barcode bigint,
  p_qty numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_qty numeric;
  v_stock public.branch_stock;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;

  v_stock := public.ensure_branch_stock_link(p_branch, p_barcode, null);

  update public.branch_stock
  set quantity = round((quantity + p_qty)::numeric, 3)
  where id = v_stock.id
  returning quantity into v_new_qty;

  return v_new_qty;
end
$$;

create or replace function public.create_branch_item(
  p_branch text,
  p_name text,
  p_price numeric,
  p_uom text,
  p_category text,
  p_updated_by text default ''
)
returns public.branch_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_barcode bigint;
  v_row public.branch_items;
  v_start bigint;
begin
  if p_branch not in ('SNB','VRSNB') then raise exception 'Invalid branch'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Item name is required'; end if;
  if p_price is null or p_price <= 0 then raise exception 'Price must be greater than zero'; end if;
  if p_uom not in ('Nos','Kgs') then raise exception 'Invalid unit'; end if;

  perform pg_advisory_xact_lock(hashtext('branch-items-' || p_branch));
  v_start := case when p_branch = 'SNB' then 1000 else 2000 end;
  select greatest(v_start, coalesce(max(barcode), v_start)) + 1
    into v_barcode
  from public.branch_items
  where branch = p_branch;

  insert into public.branch_items(branch, barcode, name, price, uom, category, active, updated_by)
  values(p_branch, v_barcode, trim(p_name), p_price, p_uom, trim(p_category), true, coalesce(p_updated_by, ''))
  returning * into v_row;

  perform public.ensure_branch_stock_link(p_branch, v_barcode, null);
  return v_row;
end
$$;

grant execute on function public.normalize_branch_item_name(text) to anon, authenticated;
grant execute on function public.create_branch_item(text,text,numeric,text,text,text) to anon, authenticated;
grant execute on function public.ensure_branch_stock_link(text,bigint,text) to anon, authenticated;
grant execute on function public.ensure_branch_threshold_link(text,bigint,text) to anon, authenticated;
grant execute on function public.update_branch_item(text,bigint,text,numeric,text,text,boolean,text) to anon, authenticated;
grant execute on function public.decrement_branch_stock_by_barcode_strict(text,bigint,numeric) to anon, authenticated;
grant execute on function public.increment_branch_stock_by_barcode(text,bigint,numeric) to anon, authenticated;
