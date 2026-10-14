-- Additive project-scoped memory. Global user memories remain compatible.
alter table public.leo_memories
  add column if not exists project_id uuid references public.projects(id) on delete cascade;

create index if not exists idx_leo_memories_project_user_active
  on public.leo_memories(user_id, project_id, active, updated_at desc);

-- Explicitly retain tenant isolation. Project ownership is also verified in the API.
drop policy if exists leo_memories_self on public.leo_memories;
create policy leo_memories_self on public.leo_memories
  for all
  using (auth.uid() = user_id or public.is_owner(auth.uid()))
  with check (auth.uid() = user_id or public.is_owner(auth.uid()));
