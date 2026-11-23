alter table public.cloudflare_preview_jobs
  drop constraint if exists cloudflare_preview_jobs_error_code_check;

alter table public.cloudflare_preview_jobs
  add constraint cloudflare_preview_jobs_error_code_check
  check (
    error_code is null
    or error_code = any (
      array[
        'preview_build_failed',
        'preview_deploy_failed',
        'preview_not_ready',
        'preview_worker_timeout',
        'preview_worker_configuration_failed'
      ]::text[]
    )
  );
