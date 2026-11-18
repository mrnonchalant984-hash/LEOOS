alter table public.mcp_remote_tool_approvals
  add column if not exists access_level text not null default 'read';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'mcp_remote_tool_approvals_access_level_check'
      and conrelid = 'public.mcp_remote_tool_approvals'::regclass
  ) then
    alter table public.mcp_remote_tool_approvals
      add constraint mcp_remote_tool_approvals_access_level_check
      check (access_level in ('read', 'write'));
  end if;
end
$$;
