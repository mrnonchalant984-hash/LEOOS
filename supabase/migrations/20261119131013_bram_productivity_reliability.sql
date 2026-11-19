-- Bram productivity reliability: private calendar events, durable reminders,
-- delivery attempts, and an atomic worker claim function.
create table if not exists public.bram_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  description text not null default '' check (char_length(description) <= 4000),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  timezone text not null check (char_length(timezone) between 1 and 80),
  location text not null default '' check (char_length(location) <= 500),
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  source text not null default 'bram' check (source in ('bram','google','outlook','mcp')),
  external_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists bram_calendar_events_external_unique
  on public.bram_calendar_events(user_id,source,external_event_id) where external_event_id is not null;
create index if not exists bram_calendar_events_user_start_idx
  on public.bram_calendar_events(user_id,starts_at) where status='confirmed';
alter table public.bram_calendar_events enable row level security;
drop policy if exists bram_calendar_events_owner_all on public.bram_calendar_events;
create policy bram_calendar_events_owner_all on public.bram_calendar_events
  for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
grant select,insert,update,delete on public.bram_calendar_events to authenticated;
grant select,insert,update,delete on public.bram_calendar_events to service_role;

create table if not exists public.bram_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  body text not null default '' check (char_length(body) <= 4000),
  scheduled_for timestamptz not null,
  timezone text not null check (char_length(timezone) between 1 and 80),
  recurrence jsonb not null default '{"frequency":"once"}'::jsonb
    check (jsonb_typeof(recurrence)='object')
    check (recurrence->>'frequency' in ('once','daily','weekly','monthly')),
  status text not null default 'scheduled' check (status in ('scheduled','processing','delivered','cancelled','failed')),
  next_run_at timestamptz not null,
  lease_owner text,
  lease_expires_at timestamptz,
  delivery_attempts integer not null default 0 check (delivery_attempts >= 0),
  last_delivery_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bram_reminders_due_idx
  on public.bram_reminders(status,next_run_at) where status in ('scheduled','processing');
create index if not exists bram_reminders_user_idx
  on public.bram_reminders(user_id,next_run_at desc);
alter table public.bram_reminders enable row level security;
drop policy if exists bram_reminders_owner_select on public.bram_reminders;
create policy bram_reminders_owner_select on public.bram_reminders
  for select to authenticated using (user_id=(select auth.uid()));
grant select on public.bram_reminders to authenticated;
grant select,insert,update,delete on public.bram_reminders to service_role;

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
  for select to authenticated using (user_id=(select auth.uid()));
grant select on public.bram_reminder_deliveries to authenticated;
grant select,insert,update,delete on public.bram_reminder_deliveries to service_role;

create or replace function public.claim_due_bram_reminders(
  p_worker text,
  p_limit integer default 25,
  p_lease_seconds integer default 120
) returns setof public.bram_reminders
language plpgsql security definer set search_path=public as $$
begin
  if p_worker is null or length(p_worker)<3 or length(p_worker)>120
     or p_limit<1 or p_limit>100 or p_lease_seconds<30 or p_lease_seconds>900 then
    raise exception 'invalid reminder claim parameters';
  end if;
  return query
  with candidates as (
    select id from public.bram_reminders
    where (status='scheduled' and next_run_at<=now())
       or (status='processing' and lease_expires_at<now())
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
