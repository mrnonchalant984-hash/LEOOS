-- Run against staging after applying 20261111140000_leox_store_launch_workflows.sql.
-- This checks schema posture only. Follow the account-to-account RLS test matrix in docs/LEOX_STORE_LAUNCH_CHECKLIST.md.
with expected(table_name) as (values
  ('marketplace_fulfillments'),('marketplace_disputes'),('marketplace_report_appeals'),
  ('marketplace_seller_verification_requests'),('marketplace_support_tickets'),('marketplace_notifications'),
  ('marketplace_consents'),('marketplace_data_requests'),('marketplace_prohibited_terms')
)
select e.table_name,
       coalesce(c.relrowsecurity,false) as rls_enabled,
       coalesce(c.relforcerowsecurity,false) as force_rls,
       count(distinct p.policyname) as policy_count,
       has_table_privilege('anon', 'public.'||e.table_name, 'select') as anon_can_select,
       has_table_privilege('authenticated', 'public.'||e.table_name, 'select') as authenticated_can_select,
       has_table_privilege('service_role', 'public.'||e.table_name, 'select') as service_role_can_select
from expected e
left join pg_class c on c.oid = to_regclass('public.'||e.table_name)
left join pg_policies p on p.schemaname='public' and p.tablename=e.table_name
group by e.table_name,c.relrowsecurity,c.relforcerowsecurity
order by e.table_name;

-- Expected: every table exists and has RLS enabled; anon has no access; service_role can read/write.
-- Participant policies intentionally differ by table. Inspect pg_policies.policyname/qual/with_check,
-- then verify buyer A cannot see buyer B's data and seller A cannot see seller B's data using real staging accounts.
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname='public' and tablename in (
  'marketplace_fulfillments','marketplace_disputes','marketplace_report_appeals',
  'marketplace_seller_verification_requests','marketplace_support_tickets','marketplace_notifications',
  'marketplace_consents','marketplace_data_requests','marketplace_prohibited_terms'
)
order by tablename, policyname;
