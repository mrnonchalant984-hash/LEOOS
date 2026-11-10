alter table public.mcp_remote_tool_approvals
  add column if not exists allowed_agent_ids text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'mcp_remote_tool_approvals_agent_ids_limit'
      and conrelid = 'public.mcp_remote_tool_approvals'::regclass
  ) then
    alter table public.mcp_remote_tool_approvals
      add constraint mcp_remote_tool_approvals_agent_ids_limit
      check (cardinality(allowed_agent_ids) <= 20);
  end if;
end
$$;
