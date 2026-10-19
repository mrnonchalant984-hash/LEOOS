-- Persist the EAS project identity and verified artifacts for owner-scoped cloud builds.
do $$
begin
  update storage.buckets
     set public = false,
         file_size_limit = greatest(coalesce(file_size_limit, 0), 157286400)
   where id = 'leo-files';
  if not found then
    raise exception 'Required leo-files Storage bucket is missing; create it before applying the Expo artifact migration.';
  end if;
end;
$$;

alter table public.cloud_build_jobs
  add column if not exists provider_project_id text,
  add column if not exists artifact_expected_type text,
  add column if not exists artifact_storage_path text,
  add column if not exists artifact_size_bytes bigint,
  add column if not exists artifact_sha256 text,
  add column if not exists artifact_content_type text,
  add column if not exists artifact_file_name text,
  add column if not exists artifact_expires_at timestamptz,
  add column if not exists artifact_verified_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cloud_build_jobs_artifact_size_positive') then
    alter table public.cloud_build_jobs add constraint cloud_build_jobs_artifact_size_positive
      check (artifact_size_bytes is null or artifact_size_bytes > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cloud_build_jobs_artifact_sha256_valid') then
    alter table public.cloud_build_jobs add constraint cloud_build_jobs_artifact_sha256_valid
      check (artifact_sha256 is null or artifact_sha256 ~ '^[a-f0-9]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cloud_build_jobs_artifact_type_valid') then
    alter table public.cloud_build_jobs add constraint cloud_build_jobs_artifact_type_valid
      check (artifact_expected_type is null or artifact_expected_type in ('apk','aab','ipa'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cloud_build_jobs_provider_project_id_valid') then
    alter table public.cloud_build_jobs add constraint cloud_build_jobs_provider_project_id_valid
      check (provider_project_id is null or provider_project_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
  end if;
end;
$$;

create index if not exists cloud_build_jobs_artifact_expiry_idx
  on public.cloud_build_jobs(artifact_expires_at)
  where artifact_storage_path is not null;