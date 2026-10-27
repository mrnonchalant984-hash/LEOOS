-- Browser Game Studio: bounded repair tracking and project-linked private asset metadata.
alter table public.projects
  add column if not exists game_repair_attempts integer not null default 0 check (game_repair_attempts between 0 and 2),
  add column if not exists game_generation_count integer not null default 0 check (game_generation_count >= 0),
  add column if not exists game_generation_period date not null default date_trunc('month', now())::date;

create index if not exists idx_media_assets_game_project
  on public.media_assets(user_id, ((metadata ->> 'project_id')), created_at desc)
  where metadata ? 'project_id';


-- Reserve one monthly build allowance for each explicit AI game-generation request.
create or replace function public.reserve_browser_game_generation(
  p_project_id uuid,
  p_user_id uuid,
  p_monthly_limit integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_month date := date_trunc('month', now())::date;
begin
  update public.projects
  set game_generation_count = case
        when game_generation_period = current_month then game_generation_count + 1
        else 1
      end,
      game_generation_period = current_month
  where id = p_project_id
    and user_id = p_user_id
    and type = 'game'
    and (
      p_monthly_limit >= 2147483647
      or game_generation_period is distinct from current_month
      or game_generation_count < greatest(0, p_monthly_limit)
    );
  return found;
end;
$$;

revoke all on function public.reserve_browser_game_generation(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_browser_game_generation(uuid, uuid, integer) to service_role;
