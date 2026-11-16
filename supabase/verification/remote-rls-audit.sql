-- READ-ONLY remote Supabase security inventory. Run in the target project's SQL Editor.
-- This does not alter data, grants, policies, or schema.
with public_tables as (
  select c.oid, n.nspname as schema_name, c.relname as table_name,
         c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p')
), policy_counts as (
  select schemaname, tablename, count(*) as policy_count,
         string_agg(distinct roles::text, ', ' order by roles::text) as policy_roles
  from pg_policies where schemaname = 'public' group by schemaname, tablename
), owner_columns as (
  select table_schema, table_name,
         string_agg(column_name, ', ' order by column_name) as ownership_columns
  from information_schema.columns
  where table_schema = 'public' and column_name in
    ('user_id','owner_user_id','created_by','seller_user_id','buyer_user_id')
  group by table_schema, table_name
)
select t.schema_name, t.table_name, t.rls_enabled, t.force_rls,
       coalesce(p.policy_count, 0) as policy_count,
       coalesce(p.policy_roles, '') as policy_roles,
       coalesce(o.ownership_columns, '') as ownership_columns,
       has_table_privilege('anon', t.oid, 'select') as anon_can_select,
       has_table_privilege('authenticated', t.oid, 'select') as authenticated_can_select,
       case when not t.rls_enabled and (
         has_table_privilege('anon', t.oid, 'select') or
         has_table_privilege('authenticated', t.oid, 'select')
       ) then 'CRITICAL: exposed table without RLS'
       when t.rls_enabled and coalesce(p.policy_count, 0) = 0 then 'REVIEW: RLS enabled but no policies'
       when not t.rls_enabled then 'REVIEW: RLS disabled'
       else 'REVIEW POLICIES FOR TENANT ISOLATION' end as audit_finding
from public_tables t
left join policy_counts p on p.schemaname = t.schema_name and p.tablename = t.table_name
left join owner_columns o on o.table_schema = t.schema_name and o.table_name = t.table_name
order by case when not t.rls_enabled and (has_table_privilege('anon',t.oid,'select') or has_table_privilege('authenticated',t.oid,'select')) then 0 else 1 end,
         t.table_name;

-- Storage bucket inventory (read-only).
select id as bucket_id, name, public, file_size_limit, allowed_mime_types
from storage.buckets order by name;
