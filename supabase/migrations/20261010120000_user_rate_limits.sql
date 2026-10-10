-- Shared, atomic per-user rate-limit buckets for serverless handlers.
-- The service role is the only writer; callers authenticate before consuming.
create table if not exists public.user_rate_limits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  bucket text not null check (length(bucket) between 1 and 80),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, bucket)
);

alter table public.user_rate_limits enable row level security;
revoke all on table public.user_rate_limits from public, anon, authenticated;
grant all on table public.user_rate_limits to service_role;

create or replace function public.consume_user_rate_limit(
  p_user_id uuid,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts timestamptz := clock_timestamp();
  used integer;
begin
  if p_user_id is null or p_bucket is null or length(p_bucket) not between 1 and 80
     or p_limit is null or p_limit < 1 or p_limit > 1000000
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate-limit parameters';
  end if;

  insert into public.user_rate_limits as current_bucket
    (user_id, bucket, window_started_at, request_count, updated_at)
  values (p_user_id, p_bucket, now_ts, 1, now_ts)
  on conflict (user_id, bucket) do update
  set window_started_at = case
        when current_bucket.window_started_at + make_interval(secs => p_window_seconds) <= now_ts then now_ts
        else current_bucket.window_started_at
      end,
      request_count = case
        when current_bucket.window_started_at + make_interval(secs => p_window_seconds) <= now_ts then 1
        else least(p_limit + 1, current_bucket.request_count + 1)
      end,
      updated_at = now_ts
  returning request_count into used;

  return used <= p_limit;
end;
$$;

revoke all on function public.consume_user_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_user_rate_limit(uuid, text, integer, integer) to service_role;
