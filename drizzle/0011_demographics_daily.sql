-- Demographics become a DAILY series so a report can re-aggregate them over any
-- date range. Previously one row per (ad, dimension, segment) held a whole-window
-- snapshot, which could not be sliced by date at all.
--
-- Existing rows carry no date and cannot be attributed to one, so they are
-- discarded; the next Meta sync repopulates from the API with time_increment=1.
delete from ad_demographic_metrics;

alter table ad_demographic_metrics
  add column if not exists as_of_date date not null default current_date;

alter table ad_demographic_metrics
  alter column as_of_date drop default;

-- Drop whatever the existing primary key is called (drizzle-generated names
-- differ between environments) and rebuild it to include the day.
do $$
declare
  pk_name text;
begin
  select conname into pk_name
  from pg_constraint
  where conrelid = 'public.ad_demographic_metrics'::regclass and contype = 'p';

  if pk_name is not null then
    execute format('alter table ad_demographic_metrics drop constraint %I', pk_name);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ad_demographic_metrics'::regclass and contype = 'p'
  ) then
    execute 'alter table ad_demographic_metrics
             add constraint ad_demographic_metrics_pk
             primary key (ad_id, as_of_date, dimension, segment)';
  end if;
end $$;

-- Reports filter by date first, then group by dimension.
create index if not exists ad_demographic_metrics_date_idx
  on ad_demographic_metrics (as_of_date);
create index if not exists ad_demographic_metrics_dim_idx
  on ad_demographic_metrics (dimension, as_of_date);
