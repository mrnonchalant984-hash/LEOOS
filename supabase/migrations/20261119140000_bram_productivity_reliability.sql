-- Supabase Cron provides sub-daily scheduling on the Hobby Vercel project.
create extension if not exists pg_cron with schema pg_catalog;
create schema if not exists extensions;
create extension if not exists pg_net with schema extensions;

-- Bram productivity: persistent reminders, calendar events and reliable queue recovery.
-- Additive, owner-scoped schema. Delivery is driven by the authenticated Vercel cron worker.

create table if not exists public.bram_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  body text not null default '' check (char_length(body) <= 4000),
  scheduled_for timestamptz not null,
  timezone text not null check (char_length(timezone) between 1 and 80),
  recurrence jsonb not null default '{"frequency":"once"}'::jsonb,
  status text not null default 'scheduled' check (status in ('scheduled','processing','delivered','cancelled','failed')),
  next_run_at timestamptz not null,
  lease_owner text,
  lease_expires_at timestamptz,
  delivery_attempts integer not null default 0 check (delivery_attempts >= 0),
  last_delivery_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(recurrence) = 'object'),
  check (recurrence->>'frequency' in ('once','daily','weekly','monthly'))
);
create index if not exists bram_reminders_due_idx
  on public.bram_reminders(status,next_run_at)
  where status in ('scheduled','processing');
create index if not exists bram_reminders_user_idx
  on public.bram_reminders(user_id,next_run_at desc);
alter table public.bram_reminders enable row level security;
drop policy if exists bram_reminders_owner_select on public.bram_reminders;
create policy bram_reminders_owner_select on public.bram_reminders
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists bram_reminders_owner_insert on public.bram_reminders;
create policy bram_reminders_owner_insert on public.bram_reminders
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists bram_reminders_owner_update on public.bram_reminders;
create policy bram_reminders_owner_update on public.bram_reminders
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select,insert,update on public.bram_reminders to authenticated;
revoke all on public.bram_reminders from anon;

create table if not exists public.bram_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.bram_reminders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_for timestamptz not null,
  channel text not null check (channel in ('in_app','email')),
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  provider_message_id text,
  error_code text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique(reminder_id,scheduled_for,channel)
);
create index if not exists bram_reminder_deliveries_user_idx
  on public.bram_reminder_deliveries(user_id,created_at desc);
alter table public.bram_reminder_deliveries enable row level security;
drop policy if exists bram_reminder_deliveries_owner_select on public.bram_reminder_deliveries;
create policy bram_reminder_deliveries_owner_select on public.bram_reminder_deliveries
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.bram_reminder_deliveries to authenticated;
revoke all on public.bram_reminder_deliveries from anon;

create table if not exists public.bram_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  description text not null default '' check (char_length(description) <= 4000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null check (char_length(timezone) between 1 and 80),
  location text not null default '' check (char_length(location) <= 500),
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  source text not null default 'bram' check (source in ('bram','google','outlook','mcp')),
  external_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists bram_calendar_events_user_start_idx
  on public.bram_calendar_events(user_id,starts_at)
  where status = 'confirmed';
create unique index if not exists bram_calendar_events_external_unique
  on public.bram_calendar_events(user_id,source,external_event_id)
  where external_event_id is not null;
alter table public.bram_calendar_events enable row level security;
drop policy if exists bram_calendar_events_owner_all on public.bram_calendar_events;
create policy bram_calendar_events_owner_all on public.bram_calendar_events
  for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select,insert,update,delete on public.bram_calendar_events to authenticated;
revoke all on public.bram_calendar_events from anon;

-- A lease-based claim lets multiple cron invocations safely share the reminder queue.
create or replace function public.claim_due_bram_reminders(p_worker text, p_limit integer default 25, p_lease_seconds integer default 120)
returns setof public.bram_reminders
language plpgsql security definer set search_path = public as $$
begin
  if p_worker is null or length(p_worker) < 3 or length(p_worker) > 120
     or p_limit < 1 or p_limit > 100 or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'invalid reminder claim parameters';
  end if;
  return query
  with candidates as (
    select id from public.bram_reminders
    where (status = 'scheduled' and next_run_at <= now())
       or (status = 'processing' and lease_expires_at < now())
    order by next_run_at,created_at
    limit p_limit for update skip locked
  )
  update public.bram_reminders r
  set status='processing',lease_owner=p_worker,
      lease_expires_at=now()+make_interval(secs=>p_lease_seconds),
      delivery_attempts=r.delivery_attempts+1,updated_at=now()
  from candidates c where r.id=c.id
  returning r.*;
end;
$$;
revoke all on function public.claim_due_bram_reminders(text,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_due_bram_reminders(text,integer,integer) to service_role;

-- Ensure worker-only queue functions cannot be invoked by browser roles.
revoke all on function public.enqueue_due_workflows(integer) from public,anon,authenticated;
grant execute on function public.enqueue_due_workflows(integer) to service_role;
revoke all on function public.claim_workflow_jobs(text,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_workflow_jobs(text,integer,integer) to service_role;

create index if not exists workflow_runs_workflow_created_idx
  on public.workflow_runs(workflow_id,created_at desc);
create index if not exists workflow_jobs_lease_expiry_idx
  on public.workflow_jobs(lease_expires_at)
  where status='leased';

-- Extend the existing durable scheduler to timezone-aware daily and weekly triggers.
create or replace function public.enqueue_due_workflows(p_limit integer default 10)
returns integer language plpgsql security definer set search_path = public as $$
declare
  w record;
  run_id uuid;
  inserted_count integer := 0;
  interval_minutes integer;
  scan_time timestamptz := now();
  tz text;
  local_time time;
  local_date date;
  weekday integer;
  days_ahead integer;
  next_local timestamp without time zone;
begin
  if p_limit < 1 or p_limit > 50 then raise exception 'invalid schedule scan limit'; end if;
  for w in
    select id,user_id,trigger_config,next_run_at from public.workflows
    where status = 'active'
      and trigger_config->>'type' in ('interval','daily','weekly')
      and next_run_at is not null and next_run_at <= scan_time
    order by next_run_at,created_at
    limit p_limit for update skip locked
  loop
    insert into public.workflow_runs(workflow_id,user_id,status,input)
      values (w.id,w.user_id,'queued',jsonb_build_object('trigger',w.trigger_config->>'type','scheduled_at',w.next_run_at))
      returning id into run_id;

    if w.trigger_config->>'type' = 'interval' then
      if coalesce(w.trigger_config->>'every_minutes','') ~ '^[0-9]{1,4}$' then
        interval_minutes := greatest(15, least(1440, (w.trigger_config->>'every_minutes')::integer));
      else
        interval_minutes := 60;
      end if;
      update public.workflows set next_run_at = scan_time + make_interval(mins => interval_minutes), updated_at = scan_time where id = w.id;
    else
      tz := coalesce(w.trigger_config->>'timezone','UTC');
      if not exists(select 1 from pg_timezone_names where name = tz) then tz := 'UTC'; end if;
      if coalesce(w.trigger_config->>'time','') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        local_time := (w.trigger_config->>'time')::time;
      else
        local_time := time '09:00';
      end if;
      local_date := (scan_time at time zone tz)::date;
      next_local := local_date + local_time;
      if w.trigger_config->>'type' = 'daily' then
        if next_local at time zone tz <= scan_time then next_local := next_local + interval '1 day'; end if;
      else
        if coalesce(w.trigger_config->>'weekday','') ~ '^[0-6]$' then
          weekday := (w.trigger_config->>'weekday')::integer;
        else
          weekday := 1;
        end if;
        days_ahead := (weekday - extract(dow from local_date)::integer + 7) % 7;
        next_local := (local_date + days_ahead) + local_time;
        if next_local at time zone tz <= scan_time then next_local := next_local + interval '7 days'; end if;
      end if;
      update public.workflows set next_run_at = next_local at time zone tz, updated_at = scan_time where id = w.id;
    end if;
    inserted_count := inserted_count + 1;
  end loop;
  return inserted_count;
end;
$$;
revoke all on function public.enqueue_due_workflows(integer) from public,anon,authenticated;
grant execute on function public.enqueue_due_workflows(integer) to service_role;

-- Browser clients can only read their own reminders and delivery history.
-- All reminder writes and worker claims go through authenticated server routes/service_role.
drop policy if exists bram_reminders_owner_insert on public.bram_reminders;
drop policy if exists bram_reminders_owner_update on public.bram_reminders;
revoke insert,update,delete on public.bram_reminders from authenticated;
grant select on public.bram_reminders to authenticated;
grant all on public.bram_reminders to service_role;
grant all on public.bram_reminder_deliveries to service_role;
grant all on public.bram_calendar_events to service_role;
grant select,insert,update,delete on public.workflows,public.workflow_runs,public.workflow_jobs to service_role;

-- Register production worker schedules but keep them disabled until the application
-- code is deployed. The bearer token is stored only in Supabase Vault.
do $bram_cron$
begin
  if not exists (select 1 from cron.job where jobname = 'bram-reminder-delivery') then
    perform cron.schedule(
      'bram-reminder-delivery',
      '*/5 * * * *',
      $bram_job$
        select net.http_post(
          url := 'https://leoos-omega.vercel.app/api/cron/bram-productivity',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'bram_scheduler_secret'),
            'Content-Type', 'application/json'
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 15000
        );
      $bram_job$
    );
  end if;
  if not exists (select 1 from cron.job where jobname = 'bram-workflow-worker') then
    perform cron.schedule(
      'bram-workflow-worker',
      '*/5 * * * *',
      $bram_job$
        select net.http_post(
          url := 'https://leoos-omega.vercel.app/api/internal/workflow-worker',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'bram_scheduler_secret'),
            'Content-Type', 'application/json'
          ),
          body := '{"limit":5}'::jsonb,
          timeout_milliseconds := 15000
        );
      $bram_job$
    );
  end if;
end;
$bram_cron$;

update cron.job set active = false
where jobname in ('bram-reminder-delivery','bram-workflow-worker');
