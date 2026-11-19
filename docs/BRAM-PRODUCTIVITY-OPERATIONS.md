# Bram Productivity Operations

## Scheduling architecture

Bram reminders and scheduled workflows are dispatched by Supabase Cron, not Vercel Cron. The connected Vercel team is on the Hobby plan, so Vercel's static cron schedule is not suitable for five-minute polling.

The forward migration installs `pg_cron` and `pg_net`, creates the reminder/calendar tables and the durable queue functions, and registers two five-minute jobs:
- `bram-reminder-delivery` -> `POST /api/cron/bram-productivity`
- `bram-workflow-worker` -> `POST /api/internal/workflow-worker`

Both jobs are deliberately created **inactive**. Do not activate them until the matching application code has been deployed to the production alias `https://leoos-omega.vercel.app`.

## Required secret

The production Vercel project has a sensitive `BRAM_SCHEDULER_SECRET` environment variable. The same value is stored in Supabase Vault under `bram_scheduler_secret`. Never copy the value into source code, migrations, logs, chat messages, or workflow payloads.

Both worker endpoints accept this dedicated bearer token. The existing `CRON_SECRET` remains supported for compatibility.

## Release activation

After the code is deployed and the endpoint health checks pass, activate the two jobs in Supabase:

```sql
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'bram-reminder-delivery'),
  active := true
);

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'bram-workflow-worker'),
  active := true
);
```

Verify status and execution history:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname in ('bram-reminder-delivery', 'bram-workflow-worker')
order by jobname;

select j.jobname, r.status, r.start_time, r.end_time, r.return_message
from cron.job_run_details r
join cron.job j on j.jobid = r.jobid
where j.jobname in ('bram-reminder-delivery', 'bram-workflow-worker')
order by r.start_time desc
limit 30;
```

The `net._http_response` table can be inspected for the HTTP status of dispatched requests. Do not expose its request headers or Vault secrets in diagnostics.

## Reminder delivery

Every reminder is stored with its IANA timezone and recurrence. The worker claims due reminders using a lease and `FOR UPDATE SKIP LOCKED`, writes an idempotent in-app delivery record, optionally sends email through Resend, and advances the next occurrence in local wall-clock time. Failed provider calls are rescheduled with bounded exponential backoff.

The current production Vercel environment does not contain `RESEND_API_KEY` or `CONTACT_FROM_EMAIL`. In-app delivery records are therefore the available delivery channel until the owner configures an email provider. The API exposes reminder delivery history to the signed-in owner.

## Daily and weekly workflows

Workflow trigger configurations support:
- `interval` with a bounded 15–1440 minute interval
- `daily` at an IANA timezone-local `HH:mm`
- `weekly` at an IANA timezone-local `HH:mm` and weekday

The database scheduler computes the next occurrence in the configured timezone, while the worker claims up to five queue items per invocation. Cancelled runs release their leases. A workflow is not considered fully accepted until the run and each step have persisted a non-empty result.

## Acceptance boundary

The database migration and scheduler registration can be verified before release. Actual reminder delivery, calendar CRUD through Bram, and scheduled AI workflow execution require the application code to be deployed. The cron jobs remain inactive until that release gate is completed.
