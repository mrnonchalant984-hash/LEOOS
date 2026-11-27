-- Extend the existing private GitHub Actions runtime to support bounded browser jobs.
alter table public.private_runtime_jobs
  drop constraint if exists private_runtime_jobs_kind_check;

alter table public.private_runtime_jobs
  add constraint private_runtime_jobs_kind_check
  check (kind in ('workspace','leocode','skill','repository','browser'));
